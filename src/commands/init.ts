import { Command } from 'commander';
import { relative } from 'node:path';
import { printResult } from '../lib/output.js';
import { dim, footer, gold, header, line, step, sym } from '../lib/theme.js';
import {
  generateIntegrations,
  initProject,
  type GeneratedReport,
  type InitResult,
} from '../lib/init.js';
import { resolveToolsFlag, TOOL_REGISTRY, type ToolDescriptor } from '../lib/tools.js';
import { readConfigLanguage } from '../lib/language.js';
import { findProjectRoot, resolveConfig } from '../lib/config.js';
import { globalConfigExists, runGlobalSetup } from '../lib/global-setup.js';

export interface InitPayload extends InitResult {
  tools: string[];
  language: string;
  generated: GeneratedReport;
  globalSetup: { performed: boolean; configPath: string | null };
}

interface InitOptions {
  tools?: string;
  language?: string;
  force?: boolean;
}

export function renderToolFiles(
  layer: string,
  group: GeneratedReport['skills'],
  lines: string[]
): void {
  if (group.byTool.length === 0 && group.skipped.length === 0) {
    return;
  }
  lines.push(line());
  lines.push(step(`${layer}:`));
  for (const entry of group.byTool) {
    lines.push(line(gold(entry.tool)));
    for (const file of entry.files) {
      lines.push(line(`  ${dim(file)}`));
    }
  }
  if (group.skipped.length > 0) {
    lines.push(line(dim(`skipped (not supported): ${group.skipped.join(', ')}`)));
  }
}

export function renderInit(payload: InitPayload, cwd: string): string {
  const lines: string[] = [header('init'), line()];
  lines.push(
    step(payload.initialized ? 'Initialized Draun project.' : 'Project already initialized.')
  );
  lines.push(
    line(
      `${gold(sym.check)} ${relative(cwd, payload.specsRoot)} ${dim(
        payload.createdSpecsRoot ? 'created' : 'already exists'
      )}`
    )
  );
  lines.push(
    line(
      `${gold(sym.check)} ${relative(cwd, payload.configPath)} ${dim(
        payload.createdConfig ? 'created' : 'kept existing'
      )}`
    )
  );
  if (payload.globalSetup.performed && payload.globalSetup.configPath !== null) {
    lines.push(line());
    lines.push(step(`Global setup: saved ${gold(payload.globalSetup.configPath)}`));
  }
  lines.push(line());
  lines.push(
    step(`Tools: ${payload.tools.length > 0 ? gold(payload.tools.join(', ')) : dim('none')}`)
  );
  lines.push(line());
  lines.push(step(`Language: ${gold(payload.language)}`));
  lines.push(line());
  lines.push(step(`${payload.generated.agents.path} ${dim(payload.generated.agents.action)}`));
  renderToolFiles('Skills', payload.generated.skills, lines);
  lines.push(line());
  lines.push(footer(`${dim(`Next ${sym.dot} use the`)} ${gold('draun-spec')} ${dim('skill in your agent')}`));
  return lines.join('\n');
}

/**
 * Tool selection when the global config already exists: the --tools flag
 * wins, otherwise the global `tools` is reused — no questions asked.
 */
async function resolveSelectionWithGlobal(
  cwd: string,
  opts: InitOptions
): Promise<ToolDescriptor[]> {
  if (opts.tools !== undefined) {
    return resolveToolsFlag(opts.tools);
  }
  const configured = (await resolveConfig(cwd)).tools;
  return TOOL_REGISTRY.filter((tool) => configured.includes(tool.id));
}

export function makeInitCommand(): Command {
  return new Command('init')
    .description('Prepare the repository for the SDD workflow')
    .option('--tools <ids>', 'comma-separated tool ids (or "all"); skips the prompt')
    .option(
      '--language <id>',
      'language for the first-run global setup (en-US or pt-BR); skips the prompt'
    )
    .option('--force', 'skip the prompt, using the tools from the global config')
    .action(async (opts: InitOptions, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true;
      const cwd = process.cwd();
      // Re-running inside a subdirectory of an initialized project acts on
      // the existing root; a fresh repo initializes at the cwd.
      const root = (await findProjectRoot(cwd)) ?? cwd;

      let selected: ToolDescriptor[];
      let globalSetup: InitPayload['globalSetup'] = { performed: false, configPath: null };
      if (await globalConfigExists()) {
        selected = await resolveSelectionWithGlobal(cwd, opts);
      } else {
        const interactive =
          opts.force !== true &&
          !json &&
          process.stdin.isTTY === true &&
          process.stdout.isTTY === true;
        const setup = await runGlobalSetup(cwd, {
          toolsFlag: opts.tools,
          languageFlag: opts.language,
          interactive,
        });
        selected = setup.tools;
        globalSetup = { performed: true, configPath: setup.configPath };
      }

      // Resolved from the layered config (project > global > default); init
      // never prompts for it nor writes it — the override is a manual edit.
      const language = await readConfigLanguage(cwd);
      const result = await initProject(root);
      const generated = await generateIntegrations(root, selected);
      const toolIds = selected.map((tool) => tool.id);

      const payload: InitPayload = { ...result, tools: toolIds, language, generated, globalSetup };
      printResult(payload, renderInit(payload, root), json);
    });
}
