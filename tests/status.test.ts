import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { listSpecStatuses, parseIndex, readSpecStatus } from '../src/lib/index-parser.js';
import { makeStatusCommand, renderSpecDetail, renderSpecList } from '../src/commands/status.js';
import { getMessages } from '../src/lib/messages.js';
import {
  calculateProgressBar,
  renderProgressBarWithLabel,
  resolveProgressBarMode,
} from '../src/lib/progress-bar.js';

// The status command resolves language via the global config in os.homedir();
// point the home at a temp dir so the real one never leaks in.
const mocked = vi.hoisted(() => ({ home: '' }));
const mockedTui = vi.hoisted(() => ({ runStatusTui: vi.fn(async () => undefined) }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => mocked.home;
  return { ...os, homedir, default: { ...os, homedir } };
});
vi.mock('../src/tui/render.js', () => mockedTui);

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
  dir = await mkdtemp(join(tmpdir(), 'draun-status-'));
  home = await mkdtemp(join(tmpdir(), 'draun-status-home-'));
  mocked.home = home;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
  mockedTui.runStatusTui.mockClear();
});

function setIsTTY(stream: NodeJS.ReadStream | NodeJS.WriteStream, value: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(stream, 'isTTY');
  Object.defineProperty(stream, 'isTTY', { configurable: true, value });
  return () => {
    if (descriptor !== undefined) {
      Object.defineProperty(stream, 'isTTY', descriptor);
    } else {
      delete (stream as { isTTY?: boolean }).isTTY;
    }
  };
}

function collectObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [key, ...collectObjectKeys(child)]);
  }
  return [];
}

