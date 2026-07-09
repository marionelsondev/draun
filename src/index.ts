import { Command, CommanderError } from 'commander';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { CliError, renderError } from './lib/output.js';
import { globalConfigExists } from './lib/global-setup.js';
import { red } from './lib/theme.js';
import { makeArchiveCommand } from './commands/archive.js';
import { makeConfigCommand } from './commands/config.js';
import { makeDoneCommand, makeReopenCommand } from './commands/done.js';
import { makeInitCommand } from './commands/init.js';
import { makeInstructionsCommand } from './commands/instructions.js';
import { makeIssuesCommand } from './commands/issues.js';
import { makeNewCommand } from './commands/new.js';
import { makeStartCommand } from './commands/start.js';
import { makeStatusCommand } from './commands/status.js';
import { makeUpdateCommand } from './commands/update.js';
import { makeValidateCommand } from './commands/validate.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string; description: string };

export interface CliIO {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

export function buildProgram(): Command {
  const program = new Command('draun');

  program
    .description(pkg.description)
    .version(`${pkg.name}@${pkg.version}`)
    .option('--json', 'emit machine-readable JSON output')
    .usage('[options] [command]')
    .exitOverride()
    .showHelpAfterError(false);

  program.argument('[command]').action((command: string | undefined) => {
    if (command) {
      throw new CliError(`unknown command '${command}'`, 1);
    }
    program.outputHelp();
  });

  program.addCommand(makeInitCommand());
  program.addCommand(makeConfigCommand());
  program.addCommand(makeUpdateCommand());
  program.addCommand(makeNewCommand());
  program.addCommand(makeInstructionsCommand());
  program.addCommand(makeStatusCommand());
  program.addCommand(makeIssuesCommand());
  program.addCommand(makeStartCommand());
  program.addCommand(makeDoneCommand());
  program.addCommand(makeReopenCommand());
  program.addCommand(makeValidateCommand());
  program.addCommand(makeArchiveCommand());

  return program;
}

export async function runCli(argv: string[], io?: Partial<CliIO>): Promise<number> {
  const stdout = io?.stdout ?? ((chunk: string) => process.stdout.write(chunk));
  const stderr = io?.stderr ?? ((chunk: string) => process.stderr.write(chunk));

  const program = buildProgram();
  program.configureOutput({ writeOut: stdout, writeErr: stderr });

  // First-use orientation: every real subcommand except init/config points at
  // the global setup when ~/.draun/config.yaml is missing. Suppressed under
  // --json, where both streams must stay machine-parseable.
  program.hook('preAction', async (_thisCommand, actionCommand) => {
    const name = actionCommand.name();
    if (name === 'draun' || name === 'init' || name === 'config') {
      return;
    }
    if (actionCommand.optsWithGlobals<{ json?: boolean }>().json === true) {
      return;
    }
    if (!(await globalConfigExists())) {
      stderr(red('Draun is not set up on this machine yet — run `draun init` to configure it.') + '\n');
    }
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      // help/version carry exitCode 0; parse errors carry non-zero.
      return err.exitCode;
    }
    if (err instanceof CliError) {
      const json = program.opts<{ json?: boolean }>().json === true;
      stderr(renderError(err.message, json) + '\n');
      return err.exitCode;
    }
    stderr(renderError(err instanceof Error ? err.message : String(err), false) + '\n');
    return 1;
  }
}

const isMain = (() => {
  if (process.argv[1] === undefined) {
    return false;
  }
  try {
    // npm bin shims may invoke the entry file through a symlink/junction
    // (npm link, global installs), while import.meta.url is the realpath —
    // canonicalize argv[1] so the two always compare equal.
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  process.exitCode = await runCli(process.argv.slice(2));
}
