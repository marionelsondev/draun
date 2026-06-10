import { type IndexIssue, readSpecStatus } from './index-parser.js';
import { CliError } from './output.js';

export type IssueState = 'done' | 'in-progress' | 'ready' | 'blocked';
export type IssueFilter = 'all' | 'ready' | 'blocked' | 'done';

export interface ResolvedIssue extends Omit<IndexIssue, 'state'> {
  state: IssueState;
  pendingBlockers: string[];
}

export function resolveIssues(issues: IndexIssue[]): ResolvedIssue[] {
  const doneNumbers = new Set(issues.filter((i) => i.done).map((i) => i.number));
  return issues.map((issue) => {
    const pendingBlockers = issue.blockedBy.filter((n) => !doneNumbers.has(n));
    const state: IssueState = issue.done
      ? 'done'
      : issue.state === 'in-progress'
        ? 'in-progress'
        : pendingBlockers.length === 0
          ? 'ready'
          : 'blocked';
    return { ...issue, state, pendingBlockers };
  });
}

export function filterIssues(resolved: ResolvedIssue[], filter: IssueFilter): ResolvedIssue[] {
  if (filter === 'all') {
    return resolved;
  }
  return resolved.filter((i) => i.state === filter);
}

export interface IssuesResult {
  slug: string;
  filter: IssueFilter;
  total: number;
  issues: ResolvedIssue[];
}

export async function listIssues(
  specsRoot: string,
  slug: string,
  filter: IssueFilter,
): Promise<IssuesResult> {
  const status = await readSpecStatus(specsRoot, slug);
  if (!status.brokenDown) {
    throw new CliError(`spec '${slug}' has not been broken down yet`, 1);
  }
  const resolved = resolveIssues(status.issues);
  const issues = filterIssues(resolved, filter);
  return { slug, filter, total: status.total, issues };
}
