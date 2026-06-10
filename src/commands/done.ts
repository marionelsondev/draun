import { Command } from 'commander';
import { printResult } from '../lib/output.js';
import { resolveSpecsRoot } from '../lib/new.js';
import { getMessages, type Messages } from '../lib/messages.js';
import { setIssueDone, type ToggleOutcome } from '../lib/track.js';
import { dim, gold, goldBright, sym } from '../lib/theme.js';

export function renderToggle(outcome: ToggleOutcome, messages: Messages = getMessages()): string {
  const mark = outcome.done ? gold(sym.check) : dim(sym.off);
  const label = `${outcome.number} — ${outcome.title}`;
  const lines = [
    outcome.changed
      ? `${mark} ${messages.toggle.marked(label, outcome.done)}`
      : `${dim(sym.dot)} ${messages.toggle.already(label, outcome.done)}`,
  ];
  if (outcome.done) {
    if (outcome.newlyReady.length > 0) {
      for (const issue of outcome.newlyReady) {
        lines.push(
          `${goldBright(sym.active)} ${messages.toggle.newlyReady(gold(`${issue.number} — ${issue.title}`))}`,
        );
      }
    } else {
      lines.push(dim(messages.toggle.noneUnblocked));
    }
  }
  return lines.join('\n');
}

function makeToggleCommand(name: string, description: string, done: boolean): Command {
  return new Command(name)
    .description(description)
    .argument('<slug>', 'spec slug')
    .argument('<number>', 'issue number (e.g. 01)')
    .action(async (slug: string, number: string, _opts: unknown, cmd: Command) => {
      const padded = number.padStart(2, '0');
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const messages = getMessages();
      const root = await resolveSpecsRoot(process.cwd());
      const outcome = await setIssueDone(root, slug, padded, done);
      printResult(outcome, renderToggle(outcome, messages), json);
    });
}

export function makeDoneCommand(): Command {
  return makeToggleCommand('done', "Mark a spec's issue as done in INDEX.md", true);
}

export function makeReopenCommand(): Command {
  return makeToggleCommand('reopen', "Reopen a spec's issue in INDEX.md", false);
}
