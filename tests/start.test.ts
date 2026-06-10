import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { parseIndex } from '../src/lib/index-parser.js';
import { setIssueState } from '../src/lib/track.js';
import { makeStartCommand, renderStart } from '../src/commands/start.js';
import { getMessages } from '../src/lib/messages.js';

const INDEX_FIXTURE = `# Issues — Pricing Engine

## All issues

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
- [~] [03 — Add API](03-add-api.md) — blocked by: 01, 02
`;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'midas-start-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function makeSpec(): Promise<string> {
  const issuesDir = join(dir, 'pricing-engine', 'issues');
  await mkdir(issuesDir, { recursive: true });
  const indexPath = join(issuesDir, 'INDEX.md');
  await writeFile(indexPath, INDEX_FIXTURE, 'utf8');
  return indexPath;
}

describe('parseIndex with [~]', () => {
  it('parses the in-progress state and keeps done derived', () => {
    const issues = parseIndex(INDEX_FIXTURE);
    expect(issues.map((i) => i.state)).toEqual(['todo', 'done', 'in-progress']);
    expect(issues.map((i) => i.done)).toEqual([false, true, false]);
  });
});

describe('setIssueState', () => {
  it('marks a todo issue as in progress in INDEX.md', async () => {
    const indexPath = await makeSpec();

    const outcome = await setIssueState(dir, 'pricing-engine', '01', 'in-progress');

    expect(outcome).toMatchObject({
      number: '01',
      state: 'in-progress',
      done: false,
      changed: true,
      newlyReady: [],
    });
    const written = await readFile(indexPath, 'utf8');
    expect(written).toContain('- [~] [01 — Set up schema]');
    expect(written).toContain('- [x] [02 — Build calculator]');
  });

  it('is idempotent on an already in-progress issue', async () => {
    const indexPath = await makeSpec();
    const mtimeBefore = (await stat(indexPath)).mtimeMs;

    const outcome = await setIssueState(dir, 'pricing-engine', '03', 'in-progress');

    expect(outcome.changed).toBe(false);
    expect((await stat(indexPath)).mtimeMs).toBe(mtimeBefore);
  });

  it('rejects starting a done issue, pointing at reopen', async () => {
    const indexPath = await makeSpec();
    const before = await readFile(indexPath, 'utf8');

    let caught: unknown;
    try {
      await setIssueState(dir, 'pricing-engine', '02', 'in-progress');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain('midas reopen');
    expect(await readFile(indexPath, 'utf8')).toBe(before);
  });

  it('done on an in-progress issue completes it and reports newly ready', async () => {
    const indexPath = await makeSpec();
    // 03 starts as [~] in the fixture; reset it so it can become newly ready
    // (an in-progress issue is already taken and never reported as ready).
    await setIssueState(dir, 'pricing-engine', '03', 'todo');
    await setIssueState(dir, 'pricing-engine', '01', 'in-progress');

    const outcome = await setIssueState(dir, 'pricing-engine', '01', 'done');

    expect(outcome.changed).toBe(true);
    expect(outcome.newlyReady.map((i) => i.number)).toEqual(['03']);
    const parsed = parseIndex(await readFile(indexPath, 'utf8'));
    expect(parsed.find((i) => i.number === '01')!.state).toBe('done');
  });

  it('does not report an in-progress dependent as newly ready', async () => {
    await makeSpec();

    const outcome = await setIssueState(dir, 'pricing-engine', '01', 'done');

    expect(outcome.newlyReady).toEqual([]);
  });

  it('reopen (todo) on an in-progress issue clears the marker', async () => {
    const indexPath = await makeSpec();

    const outcome = await setIssueState(dir, 'pricing-engine', '03', 'todo');

    expect(outcome.changed).toBe(true);
    const parsed = parseIndex(await readFile(indexPath, 'utf8'));
    expect(parsed.find((i) => i.number === '03')!.state).toBe('todo');
  });
});

describe('renderStart', () => {
  const base = {
    slug: 's',
    number: '01',
    title: 'Set up schema',
    state: 'in-progress' as const,
    done: false,
    newlyReady: [],
  };

  it('reports the issue as started', () => {
    const out = renderStart({ ...base, changed: true }, getMessages());
    expect(out).toContain('Marked 01 — Set up schema as in progress.');
  });

  it('reports an already started issue', () => {
    const out = renderStart({ ...base, changed: false }, getMessages());
    expect(out).toContain('01 — Set up schema is already in progress.');
  });
});

describe('command wiring', () => {
  function makeProgram(): Command {
    const program = new Command('midas')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeStartCommand());
    return program;
  }

  async function runCapture(args: string[]): Promise<string> {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
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

  async function makeProjectSpec(): Promise<string> {
    const specDir = join(dir, '.midas', 'specs', 'pricing-engine', 'issues');
    await mkdir(specDir, { recursive: true });
    const indexPath = join(specDir, 'INDEX.md');
    await writeFile(indexPath, INDEX_FIXTURE, 'utf8');
    return indexPath;
  }

  it('start --json emits the outcome payload and marks [~]', async () => {
    const indexPath = await makeProjectSpec();

    const out = await runCapture(['start', 'pricing-engine', '1', '--json']);

    const payload = JSON.parse(out) as { number: string; state: string; changed: boolean };
    expect(payload.number).toBe('01');
    expect(payload.state).toBe('in-progress');
    expect(payload.changed).toBe(true);
    const parsed = parseIndex(await readFile(indexPath, 'utf8'));
    expect(parsed.find((i) => i.number === '01')!.state).toBe('in-progress');
  });
});
