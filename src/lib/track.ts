import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseIndex, type IndexIssue, type IssueTrackState } from './index-parser.js';
import { resolveIssues, type ResolvedIssue } from './issues.js';
import { CliError } from './output.js';

export interface ToggleOutcome {
  slug: string;
  number: string;
  title: string;
  state: IssueTrackState;
  /** Derived from `state` — kept so existing consumers and JSON payloads stay stable. */
  done: boolean;
  changed: boolean;
  newlyReady: ResolvedIssue[];
  /** True when this toggle leaves every issue in the spec done. */
  specComplete: boolean;
}

const CHECKBOX_RE = /^(\s*-\s*\[)( |x|X|~)(\]\s*\[(\d{2}))/;

const STATE_MARK: Record<IssueTrackState, string> = {
  todo: ' ',
  'in-progress': '~',
  done: 'x',
};

export function toggleIssueInIndex(
  markdown: string,
  number: string,
  state: IssueTrackState,
): { markdown: string; issue: IndexIssue } | null {
  const parsed = parseIndex(markdown);
  const issue = parsed.find((i) => i.number === number);
  if (issue === undefined) {
    return null;
  }

  const parts = markdown.split(/(\r?\n)/);
  let inAllIssues = false;
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const heading = line.match(/^##\s+(.*)$/);
    if (heading !== null) {
      inAllIssues = heading[1].trim().toLowerCase() === 'all issues';
      continue;
    }
    if (!inAllIssues) {
      continue;
    }
    const m = line.match(CHECKBOX_RE);
    if (m === null || m[4] !== number) {
      continue;
    }
    const replaced = m[1] + STATE_MARK[state] + line.slice(m[1].length + 1);
    parts[i] = replaced;
    return { markdown: parts.join(''), issue: { ...issue, state, done: state === 'done' } };
  }
  return null;
}

export function computeNewlyReady(before: IndexIssue[], number: string): ResolvedIssue[] {
  const readyBefore = new Set(
    resolveIssues(before)
      .filter((i) => i.state === 'ready')
      .map((i) => i.number),
  );
  const after = before.map((i) =>
    i.number === number ? { ...i, done: true, state: 'done' as const } : i,
  );
  return resolveIssues(after).filter((i) => i.state === 'ready' && !readyBefore.has(i.number));
}

export async function setIssueState(
  specsRoot: string,
  slug: string,
  number: string,
  state: IssueTrackState,
): Promise<ToggleOutcome> {
  const specDir = join(specsRoot, slug);
  let isDir = false;
  try {
    isDir = (await stat(specDir)).isDirectory();
  } catch {
    // missing spec dir handled below
  }
  if (!isDir) {
    throw new CliError(`unknown spec '${slug}'`, 1, { key: 'unknown-spec', params: { slug } });
  }

  const indexPath = join(specDir, 'issues', 'INDEX.md');
  let markdown: string;
  try {
    markdown = await readFile(indexPath, 'utf8');
  } catch {
    throw new CliError(`spec '${slug}' has not been broken down yet`, 1, {
      key: 'not-broken-down',
      params: { slug },
    });
  }

  const before = parseIndex(markdown);
  const target = before.find((i) => i.number === number);
  if (target === undefined) {
    throw new CliError(`issue '${number}' not found in INDEX.md`, 1, {
      key: 'issue-not-found',
      params: { number },
    });
  }

  if (state === 'in-progress' && target.done) {
    throw new CliError(`issue '${number}' is already done — run draun reopen first`, 1, {
      key: 'start-done-issue',
      params: { number },
    });
  }

  const newlyReady = state === 'done' ? computeNewlyReady(before, number) : [];
  const done = state === 'done';
  const specComplete =
    done && before.every((i) => i.number === number || i.done);

  if (target.state === state) {
    return { slug, number, title: target.title, state, done, changed: false, newlyReady, specComplete };
  }

  const toggled = toggleIssueInIndex(markdown, number, state);
  if (toggled === null) {
    throw new CliError(`issue '${number}' not found in INDEX.md`, 1, {
      key: 'issue-not-found',
      params: { number },
    });
  }
  await writeFile(indexPath, toggled.markdown, 'utf8');
  return { slug, number, title: target.title, state, done, changed: true, newlyReady, specComplete };
}

export async function setIssueDone(
  specsRoot: string,
  slug: string,
  number: string,
  done: boolean,
): Promise<ToggleOutcome> {
  return setIssueState(specsRoot, slug, number, done ? 'done' : 'todo');
}
