import { Command } from 'commander';
import { printResult } from '../lib/output.js';
import { resolveSpecsRoot } from '../lib/new.js';
import { getMessages, type Messages } from '../lib/messages.js';
import { setIssueState, type ToggleOutcome } from '../lib/track.js';
import { dim, goldBright, sym } from '../lib/theme.js';

export function renderStart(outcome: ToggleOutcome, messages: Messages = getMessages()): string {
  const label = `${outcome.number} — ${outcome.title}`;
  return outcome.changed
    ? `${goldBright(sym.wip)} ${messages.toggle.started(label)}`
    : `${dim(sym.dot)} ${messages.toggle.alreadyStarted(label)}`;
}

export function makeStartCommand(): Command {
  return new Command('start')
    .description("Mark a spec's issue as in progress in INDEX.md")
    .argument('<slug>', 'spec slug')
    .argument('<number>', 'issue number (e.g. 01)')
    .action(async (slug: string, number: string, _opts: unknown, cmd: Command) => {
      const padded = number.padStart(2, '0');
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const messages = getMessages();
      const root = await resolveSpecsRoot(process.cwd());
      const outcome = await setIssueState(root, slug, padded, 'in-progress');
      printResult(outcome, renderStart(outcome, messages), json);
    });
}
