import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dump, load } from 'js-yaml';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  findProjectRoot,
  globalConfigPath,
  PROJECT_CONFIG_RELPATH,
  readGlobalConfigLayer,
  resolveConfig,
} from './config.js';
import { globalConfigExists, writeGlobalConfig } from './global-setup.js';
import { DEFAULT_LANGUAGE, resolveLanguage, type Language } from './language.js';
import { CliError } from './output.js';
import { generateSkills, removeSkills } from './skills-gen.js';
import {
  detectTools,
  resolveToolsFlag,
  TOOL_REGISTRY,
  type ToolDescriptor,
} from './tools.js';
import type { ToolFiles } from './init.js';

export type LanguageScope = 'global' | 'project';

export interface ConfigCommandOptions {
  tools?: string;
  language?: string;
  scope?: string;
  /** @deprecated Interactive path is the Config TUI; kept for API compatibility. */
  interactive?: boolean;
  /** When true and no mutating flags, return a read-only snapshot. */
  json: boolean;
}

export interface ConfigShowPayload {
  mode: 'show';
  tools: string[];
  language: string;
  globalLanguage: string;
  globalConfigPath: string;
  projectConfigPath: string | null;
  projectRoot: string | null;
  projectScopeAvailable: boolean;
  globalConfigExists: boolean;
}

export interface ConfigApplyPayload {
  mode: 'apply';
  tools: string[];
  language: string;
  languageScope: LanguageScope;
  globalConfigPath: string;
  projectConfigPath: string | null;
  projectRoot: string | null;
  skills: {
    generated: { byTool: ToolFiles[]; skipped: string[] };
    removed: { tool: string; paths: string[] }[];
  };
  bootstrapped: boolean;
  toolsChanged: boolean;
}

export type ConfigPayload = ConfigShowPayload | ConfigApplyPayload;

/** Snapshot used to seed the Config TUI draft. */
export interface ConfigDraftState {
  tools: string[];
  language: Language;
  languageScope: LanguageScope;
  globalLanguage: Language;
  projectRoot: string | null;
  projectConfigPath: string | null;
  globalConfigPath: string;
  globalConfigExists: boolean;
  projectScopeAvailable: boolean;
  /** True when global config was missing — first-time setup affordance. */
  firstTime: boolean;
}

export interface ApplyConfigChangeInput {
  cwd: string;
  homeDir?: string;
  tools: string[];
  language: Language;
  languageScope: LanguageScope;
  /** Previous global tools for skill diff; defaults to current global layer. */
  previousTools?: string[];
}

function toolsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function resolveScopeFlag(value: string | undefined): LanguageScope {
  if (value === undefined || value === '') {
    return 'global';
  }
  if (value === 'global' || value === 'project') {
    return value;
  }
  throw new CliError(`invalid scope '${value}' — use global or project`, 2);
}

/**
 * Merge `language` into the project config YAML, preserving other keys.
 * Creates the file (and parent dirs) when missing.
 */
export async function writeProjectLanguage(
  root: string,
  language: Language
): Promise<string> {
  const path = join(root, PROJECT_CONFIG_RELPATH);
  let doc: Record<string, unknown> = {};
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = load(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      doc = { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    // absent or unreadable — start fresh
  }
  doc.language = language;
  await mkdir(dirname(path), { recursive: true });
  const body = dump(doc, { lineWidth: 120, noRefs: true });
  await writeFile(path, `# Draun project configuration\n${body}`, 'utf8');
  return path;
}

async function readGlobalLayer(
  homeDir: string
): Promise<{ tools: string[]; language: Language; exists: boolean }> {
  const exists = await globalConfigExists(homeDir);
  const resolved = await readGlobalConfigLayer(homeDir);
  return {
    tools: resolved.tools,
    language: resolved.language,
    exists,
  };
}

function descriptorsFromIds(ids: string[]): ToolDescriptor[] {
  return TOOL_REGISTRY.filter((tool) => ids.includes(tool.id));
}

async function syncSkills(
  previousIds: string[],
  nextTools: ToolDescriptor[],
  homeDir: string
): Promise<ConfigApplyPayload['skills']> {
  const nextIds = new Set(nextTools.map((t) => t.id));
  const removedTools = descriptorsFromIds(previousIds.filter((id) => !nextIds.has(id)));

  const removed = await removeSkills(removedTools, homeDir);
  const generated: ConfigApplyPayload['skills']['generated'] = { byTool: [], skipped: [] };

  for (const tool of nextTools) {
    const skillResult = await generateSkills([tool], homeDir);
    if (skillResult.skipped.length > 0) {
      generated.skipped.push(tool.id);
    } else {
      generated.byTool.push({ tool: tool.id, files: skillResult.written });
    }
  }

  return { generated, removed: removed.byTool };
}

/**
 * Load the draft state for the Config TUI (or any interactive editor).
 * When global config is missing, pre-select tools detected in cwd.
 */
export async function loadConfigDraft(
  cwd: string,
  homeDir = homedir()
): Promise<ConfigDraftState> {
  const projectRoot = await findProjectRoot(cwd, homeDir);
  const projectConfigPath =
    projectRoot !== null ? join(projectRoot, PROJECT_CONFIG_RELPATH) : null;
  const gPath = globalConfigPath(homeDir);
  const globalLayer = await readGlobalLayer(homeDir);
  const effective = await resolveConfig(cwd, homeDir);

  let tools = globalLayer.tools;
  if (!globalLayer.exists || tools.length === 0) {
    const detected = await detectTools(cwd);
    if (detected.length > 0 && tools.length === 0) {
      tools = detected.map((t) => t.id);
    }
  }

  // Prefer project scope when the project file already overrides language.
  let languageScope: LanguageScope = 'global';
  let language: Language = globalLayer.language;
  if (projectRoot !== null && projectConfigPath !== null) {
    try {
      const raw = await readFile(projectConfigPath, 'utf8');
      const parsed = load(raw);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).language !== undefined
      ) {
        languageScope = 'project';
        language = effective.language;
      }
    } catch {
      // no project language key
    }
  }
  if (languageScope === 'global') {
    language = globalLayer.exists ? globalLayer.language : DEFAULT_LANGUAGE;
  }

  return {
    tools,
    language,
    languageScope,
    globalLanguage: globalLayer.language,
    projectRoot,
    projectConfigPath,
    globalConfigPath: gPath,
    globalConfigExists: globalLayer.exists,
    projectScopeAvailable: projectRoot !== null,
    firstTime: !globalLayer.exists,
  };
}

