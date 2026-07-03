import { Command } from 'commander';
import { printResult } from '../lib/output.js';
import { newSpec, SpecConflictError } from '../lib/new.js';
import { dim, gold, sym } from '../lib/theme.js';

export function makeNewCommand(): Command {
  return new Command('new')
    .description('Scaffold a new spec folder')
    .argument('<name>', 'human-readable spec name')
    .action(async (name: string, _opts: unknown, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      try {
        const result = await newSpec(process.cwd(), name);
        const humanText = `${gold(sym.check)} Created ${gold(result.relDir)}\n${dim(`Write the spec to ${result.relSpecPath} — or use the`)} ${gold('draun-spec')} ${dim('skill in your agent')}`;
        printResult(result, humanText, json);
      } catch (err) {
        if (err instanceof SpecConflictError) {
          err.message = `spec '${err.slug}' already exists at ${err.specPath}`;
        }
        throw err;
      }
    });
}
