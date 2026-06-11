import { Command } from 'commander';
import { CliError, printResult } from '../lib/output.js';
import { getInstructions, type Artifact } from '../lib/instructions.js';

export function makeInstructionsCommand(): Command {
  return new Command('instructions')
    .description('Emit artifact-writing instructions for AI skills')
    .argument('<artifact>', 'spec | break | analyze')
    .option('--spec <slug>', 'target spec slug (required for break and analyze)')
    .action(async (artifact: string, opts: { spec?: string }, cmd: Command) => {
      if (artifact !== 'spec' && artifact !== 'break' && artifact !== 'analyze') {
        throw new CliError(
          `unknown artifact '${artifact}' — expected 'spec', 'break', or 'analyze'`,
          2
        );
      }
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const payload = await getInstructions(process.cwd(), artifact as Artifact, opts.spec);
      const ruleLines =
        payload.rules.length > 0
          ? payload.rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')
          : '(none)';
      const humanText = [
        payload.artifact === 'analyze'
          ? `Analyze the spec at ${payload.relOutputPath}`
          : `Write the ${payload.artifact} artifact to ${payload.relOutputPath}`,
        'Rules:',
        ruleLines,
        `Language: ${payload.language} — ${payload.languageDirective}`,
        'Run with --json to get the full template and context.',
      ].join('\n');
      printResult(payload, humanText, json);
    });
}
