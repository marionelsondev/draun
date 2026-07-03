import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { parseIndex, type IndexIssue } from '../src/lib/index-parser.js';
import { computeNewlyReady, setIssueDone, toggleIssueInIndex } from '../src/lib/track.js';
import { makeDoneCommand, makeReopenCommand, renderToggle } from '../src/commands/done.js';

const INDEX_FIXTURE = `# Issues — Pricing Engine

## All issues

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
- [ ] [03 — Add API](03-add-api.md) — blocked by: 01, 02
`;

function issue(partial: Partial<IndexIssue> & { number: string }): IndexIssue {
  const base: IndexIssue = {
    number: partial.number,
    title: `Issue ${partial.number}`,
    file: `${partial.number}-x.md`,
    done: false,
    state: 'todo',
    blockedBy: [],
  };
  const merged = { ...base, ...partial };
  if (partial.state === undefined) {
    merged.state = merged.done ? 'done' : 'todo';
  }
  return merged;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-done-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('toggleIssueInIndex', () => {
  it('checks only the target line', () => {
    const result = toggleIssueInIndex(INDEX_FIXTURE, '01', 'done');
    expect(result).not.toBeNull();
    expect(result!.issue.done).toBe(true);
    expect(result!.markdown).toContain('- [x] [01 — Set up schema]');
    expect(result!.markdown).toContain('- [ ] [03 — Add API]');
    expect(result!.markdown).toContain('- [x] [02 — Build calculator]');
  });

  it('unchecks only the target line', () => {
    const result = toggleIssueInIndex(INDEX_FIXTURE, '02', 'todo');
    expect(result!.markdown).toContain('- [ ] [02 — Build calculator]');
    expect(result!.markdown).toContain('- [ ] [01 — Set up schema]');
  });

  it('returns null for a missing number', () => {
    expect(toggleIssueInIndex(INDEX_FIXTURE, '99', 'done')).toBeNull();
  });

  it('preserves CRLF line endings byte-for-byte except the checkbox', () => {
    const crlf = INDEX_FIXTURE.replace(/\n/g, '\r\n');
    const result = toggleIssueInIndex(crlf, '01', 'done');
    expect(result!.markdown).toBe(crlf.replace('- [ ] [01', '- [x] [01'));
  });

  it('does not modify matching lines outside the All issues section', () => {
    const md = `# Title

- [ ] [01 — Stray line](stray.md)

## All issues

- [ ] [01 — Real issue](01-real.md) — blocked by: none
`;
    const result = toggleIssueInIndex(md, '01', 'done');
    expect(result!.markdown).toContain('- [ ] [01 — Stray line]');
    expect(result!.markdown).toContain('- [x] [01 — Real issue]');
  });
});

describe('computeNewlyReady', () => {
  it('reports 03 newly ready when 01 done and 02 already done', () => {
    const before = [
      issue({ number: '01' }),
      issue({ number: '02', done: true, blockedBy: ['01'] }),
      issue({ number: '03', blockedBy: ['01', '02'] }),
    ];
    const newlyReady = computeNewlyReady(before, '01');
    expect(newlyReady.map((i) => i.number)).toEqual(['03']);
  });

  it('returns [] when remaining blockers keep others blocked', () => {
    const before = [
      issue({ number: '01' }),
      issue({ number: '02' }),
      issue({ number: '03', blockedBy: ['01', '02'] }),
    ];
    expect(computeNewlyReady(before, '01')).toEqual([]);
  });
});

describe('setIssueDone', () => {
  async function makeSpec(): Promise<string> {
    const issuesDir = join(dir, 'pricing-engine', 'issues');
    await mkdir(issuesDir, { recursive: true });
    const indexPath = join(issuesDir, 'INDEX.md');
    await writeFile(indexPath, INDEX_FIXTURE, 'utf8');
    return indexPath;
  }

  it('writes the updated INDEX.md and reports newly ready issues', async () => {
    const indexPath = await makeSpec();

    const outcome = await setIssueDone(dir, 'pricing-engine', '01', true);

    expect(outcome).toMatchObject({
      slug: 'pricing-engine',
      number: '01',
      title: 'Set up schema',
      done: true,
      changed: true,
    });
    expect(outcome.newlyReady.map((i) => i.number)).toEqual(['03']);
    expect(outcome.specComplete).toBe(false);

    const written = await readFile(indexPath, 'utf8');
    const parsed = parseIndex(written);
    expect(parsed.find((i) => i.number === '01')!.done).toBe(true);
  });

  it('reports specComplete when the last open issue is done', async () => {
    await makeSpec();
    await setIssueDone(dir, 'pricing-engine', '01', true);

    const outcome = await setIssueDone(dir, 'pricing-engine', '03', true);

    expect(outcome.specComplete).toBe(true);
  });

  it('throws for an unknown number without touching the file', async () => {
    const indexPath = await makeSpec();
    const before = await readFile(indexPath, 'utf8');
    const mtimeBefore = (await stat(indexPath)).mtimeMs;

    let caught: unknown;
    try {
      await setIssueDone(dir, 'pricing-engine', '99', true);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain("issue '99' not found");

    expect(await readFile(indexPath, 'utf8')).toBe(before);
    expect((await stat(indexPath)).mtimeMs).toBe(mtimeBefore);
  });

  it('is idempotent: re-done leaves the file unwritten', async () => {
    const indexPath = await makeSpec();
    const mtimeBefore = (await stat(indexPath)).mtimeMs;

    const outcome = await setIssueDone(dir, 'pricing-engine', '02', true);

    expect(outcome.changed).toBe(false);
    expect(outcome.done).toBe(true);
    expect((await stat(indexPath)).mtimeMs).toBe(mtimeBefore);
  });

  it('reopen unchecks and reports no newly ready issues', async () => {
    const indexPath = await makeSpec();

    const outcome = await setIssueDone(dir, 'pricing-engine', '02', false);

    expect(outcome).toMatchObject({ number: '02', done: false, changed: true, newlyReady: [] });
    const parsed = parseIndex(await readFile(indexPath, 'utf8'));
    expect(parsed.find((i) => i.number === '02')!.done).toBe(false);
  });

  it('throws CliError for an unknown spec', async () => {
    await expect(setIssueDone(dir, 'nope', '01', true)).rejects.toBeInstanceOf(CliError);
  });

  it("throws 'not broken down' when INDEX.md is missing", async () => {
    await mkdir(join(dir, 'bare-spec'), { recursive: true });
    let caught: unknown;
    try {
      await setIssueDone(dir, 'bare-spec', '01', true);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('has not been broken down');
  });
});

describe('renderToggle', () => {
  it('lists newly ready issues for done', () => {
    const out = renderToggle({
      slug: 's',
      number: '01',
      title: 'Set up schema',
      state: 'done',
      done: true,
      changed: true,
      newlyReady: [
        { ...issue({ number: '03', title: 'Add API' }), state: 'ready', pendingBlockers: [] },
      ],
      specComplete: false,
    });
    expect(out).toContain('Marked 01 — Set up schema as done.');
    expect(out).toContain('Newly ready: 03 — Add API');
  });

  it('suggests archiving when the spec is complete', () => {
    const out = renderToggle({
      slug: 'pricing-engine',
      number: '03',
      title: 'Add API',
      state: 'done',
      done: true,
      changed: true,
      newlyReady: [],
      specComplete: true,
    });
    expect(out).toContain('All issues done');
    expect(out).toContain('draun archive pricing-engine');
    expect(out).not.toContain('No issues newly unblocked.');
  });

  it('notes when nothing was unblocked', () => {
    const out = renderToggle({
      slug: 's',
      number: '01',
      title: 'Set up schema',
      state: 'done',
      done: true,
      changed: true,
      newlyReady: [],
      specComplete: false,
    });
    expect(out).toContain('No issues newly unblocked.');
  });

  it('does not mention unblocked issues on reopen', () => {
    const out = renderToggle({
      slug: 's',
      number: '02',
      title: 'Build calculator',
      state: 'todo',
      done: false,
      changed: true,
      newlyReady: [],
      specComplete: false,
    });
    expect(out).toContain('Marked 02 — Build calculator as reopened.');
    expect(out).not.toContain('unblocked');
  });
});

describe('command wiring', () => {
  function makeProgram(): Command {
    const program = new Command('draun')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeDoneCommand());
    program.addCommand(makeReopenCommand());
    return program;
  }

  async function makeSpec(): Promise<string> {
    const specDir = join(dir, '.draun', 'specs', 'pricing-engine', 'issues');
    await mkdir(specDir, { recursive: true });
    const indexPath = join(specDir, 'INDEX.md');
    await writeFile(indexPath, INDEX_FIXTURE, 'utf8');
    return indexPath;
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

  it('done --json emits a payload with newlyReady', async () => {
    await makeSpec();

    const out = await runCapture(['done', 'pricing-engine', '01', '--json']);

    const payload = JSON.parse(out) as {
      number: string;
      done: boolean;
      changed: boolean;
      newlyReady: Array<{ number: string }>;
    };
    expect(payload.number).toBe('01');
    expect(payload.done).toBe(true);
    expect(payload.changed).toBe(true);
    expect(payload.newlyReady.map((i) => i.number)).toEqual(['03']);
  });

  it('reopen unchecks the box in INDEX.md', async () => {
    const indexPath = await makeSpec();

    await runCapture(['reopen', 'pricing-engine', '02']);

    const parsed = parseIndex(await readFile(indexPath, 'utf8'));
    expect(parsed.find((i) => i.number === '02')!.done).toBe(false);
  });

  it("pads '1' to '01'", async () => {
    const indexPath = await makeSpec();

    const out = await runCapture(['done', 'pricing-engine', '1', '--json']);

    expect((JSON.parse(out) as { number: string }).number).toBe('01');
    const parsed = parseIndex(await readFile(indexPath, 'utf8'));
    expect(parsed.find((i) => i.number === '01')!.done).toBe(true);
  });
});
