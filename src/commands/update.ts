import { Command } from 'commander';
import { printResult } from '../lib/output.js';
import { runUpdate, type UpdateReport } from '../lib/update.js';
import { renderToolFiles } from './init.js';
import { dim, footer, gold, header, line, step } from '../lib/theme.js';

export interface UpdatePayload {
  tools: string[];
  generated: UpdateReport;
}

export function renderUpdate(payload: UpdatePayload): string {
  const lines: string[] = [header('update'), line()];
  if (payload.tools.length > 0) {
    lines.push(step(`Tools: ${gold(payload.tools.join(', '))}`));
  } else {
    lines.push(step(dim('No tools configured.')));
  }
  renderToolFiles('Skills', payload.generated.skills, lines);
  lines.push(line());
  lines.push(footer(dim('Global integration files refreshed.')));
  return lines.join('\n');
}

export function makeUpdateCommand(): Command {
  return new Command('update')
    .description('Regenerate the global draun integration files from the configured tools')
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const report = await runUpdate();
      const payload: UpdatePayload = { tools: report.tools, generated: report };
      printResult(payload, renderUpdate(payload), json);
    });
}
