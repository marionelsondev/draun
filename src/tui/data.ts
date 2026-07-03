import { listSpecStatuses, type SpecStatus } from '../lib/index-parser.js';
import { resolveIssues, type ResolvedIssue } from '../lib/issues.js';

/** Bucket a spec falls into for grouping in both the one-shot list and the TUI. */
export type SpecGroup = 'in-progress' | 'not-started' | 'done' | 'not-broken-down';

export function classify(s: SpecStatus): SpecGroup {
  if (!s.brokenDown) {
    return 'not-broken-down';
  }
  if (s.total > 0 && s.done === s.total) {
    return 'done';
  }
  if (s.inProgress > 0 || s.done > 0) {
    return 'in-progress';
  }
  return 'not-started';
}

/**
 * Orders the "in progress" bucket: specs with active WIP first, then by
 * completion percentage (desc), then slug. Shared by the list view and the TUI.
 */
export function compareActiveSpecs(a: SpecStatus, b: SpecStatus): number {
  if ((a.inProgress > 0) !== (b.inProgress > 0)) {
    return a.inProgress > 0 ? -1 : 1;
  }
  const pct = b.done / b.total - a.done / a.total;
  return pct !== 0 ? pct : a.slug.localeCompare(b.slug);
}

/** Flat, display-ordered spec list for the TUI's left column. */
export function orderSpecsForTui(statuses: SpecStatus[]): SpecStatus[] {
  const group = (name: SpecGroup) => statuses.filter((s) => classify(s) === name);
  const active = group('in-progress').slice().sort(compareActiveSpecs);
  return [...active, ...group('not-started'), ...group('not-broken-down'), ...group('done')];
}

export async function loadDashboard(root: string): Promise<SpecStatus[]> {
  return listSpecStatuses(root);
}

/** The dependency-resolved view of a single spec rendered in the right column. */
export interface IssueView {
  slug: string;
  brokenDown: boolean;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  issues: ResolvedIssue[];
}

export function buildIssueView(status: SpecStatus): IssueView {
  return {
    slug: status.slug,
    brokenDown: status.brokenDown,
    total: status.total,
    done: status.done,
    inProgress: status.inProgress,
    pending: status.pending,
    issues: status.brokenDown ? resolveIssues(status.issues) : [],
  };
}