/**
 * Persist tools + language and sync skills. Shared by flags path and the TUI.
 */
export async function applyConfigChange(
  input: ApplyConfigChangeInput
): Promise<ConfigApplyPayload> {
  const homeDir = input.homeDir ?? homedir();
  const projectRoot = await findProjectRoot(input.cwd, homeDir);
  const gPath = globalConfigPath(homeDir);
  const globalLayer = await readGlobalLayer(homeDir);

  if (input.languageScope === 'project' && projectRoot === null) {
    throw new CliError('project not initialized — run draun init', 1);
  }

  const previousToolIds = input.previousTools ?? globalLayer.tools;
  const nextTools = descriptorsFromIds(input.tools);
  // Preserve order from registry but only selected ids; also accept unknown filtered out
  const nextToolIds = nextTools.map((t) => t.id);
  const toolsChanged = !toolsEqual(previousToolIds, nextToolIds);
  const bootstrapped = !globalLayer.exists;

  let globalLanguageToWrite: Language = globalLayer.language;
  if (input.languageScope === 'global') {
    globalLanguageToWrite = input.language;
  } else if (bootstrapped) {
    globalLanguageToWrite = globalLayer.exists ? globalLayer.language : DEFAULT_LANGUAGE;
  }

  const mustWriteGlobal =
    bootstrapped || toolsChanged || input.languageScope === 'global' || !globalLayer.exists;
  if (mustWriteGlobal) {
    await writeGlobalConfig(nextToolIds, globalLanguageToWrite, homeDir);
  }

  let writtenProjectPath: string | null = null;
  if (input.languageScope === 'project' && projectRoot !== null) {
    writtenProjectPath = await writeProjectLanguage(projectRoot, input.language);
  }

  let skills: ConfigApplyPayload['skills'] = {
    generated: { byTool: [], skipped: [] },
    removed: [],
  };
  if (toolsChanged || bootstrapped) {
    skills = await syncSkills(previousToolIds, nextTools, homeDir);
  }

  return {
    mode: 'apply',
    tools: nextToolIds,
    language: input.language,
    languageScope: input.languageScope,
    globalConfigPath: gPath,
    projectConfigPath: writtenProjectPath,
    projectRoot,
    skills,
    bootstrapped,
    toolsChanged,
  };
}

/**
 * Flag / --json path for `draun config`. Interactive editing is the Config TUI.
 */
export async function runConfig(
  cwd: string,
  opts: ConfigCommandOptions,
  homeDir = homedir()
): Promise<ConfigPayload> {
  const projectRoot = await findProjectRoot(cwd, homeDir);
  const projectConfigPath =
    projectRoot !== null ? join(projectRoot, PROJECT_CONFIG_RELPATH) : null;
  const gPath = globalConfigPath(homeDir);
  const globalLayer = await readGlobalLayer(homeDir);
  const effective = await resolveConfig(cwd, homeDir);

  const hasMutatingFlags =
    opts.tools !== undefined || opts.language !== undefined || opts.scope !== undefined;

  if (!hasMutatingFlags) {
    if (opts.json) {
      return {
        mode: 'show',
        tools: effective.tools,
        language: effective.language,
        globalLanguage: globalLayer.language,
        globalConfigPath: gPath,
        projectConfigPath,
        projectRoot,
        projectScopeAvailable: projectRoot !== null,
        globalConfigExists: globalLayer.exists,
      };
    }
    throw new CliError(
      'config requires a terminal for the interactive UI, or pass --tools / --language / --scope (use --json to inspect the current config)',
      2
    );
  }

  const nextTools =
    opts.tools !== undefined
      ? resolveToolsFlag(opts.tools)
      : descriptorsFromIds(globalLayer.tools);
  const nextToolIds = nextTools.map((t) => t.id);

  let nextLanguage: Language;
  if (opts.language !== undefined) {
    nextLanguage = resolveLanguage(opts.language);
  } else {
    nextLanguage =
      opts.scope === 'project' && projectRoot !== null
        ? effective.language
        : globalLayer.language;
  }

  const scope = resolveScopeFlag(opts.scope);

  return applyConfigChange({
    cwd,
    homeDir,
    tools: nextToolIds,
    language: nextLanguage,
    languageScope: scope,
    previousTools: globalLayer.tools,
  });
}
