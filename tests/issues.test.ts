import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import type { IndexIssue } from '../src/lib/index-parser.js';
import { filterIssues, listIssues, resolveIssues } from '../src/lib/issues.js';
import { makeIssuesCommand, renderIssues } from '../src/commands/issues.js';

const INDEX_FIXTURE = `# Issues — Pricing Engine

## All issues

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
- [ ] [03 — Add API](03-add-api.md) — blocked by: 01, 02
`;

function issue(partial: Partial<IndexIssue> & { number: string }): IndexIssue {
  return {
    title: `Issue ${partial.number}`,
    file: `${partial.number}-x.md`,
    done: false,
    blockedBy: [],
    ...partial,
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-issues-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('resolveIssues', () => {
  it('marks issues with no blockers as ready', () => {
    const resolved = resolveIssues([issue({ number: '01' })]);
    expect(resolved[0].state).toBe('ready');
    expect(resolved[0].pendingBlockers).toEqual([]);
  });

  it('marks issues as ready when all blockers are done', () => {
    const resolved = resolveIssues([
      issue({ number: '01', done: true }),
      issue({ number: '02', blockedBy: ['01'] }),
    ]);
    expect(resolved[1].state).toBe('ready');
  });

  it('marks issues as blocked with only the pending blocker subset', () => {
    const resolved = resolveIssues([
      issue({ number: '01', done: true }),
      issue({ number: '02' }),
      issue({ number: '03', blockedBy: ['01', '02'] }),
    ]);
    expect(resolved[2].state).toBe('blocked');
    expect(resolved[2].pendingBlockers).toEqual(['02']);
  });

  it('classifies done issues as done even with pending blockers', () => {
    const resolved = resolveIssues([
      issue({ number: '01' }),
      issue({ number: '02', done: true, blockedBy: ['01'] }),
    ]);
    expect(resolved[1].state).toBe('done');
  });

  it('treats a blocker referencing an unknown issue number as pending', () => {
    const resolved = resolveIssues([issue({ number: '01', blockedBy: ['99'] })]);
    expect(resolved[0].state).toBe('blocked');
    expect(resolved[0].pendingBlockers).toEqual(['99']);
  });

  it('marks both issues in a dependency cycle as blocked', () => {
    const resolved = resolveIssues([
      issue({ number: '01', blockedBy: ['02'] }),
      issue({ number: '02', blockedBy: ['01'] }),
    ]);
    expect(resolved.map((i) => i.state)).toEqual(['blocked', 'blocked']);
  });

  it('returns [] for empty input', () => {
    expect(resolveIssues([])).toEqual([]);
  });
});

describe('filterIssues', () => {
  const resolved = resolveIssues([
    issue({ number: '01' }),
    issue({ number: '02', done: true }),
    issue({ number: '03', blockedBy: ['01'] }),
  ]);

  it('returns everything for all', () => {
    expect(filterIssues(resolved, 'all')).toHaveLength(3);
  });

  it('filters ready, blocked, and done', () => {
    expect(filterIssues(resolved, 'ready').map((i) => i.number)).toEqual(['01']);
    expect(filterIssues(resolved, 'blocked').map((i) => i.number)).toEqual(['03']);
    expect(filterIssues(resolved, 'done').map((i) => i.number)).toEqual(['02']);
  });
});

describe('listIssues', () => {
  it('throws CliError(1) for an unknown slug', async () => {
    let caught: unknown;
    try {
      await listIssues(dir, 'nope', 'all');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
  });

  it("throws 'not broken down' for a spec without INDEX.md", async () => {
    await mkdir(join(dir, 'bare-spec'), { recursive: true });
    let caught: unknown;
    try {
      await listIssues(dir, 'bare-spec', 'all');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('has not been broken down');
    expect((caught as CliError).exitCode).toBe(1);
  });

  it('returns total 0 and empty list for an INDEX with zero issues', async () => {
    await mkdir(join(dir, 'empty-index', 'issues'), { recursive: true });
    await writeFile(join(dir, 'empty-index', 'issues', 'INDEX.md'), '## All issues\n', 'utf8');

    const result = await listIssues(dir, 'empty-index', 'all');
    expect(result).toMatchObject({ slug: 'empty-index', filter: 'all', total: 0, issues: [] });
  });

  it('keeps total at the full issue count when a filter is applied', async () => {
    await mkdir(join(dir, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(dir, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');

    const result = await listIssues(dir, 'pricing-engine', 'ready');
    expect(result.total).toBe(3);
    expect(result.issues.map((i) => i.number)).toEqual(['01']);
  });
});

describe('renderIssues', () => {
  it('renders done, ready, and blocked annotations', () => {
    const resolved = resolveIssues([
      issue({ number: '01', title: 'Set up schema' }),
      issue({ number: '02', title: 'Build calculator', done: true }),
      issue({ number: '03', title: 'Add API', blockedBy: ['01', '02'] }),
    ]);
    const out = renderIssues({ slug: 's', filter: 'all', total: 3, issues: resolved });

    expect(out).toContain('[ ] 01 — Set up schema (ready)');
    expect(out).toContain('[x] 02 — Build calculator (done)');
    expect(out).toContain('[ ] 03 — Add API (blocked by: 01)');
  });

  it('prints a friendly message for an empty filtered list', () => {
    expect(renderIssues({ slug: 's', filter: 'ready', total: 2, issues: [] })).toBe(
      'No ready issues.',
    );
  });
});

describe('makeIssuesCommand', () => {
  function makeProgram(): Command {
    const program = new Command('draun')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeIssuesCommand());
    return program;
  }

  async function makeSpec(): Promise<void> {
    const specDir = join(dir, '.draun', 'specs', 'pricing-engine', 'issues');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, 'INDEX.md'), INDEX_FIXTURE, 'utf8');
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

  it('emits JSON with filter, issues, and state fields for --ready --json', async () => {
    await makeSpec();

    const out = await runCapture(['issues', 'pricing-engine', '--ready', '--json']);

    const payload = JSON.parse(out) as {
      filter: string;
      total: number;
      issues: Array<{ number: string; state: string; pendingBlockers: string[] }>;
    };
    expect(payload.filter).toBe('ready');
    expect(payload.total).toBe(3);
    expect(payload.issues).toHaveLength(1);
    expect(payload.issues[0].number).toBe('01');
    expect(payload.issues[0].state).toBe('ready');
  });

  it('annotates --blocked output with pending blockers only', async () => {
    await makeSpec();

    const out = await runCapture(['issues', 'pricing-engine', '--blocked']);

    expect(out).toContain('[ ] 03 — Add API (blocked by: 01)');
    expect(out).not.toContain('blocked by: 01, 02');
  });

  it('rejects --ready and --blocked together with exit code 2', async () => {
    await makeSpec();
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      let caught: unknown;
      try {
        await makeProgram().parseAsync(['issues', 'pricing-engine', '--ready', '--blocked'], {
          from: 'user',
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(CliError);
      expect((caught as CliError).exitCode).toBe(2);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('rejects an unknown slug with CliError', async () => {
    await mkdir(join(dir, '.draun', 'specs'), { recursive: true });
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      await expect(
        makeProgram().parseAsync(['issues', 'nope'], { from: 'user' }),
      ).rejects.toBeInstanceOf(CliError);
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
