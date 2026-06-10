import { Command } from 'commander';
import { CliError, printResult } from '../lib/output.js';
import { resolveSpecsRoot } from '../lib/new.js';
import { listIssues, type IssueFilter, type IssuesResult, type ResolvedIssue } from '../lib/issues.js';

function renderIssueLine(issue: ResolvedIssue): string {
  const box = issue.done ? '[x]' : issue.state === 'in-progress' ? '[~]' : '[ ]';
  const annotation =
    issue.state === 'blocked'
      ? ` (blocked by: ${issue.pendingBlockers.join(', ')})`
      : ` (${issue.state})`;
  return `${box} ${issue.number} — ${issue.title}${annotation}`;
}

export function renderIssues(result: IssuesResult): string {
  if (result.issues.length === 0) {
    return result.filter === 'all' ? 'No issues.' : `No ${result.filter} issues.`;
  }
  return result.issues.map(renderIssueLine).join('\n');
}

export function makeIssuesCommand(): Command {
  return new Command('issues')
    .description('List a spec’s issues with dependency-aware filters')
    .argument('<slug>', 'spec slug to inspect')
    .option('--ready', 'only issues that are not done and have no pending blockers')
    .option('--blocked', 'only issues with pending blockers')
    .option('--done', 'only completed issues')
    .action(
      async (
        slug: string,
        opts: { ready?: boolean; blocked?: boolean; done?: boolean },
        cmd: Command,
      ) => {
        const flags: IssueFilter[] = [];
        if (opts.ready === true) flags.push('ready');
        if (opts.blocked === true) flags.push('blocked');
        if (opts.done === true) flags.push('done');
        if (flags.length > 1) {
          throw new CliError('--ready, --blocked, and --done are mutually exclusive', 2);
        }
        const filter: IssueFilter = flags[0] ?? 'all';
        const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
        const root = await resolveSpecsRoot(process.cwd());
        const result = await listIssues(root, slug, filter);
        printResult(result, renderIssues(result), json);
      },
    );
}