function expectJsonHasNoVisualOutput(value: unknown, output: string): void {
  expect(output).not.toMatch(/\x1b\[[0-9;]*m|\\u001b\[[0-9;]*m/);
  const keys = collectObjectKeys(value);
  for (const key of ['frame', 'animation', 'progressBar', 'visual']) {
    expect(keys).not.toContain(key);
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function rgbCodes(text: string): string[] {
  return Array.from(text.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g), (match) =>
    match.slice(1).join(','),
  );
}

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

describe('renderSpecList', () => {
  type IssueSpec = { number: string; title?: string; state?: 'todo' | 'in-progress' | 'done'; blockedBy?: string[] };

  function makeStatus(slug: string, issueSpecs: IssueSpec[], brokenDown = true) {
    const issues = issueSpecs.map((i) => ({
      number: i.number,
      title: i.title ?? `Issue ${i.number}`,
      file: `${i.number}-issue.md`,
      done: i.state === 'done',
      state: i.state ?? ('todo' as const),
      blockedBy: i.blockedBy ?? [],
    }));
    return {
      slug,
      brokenDown,
      total: issues.length,
      done: issues.filter((i) => i.done).length,
      inProgress: issues.filter((i) => i.state === 'in-progress').length,
      pending: issues.filter((i) => !i.done && i.state !== 'in-progress').length,
      issues,
    };
  }

  it('groups specs under lifecycle headings and omits empty groups', () => {
    const out = renderSpecList(
      [
        makeStatus('active-spec', [{ number: '01', state: 'done' }, { number: '02' }]),
        makeStatus('fresh-spec', [{ number: '01' }]),
        makeStatus('bare-spec', [], false),
        makeStatus('finished-spec', [{ number: '01', state: 'done' }]),
      ],
      getMessages(),
    );

    const headingOrder = ['IN PROGRESS', 'NOT STARTED', 'NOT BROKEN DOWN', 'DONE (1)'].map((h) =>
      out.indexOf(h),
    );
    expect(headingOrder.every((i) => i >= 0)).toBe(true);
    expect(headingOrder).toEqual([...headingOrder].sort((a, b) => a - b));
    expect(out).toContain('active-spec');
    expect(out).toContain('bare-spec');
    expect(out).toContain('not broken down');
  });

  it('omits headings for empty groups', () => {
    const out = renderSpecList([makeStatus('only-active', [{ number: '01', state: 'in-progress' }])], getMessages());
    expect(out).toContain('IN PROGRESS');
    expect(out).not.toContain('NOT STARTED');
    expect(out).not.toContain('NOT BROKEN DOWN');
    expect(out).not.toContain('DONE');
  });

  it('sorts active specs: in-progress first, then higher completion', () => {
    const out = renderSpecList(
      [
        makeStatus('half-done', [{ number: '01', state: 'done' }, { number: '02' }]),
        makeStatus('mostly-done', [
          { number: '01', state: 'done' },
          { number: '02', state: 'done' },
          { number: '03' },
        ]),
        makeStatus('has-wip', [{ number: '01', state: 'done' }, { number: '02', state: 'in-progress' }, { number: '03' }]),
      ],
      getMessages(),
    );

    const order = ['has-wip', 'mostly-done', 'half-done'].map((s) => out.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('shows the in-progress issue as next, falling back to the first ready issue', () => {
    const out = renderSpecList(
      [
        makeStatus('wip-spec', [
          { number: '01', title: 'Done one', state: 'done' },
          { number: '02', title: 'Working on it', state: 'in-progress' },
        ]),
        makeStatus('ready-spec', [
          { number: '01', title: 'Start here' },
          { number: '02', title: 'Blocked one', blockedBy: ['01'] },
        ]),
      ],
      getMessages(),
    );

    expect(out).toContain('next: 02 — Working on it');
    expect(out).toContain('next: 01 — Start here');
  });

  it('omits the next line when every pending issue is blocked', () => {
    const out = renderSpecList(
      [
        makeStatus('stuck-spec', [
          { number: '01', state: 'done' },
          { number: '02', blockedBy: ['03'] },
          { number: '03', blockedBy: ['02'] },
        ]),
      ],
      getMessages(),
    );
    expect(out).not.toContain('next:');
  });

  it('collapses completed specs into a single line with count and slugs', () => {
    const out = renderSpecList(
      [
        makeStatus('alpha-done', [{ number: '01', state: 'done' }]),
        makeStatus('beta-done', [{ number: '01', state: 'done' }]),
      ],
      getMessages(),
    );

    expect(out).toContain('DONE (2)');
    expect(out).toContain('alpha-done');
    expect(out).toContain('beta-done');
    expect(out).not.toContain('issues ·');
  });

  it('keeps the no-specs message for an empty list', () => {
    expect(renderSpecList([], getMessages())).toBe(getMessages().status.noSpecs);
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

describe('progress bar rendering', () => {
  it('keeps percentage based on done issues only while rendering in-progress separately', () => {
    const model = calculateProgressBar({ done: 1, inProgress: 3, total: 4, width: 8 });

    expect(model.percent).toBe(25);
    expect(model.segments).toEqual([
      { kind: 'done', width: 2 },
      { kind: 'in-progress', width: 6 },
      { kind: 'pending', width: 0 },
    ]);
  });

  it('keeps the compatibility wrapper shape for plain static output', () => {
    expect(
      renderProgressBarWithLabel({ done: 2, inProgress: 1, total: 6, width: 6 }, { mode: 'plain' }),
    ).toBe('██▓░░░ 33%');
  });

  it('handles empty totals and small widths without unstable output', () => {
    expect(
      renderProgressBarWithLabel({ done: 1, inProgress: 1, total: 0, width: 3 }, { mode: 'plain' }),
    ).toBe('░░░ 0%');
    expect(
      renderProgressBarWithLabel({ done: 1, inProgress: 1, total: 2, width: -1 }, { mode: 'plain' }),
    ).toBe(' 50%');
  });

  it('renders animated truecolor with multiple RGB stops and shifts by frame', () => {
    const input = { done: 8, inProgress: 0, total: 8, width: 8 };
    const first = renderProgressBarWithLabel(input, { mode: 'animated-truecolor', frame: 0 });
    const second = renderProgressBarWithLabel(input, { mode: 'animated-truecolor', frame: 1 });

    expect(stripAnsi(first)).toBe('████████ 100%');
    expect(new Set(rgbCodes(first)).size).toBeGreaterThan(3);
    expect(first).not.toBe(second);
  });

  it('renders in-progress as a distinct segment while preserving the block symbol', () => {
    const out = renderProgressBarWithLabel(
      { done: 2, inProgress: 2, total: 6, width: 6 },
      { mode: 'static-truecolor' },
    );
    const colors = rgbCodes(out);

    expect(stripAnsi(out)).toBe('██▓▓░░ 33%');
    expect(stripAnsi(out)).toContain('▓▓');
    expect(colors).toContain('75,43,157');
    expect(new Set(colors).size).toBe(3);
    expect(colors[0]).not.toBe(colors[1]);
  });

  it('keeps the in-progress prefilled segment static while done animates', () => {
    const input = { done: 3, inProgress: 3, total: 6, width: 6 };
    const first = renderProgressBarWithLabel(input, { mode: 'animated-truecolor', frame: 0 });
    const second = renderProgressBarWithLabel(input, { mode: 'animated-truecolor', frame: 8 });

    const firstInProgress = first.match(/(?:\x1b\[38;2;\d+;\d+;\d+m▓\x1b\[39m)+/)?.[0];
    const secondInProgress = second.match(/(?:\x1b\[38;2;\d+;\d+;\d+m▓\x1b\[39m)+/)?.[0];

    expect(stripAnsi(first)).toBe('███▓▓▓ 50%');
    expect(first).not.toBe(second);
    expect(firstInProgress).toBe(secondInProgress);
  });

  it('keeps pending muted and deterministic in truecolor and ANSI modes', () => {
    const input = { done: 0, inProgress: 0, total: 4, width: 4 };
    const truecolor = renderProgressBarWithLabel(input, { mode: 'static-truecolor', frame: 0 });
    const truecolorLater = renderProgressBarWithLabel(input, { mode: 'static-truecolor', frame: 12 });
    const ansi = renderProgressBarWithLabel(input, { mode: 'static-ansi' });

    expect(truecolor).toBe(truecolorLater);
    expect(rgbCodes(truecolor)).toEqual(['107,114,128']);
    expect(stripAnsi(ansi)).toBe('░░░░ 0%');
    expect(ansi).toContain('\x1b[2m');
    expect(ansi).toContain('\x1b[90m');
  });

  it('keeps stripped ANSI text stable for narrow mixed bars', () => {
    const out = renderProgressBarWithLabel(
      { done: 1, inProgress: 1, total: 3, width: 3 },
      { mode: 'animated-truecolor', frame: 3 },
    );

    expect(stripAnsi(out)).toBe('█▓░ 33%');
  });

  it('ignores frame values for static truecolor rendering', () => {
    const input = { done: 4, inProgress: 0, total: 4, width: 4 };
    expect(renderProgressBarWithLabel(input, { mode: 'static-truecolor', frame: 0 })).toBe(
      renderProgressBarWithLabel(input, { mode: 'static-truecolor', frame: 99 }),
    );
    expect(renderProgressBarWithLabel(input, { mode: 'animated-truecolor', frame: 0 })).not.toBe(
      renderProgressBarWithLabel(input, { mode: 'animated-truecolor', frame: 1 }),
    );
  });

  it('selects rendering mode from terminal capabilities only', () => {
    expect(
      resolveProgressBarMode({
        color: true,
        truecolor: true,
        interactive: true,
        animation: true,
      }),
    ).toBe('animated-truecolor');
    expect(
      resolveProgressBarMode({
        color: true,
        truecolor: true,
        interactive: true,
        animation: true,
        reducedMotion: true,
      }),
    ).toBe('static-truecolor');
    expect(
      resolveProgressBarMode({
        color: true,
        truecolor: false,
        interactive: true,
        animation: true,
      }),
    ).toBe('static-ansi');
    expect(
      resolveProgressBarMode({
        color: false,
        truecolor: true,
        interactive: true,
        animation: true,
      }),
    ).toBe('plain');
    expect(
      resolveProgressBarMode({
        color: true,
        truecolor: true,
        interactive: false,
        animation: true,
      }),
    ).toBe('static-truecolor');
  });
});

describe('makeStatusCommand', () => {
  function makeProgram(): Command {
    const program = new Command('draun')
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
    const specsRoot = join(dir, '.draun', 'specs');
    await mkdir(join(specsRoot, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(specsRoot, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');

    const out = await runCapture(['status', '--json'], dir);

    const payload = JSON.parse(out) as { specs: Array<{ slug: string; total: number }> };
    expect(payload.specs).toHaveLength(1);
    expect(payload.specs[0].slug).toBe('pricing-engine');
    expect(payload.specs[0].total).toBe(3);
    expectJsonHasNoVisualOutput(payload, out);
  });

  it('shows detail for a known slug with --json', async () => {
    const specsRoot = join(dir, '.draun', 'specs');
    await mkdir(join(specsRoot, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(specsRoot, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');

    const out = await runCapture(['status', 'pricing-engine', '--json'], dir);

    const payload = JSON.parse(out) as { slug: string; done: number; issues: unknown[] };
    expect(payload.slug).toBe('pricing-engine');
    expect(payload.done).toBe(2);
    expect(payload.issues).toHaveLength(3);
    expectJsonHasNoVisualOutput(payload, out);
  });

  it('does not enter the TUI for --json even when attached to TTY streams', async () => {
    const specsRoot = join(dir, '.draun', 'specs');
    await mkdir(join(specsRoot, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(specsRoot, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');
    const restoreStdout = setIsTTY(process.stdout, true);
    const restoreStdin = setIsTTY(process.stdin, true);
    try {
      const out = await runCapture(['status', '--json'], dir);

      expect(JSON.parse(out)).toMatchObject({ specs: [{ slug: 'pricing-engine' }] });
      expect(mockedTui.runStatusTui).not.toHaveBeenCalled();
    } finally {
      restoreStdout();
      restoreStdin();
    }
  });

  it('keeps textual status deterministic outside TTY streams', async () => {
    const specsRoot = join(dir, '.draun', 'specs');
    await mkdir(join(specsRoot, 'pricing-engine', 'issues'), { recursive: true });
    await writeFile(join(specsRoot, 'pricing-engine', 'issues', 'INDEX.md'), INDEX_FIXTURE, 'utf8');
    const restoreStdout = setIsTTY(process.stdout, false);
    const restoreStdin = setIsTTY(process.stdin, false);
    try {
      const first = await runCapture(['status'], dir);
      const second = await runCapture(['status'], dir);

      expect(first).toBe(second);
      expect(first).toContain('pricing-engine');
      expect(first).toContain('67%');
      expect(mockedTui.runStatusTui).not.toHaveBeenCalled();
    } finally {
      restoreStdout();
      restoreStdin();
    }
  });

  it('shows a not-broken-down spec without erroring', async () => {
    const specsRoot = join(dir, '.draun', 'specs');
    await mkdir(join(specsRoot, 'bare-spec'), { recursive: true });

    const out = await runCapture(['status', 'bare-spec'], dir);
    expect(out).toContain("Spec 'bare-spec' has not been broken down yet.");
  });

  it('rejects with CliError for an unknown slug', async () => {
    await mkdir(join(dir, '.draun', 'specs'), { recursive: true });
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
