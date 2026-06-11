import { mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AGENTS_FILENAME, writeAgentsBlock } from './agents-md.js';
import { PROJECT_CONFIG_RELPATH, SPECS_ROOT_REL } from './config.js';
import { generateCommands } from './commands-gen.js';
import { generateSkills } from './skills-gen.js';
import type { ToolDescriptor } from './tools.js';

export const DEFAULT_SPECS_ROOT = '.midas/specs';

export const PROJECT_CONFIG_TEMPLATE = `# MidasSpec project configuration
# context: |                   # project background shown to AI skills
context:
# rules:
#   spec: []                   # per-artifact rules for \`midas spec\`
#   break: []                  # per-artifact rules for \`midas break\`
#   analyze: []                # per-artifact rules for \`midas analyze\`
rules:
`;

export interface InitResult {
  root: string;
  configPath: string;
  specsRoot: string;
  createdSpecsRoot: boolean;
  createdConfig: boolean;
  initialized: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create the per-repo structure at `rootDir`: the `.midas/specs/` folder and
 * a minimal `.midas/config.yaml` (only `context` and `rules`, commented).
 * An existing config is preserved byte for byte; only what is missing gets
 * created, so re-running is idempotent.
 */
export async function initProject(rootDir: string): Promise<InitResult> {
  const specsRoot = join(rootDir, SPECS_ROOT_REL);
  const configPath = join(rootDir, PROJECT_CONFIG_RELPATH);

  const created = await mkdir(specsRoot, { recursive: true });
  const createdSpecsRoot = created !== undefined;

  let createdConfig = false;
  if (!(await exists(configPath))) {
    await writeFile(configPath, PROJECT_CONFIG_TEMPLATE, 'utf8');
    createdConfig = true;
  }

  return {
    root: rootDir,
    configPath,
    specsRoot,
    createdSpecsRoot,
    createdConfig,
    initialized: createdSpecsRoot || createdConfig,
  };
}

export interface ToolFiles {
  tool: string;
  files: string[];
}

export interface GeneratedReport {
  agents: { path: string; action: 'created' | 'updated' | 'unchanged' };
  commands: { byTool: ToolFiles[]; skipped: string[] };
  skills: { byTool: ToolFiles[]; skipped: string[] };
}

/** Generate the three integration layers for the selected tools. */
export async function generateIntegrations(
  cwd: string,
  tools: ToolDescriptor[],
  home: string = homedir()
): Promise<GeneratedReport> {
  const agents = await writeAgentsBlock(cwd);
  const commands: GeneratedReport['commands'] = { byTool: [], skipped: [] };
  const skills: GeneratedReport['skills'] = { byTool: [], skipped: [] };

  for (const tool of tools) {
    const commandResult = await generateCommands([tool], home);
    if (commandResult.skipped.length > 0) {
      commands.skipped.push(tool.id);
    } else {
      commands.byTool.push({ tool: tool.id, files: commandResult.written });
    }
    const skillResult = await generateSkills([tool], home);
    if (skillResult.skipped.length > 0) {
      skills.skipped.push(tool.id);
    } else {
      skills.byTool.push({ tool: tool.id, files: skillResult.written });
    }
  }

  return { agents: { path: AGENTS_FILENAME, action: agents.action }, commands, skills };
}
