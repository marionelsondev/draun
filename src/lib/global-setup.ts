import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { CliError } from './output.js';
import { banner } from './theme.js';
import { globalConfigPath } from './config.js';
import { DEFAULT_LANGUAGE, resolveLanguage, type Language } from './language.js';
import { pickCheckbox, pickSelect, type PickerIO, type SelectItem } from './picker.js';
import { detectTools, resolveToolsFlag, TOOL_REGISTRY, type ToolDescriptor } from './tools.js';

/** Language choices for the global-setup select picker. */
export const LANGUAGE_CHOICES: SelectItem[] = [
  { id: 'en-US', label: 'en-US — English (United States)' },
  { id: 'pt-BR', label: 'pt-BR — Português (Brasil)' },
];

/** Whether the global (per-user) config file already exists. */
export async function globalConfigExists(homeDir = homedir()): Promise<boolean> {
  try {
    await access(globalConfigPath(homeDir));
    return true;
  } catch {
    return false;
  }
}

/** Serialize the global config YAML (pure). */
export function renderGlobalConfig(toolIds: string[], language: Language): string {
  const tools =
    toolIds.length === 0
      ? 'tools: []\n'
      : `tools:\n${toolIds.map((id) => `  - ${id}`).join('\n')}\n`;
  return `# Draun global configuration\n${tools}language: ${language}\n`;
}

/** Write `~/.draun/config.yaml` (creating `~/.draun`), returning its path. */
export async function writeGlobalConfig(
  toolIds: string[],
  language: Language,
  homeDir = homedir()
): Promise<string> {
  const path = globalConfigPath(homeDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderGlobalConfig(toolIds, language), 'utf8');
  return path;
}

export interface GlobalSetupOptions {
  toolsFlag?: string;
  languageFlag?: string;
  interactive: boolean;
  io?: PickerIO;
}

export interface GlobalSetupResult {
  configPath: string;
  tools: ToolDescriptor[];
  language: Language;
}

/**
 * First-run global setup: resolve the tool selection and language (from
 * flags, or the interactive pickers) and persist them to the global config.
 * Integration files are NOT generated here — the caller (init) generates
 * them once with the same selection.
 */
export async function runGlobalSetup(
  cwd: string,
  opts: GlobalSetupOptions,
  homeDir = homedir()
): Promise<GlobalSetupResult> {
  if (!opts.interactive && (opts.toolsFlag === undefined || opts.languageFlag === undefined)) {
    throw new CliError(
      'global setup required — ~/.draun/config.yaml not found; run `draun init` in a terminal or pass --tools <ids> and --language <en-US|pt-BR>',
      2
    );
  }

  const io: PickerIO = opts.io ?? { input: process.stdin, output: process.stdout };
  let shownBanner = false;
  const showBanner = (): void => {
    if (!shownBanner) {
      io.output.write(`${banner()}\n`);
      shownBanner = true;
    }
  };

  let tools: ToolDescriptor[];
  if (opts.toolsFlag !== undefined) {
    tools = resolveToolsFlag(opts.toolsFlag);
  } else {
    showBanner();
    const detected = await detectTools(cwd);
    const detectedIds = new Set(detected.map((tool) => tool.id));
    const pickedIds = await pickCheckbox(
      TOOL_REGISTRY.map((tool) => ({
        id: tool.id,
        label: tool.name,
        checked: detectedIds.has(tool.id),
      })),
      io
    );
    tools = TOOL_REGISTRY.filter((tool) => pickedIds.includes(tool.id));
  }

  let language: Language;
  if (opts.languageFlag !== undefined) {
    language = resolveLanguage(opts.languageFlag);
  } else {
    showBanner();
    const picked = await pickSelect('Select language', LANGUAGE_CHOICES, DEFAULT_LANGUAGE, io);
    language = resolveLanguage(picked);
  }

  const configPath = await writeGlobalConfig(
    tools.map((tool) => tool.id),
    language,
    homeDir
  );
  return { configPath, tools, language };
}
