import { Command } from 'commander';
import { printResult } from '../lib/output.js';
import { resolveSpecsRoot } from '../lib/new.js';
import { getMessages, type Messages } from '../lib/messages.js';
import { listSpecStatuses, readSpecStatus, type IndexIssue, type SpecStatus } from '../lib/index-parser.js';
import { bold, dim, gold, goldBright, progressBar, sym } from '../lib/theme.js';

function renderIssueLine(issue: IndexIssue, messages: Messages): string {
  if (issue.done) {
    return `${gold(sym.check)} ${dim(`${issue.number} — ${issue.title}`)}`;
  }
  if (issue.state === 'in-progress') {
    return `${goldBright(sym.wip)} ${issue.number} — ${issue.title} ${dim(`(${messages.status.inProgressLabel})`)}`;
  }
  const blocked =
    issue.blockedBy.length > 0
      ? dim(` (${messages.status.blockedBy(issue.blockedBy.join(', '))})`)
      : '';
  return `${dim(sym.off)} ${issue.number} — ${issue.title}${blocked}`;
}

function renderProgressHeader(status: SpecStatus, messages: Messages): string {
  return `${bold(status.slug)}  ${progressBar(status.done, status.inProgress, status.total)}  ${messages.status.issuesSummary(status.total, status.done, status.inProgress, status.pending)}`;
}

export function renderSpecDetail(status: SpecStatus, messages: Messages = getMessages()): string {
  if (!status.brokenDown) {
    return messages.status.notBrokenDown(status.slug);
  }
  return [
    renderProgressHeader(status, messages),
    ...status.issues.map((issue) => renderIssueLine(issue, messages)),
  ].join('\n');
}

export function renderSpecList(statuses: SpecStatus[], messages: Messages = getMessages()): string {
  if (statuses.length === 0) {
    return messages.status.noSpecs;
  }
  const width = Math.max(...statuses.map((s) => s.slug.length));
  return statuses
    .map((s) =>
      s.brokenDown
        ? `${bold(s.slug.padEnd(width))}  ${progressBar(s.done, s.inProgress, s.total)}  ${messages.status.issuesSummary(s.total, s.done, s.inProgress, s.pending)}`
        : `${bold(s.slug.padEnd(width))}  ${dim(messages.status.notBrokenDownBadge)}`,
    )
    .join('\n\n');
}

export function makeStatusCommand(): Command {
  return new Command('status')
    .description('Show spec progress')
    .argument('[slug]', 'spec slug to inspect')
    .action(async (slug: string | undefined, _opts: unknown, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const messages = getMessages();
      const root = await resolveSpecsRoot(process.cwd());
      if (slug !== undefined) {
        const status = await readSpecStatus(root, slug);
        printResult(status, renderSpecDetail(status, messages), json);
      } else {
        const statuses = await listSpecStatuses(root);
        printResult({ specs: statuses }, renderSpecList(statuses, messages), json);
      }
    });
}
