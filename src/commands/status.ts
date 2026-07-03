import { Command } from 'commander';
import { printResult } from '../lib/output.js';
import { resolveSpecsRoot } from '../lib/new.js';
import { getMessages, type Messages } from '../lib/messages.js';
import { listSpecStatuses, readSpecStatus, type IndexIssue, type SpecStatus } from '../lib/index-parser.js';
import { resolveIssues, type ResolvedIssue } from '../lib/issues.js';
import { classify, compareActiveSpecs, type SpecGroup } from '../tui/data.js';
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

function nextActionable(s: SpecStatus): ResolvedIssue | undefined {
  const resolved = resolveIssues(s.issues);
  return (
    resolved.find((i) => i.state === 'in-progress') ?? resolved.find((i) => i.state === 'ready')
  );
}

function renderGroupSpecs(specs: SpecStatus[], messages: Messages): string[] {
  const width = Math.max(...specs.map((s) => s.slug.length));
  return specs.flatMap((s) => {
    if (!s.brokenDown) {
      return [`  ${bold(s.slug.padEnd(width))}  ${dim(messages.status.notBrokenDownBadge)}`];
    }
    const lines = [
      `  ${bold(s.slug.padEnd(width))}  ${progressBar(s.done, s.inProgress, s.total)}  ${messages.status.issuesSummary(s.total, s.done, s.inProgress, s.pending)}`,
    ];
    const next = nextActionable(s);
    if (next !== undefined) {
      lines.push(`    ${dim(`${sym.arrow} ${messages.status.nextIssue(next.number, next.title)}`)}`);
    }
    return lines;
  });
}

export function renderSpecList(statuses: SpecStatus[], messages: Messages = getMessages()): string {
  if (statuses.length === 0) {
    return messages.status.noSpecs;
  }
  const groups = new Map<SpecGroup, SpecStatus[]>();
  for (const s of statuses) {
    const group = classify(s);
    groups.set(group, [...(groups.get(group) ?? []), s]);
  }
  const active = (groups.get('in-progress') ?? []).slice().sort(compareActiveSpecs);

  const sections: string[] = [];
  if (active.length > 0) {
    sections.push(
      [bold(gold(messages.status.groupInProgress)), ...renderGroupSpecs(active, messages)].join('\n'),
    );
  }
  const notStarted = groups.get('not-started') ?? [];
  if (notStarted.length > 0) {
    sections.push(
      [bold(gold(messages.status.groupNotStarted)), ...renderGroupSpecs(notStarted, messages)].join('\n'),
    );
  }
  const notBrokenDown = groups.get('not-broken-down') ?? [];
  if (notBrokenDown.length > 0) {
    sections.push(
      [bold(gold(messages.status.groupNotBrokenDown)), ...renderGroupSpecs(notBrokenDown, messages)].join('\n'),
    );
  }
  const done = groups.get('done') ?? [];
  if (done.length > 0) {
    const slugs = done.map((s) => s.slug).join(` ${sym.dot} `);
    sections.push(
      `${bold(gold(messages.status.groupDone(done.length)))}  ${dim(`${sym.check} ${slugs}`)}`,
    );
  }
  return sections.join('\n\n');
}

export function makeStatusCommand(): Command {
  return new Command('status')
    .description('Show spec progress')
    .argument('[slug]', 'spec slug to inspect')
    .action(async (slug: string | undefined, _opts: unknown, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const messages = getMessages();
      const root = await resolveSpecsRoot(process.cwd());

      // Interactive, real-time TUI when attached to a terminal; the one-shot
      // path stays for --json and non-TTY (pipes, CI, tests).
      if (!json && process.stdout.isTTY) {
        const { runStatusTui } = await import('../tui/render.js');
        await runStatusTui(root, slug);
        return;
      }

      if (slug !== undefined) {
        const status = await readSpecStatus(root, slug);
        printResult(status, renderSpecDetail(status, messages), json);
      } else {
        const statuses = await listSpecStatuses(root);
        printResult({ specs: statuses }, renderSpecList(statuses, messages), json);
      }
    });
}
