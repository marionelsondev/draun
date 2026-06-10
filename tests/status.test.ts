import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { listSpecStatuses, parseIndex, readSpecStatus } from '../src/lib/index-parser.js';
import { makeStatusCommand, renderSpecDetail } from '../src/commands/status.js';
import { getMessages } from '../src/lib/messages.js';

// The status command resolves language via the global config in os.homedir();
// point the home at a temp dir so the real one never leaks in.
const mocked = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => mocked.home;
  return { ...os, homedir, default: { ...os, homedir } };
});

const INDEX_FIXTURE = `# Issues — Pricing Engine

## All issues

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
- [X] [03 — Add API](03-add-api.md) — blocked by: 01, 02
not a list line
- malformed line without checkbox

## Independent / parallelizable

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
`;

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'midas-status-'));
  home = await mkdtemp(join(tmpdir(), 'midas-status-home-'));
  mocked.home = home;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function makeSpec(slug: string, indexContent?: string, withIssuesDir = false): Promise<void> {
  const specDir = join(dir, slug);
  await mkdir(specDir, { recursive: true });
  if (indexContent !== undefined) {
    await mkdir(join(specDir, 'issues'), { recursive: true });
    await writeFile(join(specDir, 'issues', 'INDEX.md'), indexContent, 'utf8');
  } else if (withIssuesDir) {
    await mkdir(join(specDir, 'issues'), { recursive: true });
  }
}

describe('parseIndex', () => {
  it('parses checked, unchecked, and [X] lines from the All issues section only', () => {
    const issues = parseIndex(INDEX_FIXTURE);

    expect(issues).toHaveLength(3);
    expect(issues[0]).toEqual({
      number: '01',
      title: 'Set up schema',
      file: '01-set-up-schema.md',
      done: false,
      state: 'todo',
      blockedBy: [],
    });
    expect(issues[1].done).toBe(true);
    expect(issues[1].blockedBy).toEqual(['01']);
    expect(issues[2].done).toBe(true);
    expect(issues[2].blockedBy).toEqual(['01', '02']);
  });

  it('tolerates a missing blocked-by annotation', () => {
    const issues = parseIndex('## All issues\n- [ ] [05 — No blockers](05-x.md)\n');
    expect(issues).toHaveLength(1);
    expect(issues[0].blockedBy).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(parseIndex('')).toEqual([]);
  });

  it('returns [] for a heading-only file', () => {
    expect(parseIndex('# Issues\n\n## All issues\n')).toEqual([]);
  });
});

