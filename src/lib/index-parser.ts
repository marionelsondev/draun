import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from './output.js';

export type IssueTrackState = 'todo' | 'in-progress' | 'done';

export interface IndexIssue {
  number: string;
  title: string;
  file: string;
  /** Derived from `state` — kept so existing consumers and JSON payloads stay stable. */
  done: boolean;
  state: IssueTrackState;
  blockedBy: string[];
}

const ISSUE_LINE_RE =
  /^\s*-\s*\[( |x|X|~)\]\s*\[(\d{2})\s*[—-]+\s*(.+?)\]\(([^)]+)\)(?:\s*[—-]+\s*blocked by:\s*(.*))?\s*$/;

export function checkboxState(mark: string): IssueTrackState {
  if (mark.toLowerCase() === 'x') return 'done';
  if (mark === '~') return 'in-progress';
  return 'todo';
}

export function parseIndex(markdown: string): IndexIssue[] {
  const issues: IndexIssue[] = [];
  let inAllIssues = false;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading !== null) {
      inAllIssues = heading[1].trim().toLowerCase() === 'all issues';
      continue;
    }
    if (!inAllIssues) {
      continue;
    }
    const m = line.match(ISSUE_LINE_RE);
    if (m === null) {
      continue;
    }
    const blockedByRaw = (m[5] ?? '').trim();
    const blockedBy =
      blockedByRaw === '' || blockedByRaw.toLowerCase() === 'none'
        ? []
        : blockedByRaw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== '')
            .map((s) => (/^\d+$/.test(s) ? String(parseInt(s, 10)).padStart(2, '0') : s));
    const state = checkboxState(m[1]);
    issues.push({
      number: m[2],
      title: m[3].trim(),
      file: m[4].trim(),
      done: state === 'done',
      state,
      blockedBy,
    });
  }
  return issues;
}

export interface SpecStatus {
  slug: string;
  brokenDown: boolean;
  total: number;
  done: number;
  inProgress: number;
  /** Issues not yet started (`[ ]`). */
  pending: number;
  issues: IndexIssue[];
}

export async function readSpecStatus(specsRoot: string, slug: string): Promise<SpecStatus> {
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

  let markdown: string;
  try {
    markdown = await readFile(join(specDir, 'issues', 'INDEX.md'), 'utf8');
  } catch {
    return { slug, brokenDown: false, total: 0, done: 0, inProgress: 0, pending: 0, issues: [] };
  }

  const issues = parseIndex(markdown);
  const done = issues.filter((i) => i.done).length;
  const inProgress = issues.filter((i) => i.state === 'in-progress').length;
  return {
    slug,
    brokenDown: true,
    total: issues.length,
    done,
    inProgress,
    pending: issues.length - done - inProgress,
    issues,
  };
}

export async function listSpecStatuses(specsRoot: string): Promise<SpecStatus[]> {
  let entries;
  try {
    entries = await readdir(specsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const slugs = entries
    .filter((e) => e.isDirectory() && e.name !== 'archive')
    .map((e) => e.name)
    .sort();
  const statuses: SpecStatus[] = [];
  for (const slug of slugs) {
    statuses.push(await readSpecStatus(specsRoot, slug));
  }
  return statuses;
}
