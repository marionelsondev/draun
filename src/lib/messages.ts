export type CliErrorKey =
  | 'unknown-spec'
  | 'spec-not-found'
  | 'not-broken-down'
  | 'issue-not-found'
  | 'start-done-issue'
  | 'validation-failed';

export type ErrorParams = Record<string, string | number>;

export interface Messages {
  errorLabel: string;
  errors: Record<CliErrorKey, (params: ErrorParams) => string>;
  status: {
    notBrokenDown(slug: string): string;
    noSpecs: string;
    issuesSummary(total: number, done: number, inProgress: number, pending: number): string;
    notBrokenDownBadge: string;
    blockedBy(list: string): string;
    inProgressLabel: string;
    groupInProgress: string;
    groupNotStarted: string;
    groupNotBrokenDown: string;
    groupDone(count: number): string;
    nextIssue(number: string, title: string): string;
  };
  toggle: {
    marked(label: string, done: boolean): string;
    already(label: string, done: boolean): string;
    started(label: string): string;
    alreadyStarted(label: string): string;
    newlyReady(label: string): string;
    noneUnblocked: string;
  };
  validate: {
    severity(s: 'error' | 'warning'): string;
    summary(ok: boolean, errors: number, warnings: number): string;
  };
}

const EN: Messages = {
  errorLabel: 'Error',
  errors: {
    'unknown-spec': (p) => `unknown spec '${p.slug}'`,
    'spec-not-found': (p) => `spec '${p.slug}' not found: missing ${p.path}`,
    'not-broken-down': (p) => `spec '${p.slug}' has not been broken down yet`,
    'issue-not-found': (p) => `issue '${p.number}' not found in INDEX.md`,
    'start-done-issue': (p) => `issue '${p.number}' is already done — run midas reopen first`,
    'validation-failed': (p) => `validation failed: ${p.errors} error(s)`,
  },
  status: {
    notBrokenDown: (slug) => `Spec '${slug}' has not been broken down yet.`,
    noSpecs: 'No specs found.',
    issuesSummary: (total, done, inProgress, pending) =>
      inProgress > 0
        ? `${total} issues · ${done} done · ${inProgress} in progress · ${pending} pending`
        : `${total} issues · ${done} done · ${pending} pending`,
    notBrokenDownBadge: 'not broken down',
    blockedBy: (list) => `blocked by: ${list}`,
    inProgressLabel: 'in progress',
    groupInProgress: 'IN PROGRESS',
    groupNotStarted: 'NOT STARTED',
    groupNotBrokenDown: 'NOT BROKEN DOWN',
    groupDone: (count) => `DONE (${count})`,
    nextIssue: (number, title) => `next: ${number} — ${title}`,
  },
  toggle: {
    marked: (label, done) => `Marked ${label} as ${done ? 'done' : 'reopened'}.`,
    already: (label, done) => `${label} is already ${done ? 'done' : 'open'}.`,
    started: (label) => `Marked ${label} as in progress.`,
    alreadyStarted: (label) => `${label} is already in progress.`,
    newlyReady: (label) => `Newly ready: ${label}`,
    noneUnblocked: 'No issues newly unblocked.',
  },
  validate: {
    severity: (s) => s,
    summary: (ok, errors, warnings) =>
      `${ok ? 'OK' : 'FAILED'}: ${errors} error(s), ${warnings} warning(s)`,
  },
};

/**
 * CLI human output is always en-US, regardless of the configured `language`
 * (which governs only spec/issue content and AI conversation).
 */
export function getMessages(): Messages {
  return EN;
}