describe('readSpecStatus', () => {
  it('counts done and pending from the INDEX fixture', async () => {
    await makeSpec('pricing-engine', INDEX_FIXTURE);

    const status = await readSpecStatus(dir, 'pricing-engine');

    expect(status).toMatchObject({
      slug: 'pricing-engine',
      brokenDown: true,
      total: 3,
      done: 2,
      pending: 1,
    });
    expect(status.issues).toHaveLength(3);
  });

  it('treats a spec without issues/ as not broken down (no throw)', async () => {
    await makeSpec('bare-spec');

    const status = await readSpecStatus(dir, 'bare-spec');

    expect(status).toEqual({
      slug: 'bare-spec',
      brokenDown: false,
      total: 0,
      done: 0,
      inProgress: 0,
      pending: 0,
      issues: [],
    });
  });

  it('treats issues/ without INDEX.md as not broken down', async () => {
    await makeSpec('half-spec', undefined, true);

    const status = await readSpecStatus(dir, 'half-spec');
    expect(status.brokenDown).toBe(false);
  });

  it('marks INDEX with zero checkboxes as broken down with total 0', async () => {
    await makeSpec('empty-index', '# Issues\n\n## All issues\n');

    const status = await readSpecStatus(dir, 'empty-index');
    expect(status.brokenDown).toBe(true);
    expect(status.total).toBe(0);
  });

  it('counts in-progress issues separately from done and pending', async () => {
    const wipIndex = INDEX_FIXTURE.replace('- [ ] [01', '- [~] [01');
    await makeSpec('wip-engine', wipIndex);

    const status = await readSpecStatus(dir, 'wip-engine');

    expect(status).toMatchObject({ total: 3, done: 2, inProgress: 1, pending: 0 });
    expect(status.issues[0].state).toBe('in-progress');
  });

  it('rejects an unknown slug with a CliError naming the slug', async () => {
    let caught: unknown;
    try {
      await readSpecStatus(dir, 'nope');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('nope');
    expect((caught as CliError).exitCode).not.toBe(0);
  });
});

describe('listSpecStatuses', () => {
  it('lists multiple specs sorted by slug, mixing broken-down and not', async () => {
    await makeSpec('zeta', INDEX_FIXTURE);
    await makeSpec('alpha');

    const statuses = await listSpecStatuses(dir);

    expect(statuses.map((s) => s.slug)).toEqual(['alpha', 'zeta']);
    expect(statuses[0].brokenDown).toBe(false);
    expect(statuses[1].brokenDown).toBe(true);
    expect(statuses[1].total).toBe(3);
  });

  it('returns [] for an empty specs root', async () => {
    expect(await listSpecStatuses(dir)).toEqual([]);
  });

  it('returns [] for a missing specs root', async () => {
    expect(await listSpecStatuses(join(dir, 'does-not-exist'))).toEqual([]);
  });

  it('skips the archive directory and stray files', async () => {
    await makeSpec('real-spec');
    await mkdir(join(dir, 'archive'), { recursive: true });
    await writeFile(join(dir, 'stray.md'), 'not a spec\n', 'utf8');

    const statuses = await listSpecStatuses(dir);
    expect(statuses.map((s) => s.slug)).toEqual(['real-spec']);
  });
});

describe('renderSpecDetail', () => {
  it('shows the completion percentage and the in-progress marker', async () => {
    const wipIndex = INDEX_FIXTURE.replace('- [ ] [01', '- [~] [01');
    await makeSpec('wip-engine', wipIndex);
    const status = await readSpecStatus(dir, 'wip-engine');

    const out = renderSpecDetail(status, getMessages());

    expect(out).toContain('67%');
    expect(out).toContain('3 issues · 2 done · 1 in progress · 0 pending');
    expect(out).toContain('01 — Set up schema (in progress)');
  });
});

describe('makeStatusCommand', () => {
  function makeProgram(): Command {
    const program = new Command('midas')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeStatusCommand());
    return program;
  }

  async function runCapture(args: string[], cwd: string): Promise<string> {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    let out = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out += chunk.toString();
        return true;
      });
    try {
      await makeProgram().parseAsync(args, { from: 'user' });
    } finally {
      stdoutSpy.mockRestore();
      cwdSpy.mockRestore();
    }
    return out;
  }

  it('emits a single JSON doc listing specs with --json', async () => {
    const specsRoot = join(dir, '.midas', 'specs');
    await mkdir(join(specsRoot, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(specsRoot, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');

    const out = await runCapture(['status', '--json'], dir);

    const payload = JSON.parse(out) as { specs: Array<{ slug: string; total: number }> };
    expect(payload.specs).toHaveLength(1);
    expect(payload.specs[0].slug).toBe('pricing-engine');
    expect(payload.specs[0].total).toBe(3);
  });

  it('shows detail for a known slug with --json', async () => {
    const specsRoot = join(dir, '.midas', 'specs');
    await mkdir(join(specsRoot, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(specsRoot, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');

    const out = await runCapture(['status', 'pricing-engine', '--json'], dir);

    const payload = JSON.parse(out) as { slug: string; done: number; issues: unknown[] };
    expect(payload.slug).toBe('pricing-engine');
    expect(payload.done).toBe(2);
    expect(payload.issues).toHaveLength(3);
  });

  it('shows a not-broken-down spec without erroring', async () => {
    const specsRoot = join(dir, '.midas', 'specs');
    await mkdir(join(specsRoot, 'bare-spec'), { recursive: true });

    const out = await runCapture(['status', 'bare-spec'], dir);
    expect(out).toContain("Spec 'bare-spec' has not been broken down yet.");
  });

  it('rejects with CliError for an unknown slug', async () => {
    await mkdir(join(dir, '.midas', 'specs'), { recursive: true });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      await expect(
        makeProgram().parseAsync(['status', 'nope'], { from: 'user' }),
      ).rejects.toBeInstanceOf(CliError);
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
