import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IndexIssue, SpecStatus } from '../src/lib/index-parser.js';
import {
  buildIssueView,
  classify,
  compareActiveSpecs,
  loadDashboard,
  orderSpecsForTui,
} from '../src/tui/data.js';

function issue(number: string, state: IndexIssue['state'], blockedBy: string[] = []): IndexIssue {
  return {
    number,
    title: `Issue ${number}`,
    file: `${number}-issue.md`,
    done: state === 'done',
    state,
    blockedBy,
  };
}

function spec(partial: Partial<SpecStatus> & { slug: string }): SpecStatus {
  return {
    brokenDown: true,
    total: 0,
    done: 0,
    inProgress: 0,
    pending: 0,
    issues: [],
    ...partial,
  };
}

describe('classify', () => {
  it('flags specs without an issues breakdown', () => {
    expect(classify(spec({ slug: 'a', brokenDown: false }))).toBe('not-broken-down');
  });

  it('marks a spec done only when every issue is done', () => {
    expect(classify(spec({ slug: 'a', total: 3, done: 3 }))).toBe('done');
    expect(classify(spec({ slug: 'a', total: 3, done: 2 }))).toBe('in-progress');
  });

  it('treats any done or in-progress work as in-progress', () => {
    expect(classify(spec({ slug: 'a', total: 3, inProgress: 1 }))).toBe('in-progress');
    expect(classify(spec({ slug: 'a', total: 3, done: 1 }))).toBe('in-progress');
  });

  it('is not-started when broken down but untouched', () => {
    expect(classify(spec({ slug: 'a', total: 3, pending: 3 }))).toBe('not-started');
  });
});

describe('compareActiveSpecs', () => {
  it('sorts specs with active WIP before those without', () => {
    const wip = spec({ slug: 'wip', total: 4, done: 1, inProgress: 1 });
    const noWip = spec({ slug: 'no', total: 4, done: 3 });
    expect(compareActiveSpecs(wip, noWip)).toBeLessThan(0);
    expect(compareActiveSpecs(noWip, wip)).toBeGreaterThan(0);
  });

  it('sorts by completion percentage (desc) when WIP status matches', () => {
    const more = spec({ slug: 'more', total: 4, done: 3 });
    const less = spec({ slug: 'less', total: 4, done: 1 });
    expect(compareActiveSpecs(more, less)).toBeLessThan(0);
  });

  it('breaks ties by slug', () => {
    const a = spec({ slug: 'alpha', total: 4, done: 2 });
    const b = spec({ slug: 'beta', total: 4, done: 2 });
    expect(compareActiveSpecs(a, b)).toBeLessThan(0);
  });
});

describe('orderSpecsForTui', () => {
  it('orders active (sorted), then not-started, not-broken-down, then done', () => {
    const specs = [
      spec({ slug: 'done-one', total: 2, done: 2 }),
      spec({ slug: 'raw', brokenDown: false }),
      spec({ slug: 'fresh', total: 2, pending: 2 }),
      spec({ slug: 'active-low', total: 4, done: 1 }),
      spec({ slug: 'active-wip', total: 4, done: 1, inProgress: 1 }),
    ];
    expect(orderSpecsForTui(specs).map((s) => s.slug)).toEqual([
      'active-wip',
      'active-low',
      'fresh',
      'raw',
      'done-one',
    ]);
  });
});

describe('buildIssueView', () => {
  it('resolves issue states and blockers from the dependency graph', () => {
    const status = spec({
      slug: 'graph',
      total: 3,
      done: 1,
      inProgress: 1,
      pending: 1,
      issues: [issue('01', 'done'), issue('02', 'in-progress', ['01']), issue('03', 'todo', ['02'])],
    });
    const view = buildIssueView(status);
    expect(view.issues.map((i) => i.state)).toEqual(['done', 'in-progress', 'blocked']);
    expect(view.issues[2].pendingBlockers).toEqual(['02']);
    expect(view.total).toBe(3);
    expect(view.done).toBe(1);
  });

  it('marks an unblocked todo as ready', () => {
    const status = spec({
      slug: 'ready',
      total: 1,
      pending: 1,
      issues: [issue('01', 'todo')],
    });
    expect(buildIssueView(status).issues[0].state).toBe('ready');
  });

  it('returns no issues when the spec is not broken down', () => {
    const view = buildIssueView(spec({ slug: 'raw', brokenDown: false }));
    expect(view.brokenDown).toBe(false);
    expect(view.issues).toEqual([]);
  });
});

describe('loadDashboard', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'draun-tui-data-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads spec statuses from a specs root', async () => {
    const specDir = join(dir, 'my-spec', 'issues');
    await mkdir(specDir, { recursive: true });
    await writeFile(
      join(specDir, 'INDEX.md'),
      ['# Issues', '', '## All issues', '', '- [x] [01 — First](01-first.md) — blocked by: none', ''].join(
        '\n',
      ),
      'utf8',
    );

    const statuses = await loadDashboard(dir);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].slug).toBe('my-spec');
    expect(statuses[0].done).toBe(1);
  });

  it('returns an empty list when the specs root is missing', async () => {
    expect(await loadDashboard(join(dir, 'nope'))).toEqual([]);
  });
});
