import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { CliError } from './output.js';
import { resolveLanguage, type Language } from './language.js';

/** Project-layer config, relative to the repo root. */
export const PROJECT_CONFIG_RELPATH = '.draun/config.yaml';

/** Specs always live here, relative to the repo root — not configurable. */
export const SPECS_ROOT_REL = '.draun/specs';

/** Global (per-user) config path, derived from the OS home directory. */
export function globalConfigPath(homeDir = homedir()): string {
  return join(homeDir, '.draun', 'config.yaml');
}

/**
 * Find the project root by walking up from `startDir` until a directory
 * containing a `.draun/` folder is found. The home directory is skipped:
 * `~/.draun` holds the global config and does not mark a project root.
 * Returns null when no root is found up to the filesystem root.
 */
export async function findProjectRoot(
  startDir: string,
  homeDir = homedir(),
): Promise<string | null> {
  // The real user home is never a project root either, even when a different
  // homeDir is injected (tests run under %TEMP%, which lives below it).
  const skip = new Set([resolve(homeDir)]);
  const envHome = process.env.USERPROFILE ?? process.env.HOME;
  if (envHome !== undefined && envHome !== '') {
    skip.add(resolve(envHome));
  }
  let dir = resolve(startDir);
  for (;;) {
    if (!skip.has(dir)) {
      try {
        if ((await stat(join(dir, '.draun'))).isDirectory()) {
          return dir;
        }
      } catch {
        // .draun absent here: keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Like findProjectRoot, but throws the standard "project not initialized"
 * CliError (exit 1) when no `.draun/` directory is found.
 */
export async function requireProjectRoot(startDir: string, homeDir = homedir()): Promise<string> {
  const root = await findProjectRoot(startDir, homeDir);
  if (root === null) {
    throw new CliError('project not initialized — run draun init', 1);
  }
  return root;
}

/**
 * Read one config layer. A missing file, malformed YAML, or a non-object
 * root all resolve to null (the layer is treated as absent).
 */
async function readLayer(path: string): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = load(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }
  return parsed as Record<string, unknown>;
}

export interface ResolvedConfig {
  language: Language;
  tools: string[];
}

function coerceStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Resolve the effective configuration from the two layers:
 * project (`<repo>/.draun/config.yaml`) > global (`~/.draun/config.yaml`)
 * > built-in defaults, field by field. `tools` is read from the global
 * layer only; `specsRoot` is never read from any layer.
 */
export async function resolveConfig(cwd: string, homeDir = homedir()): Promise<ResolvedConfig> {
  const global = (await readLayer(globalConfigPath(homeDir))) ?? {};
  const root = await findProjectRoot(cwd, homeDir);
  const project =
    root !== null ? ((await readLayer(join(root, PROJECT_CONFIG_RELPATH))) ?? {}) : {};

  const language = resolveLanguage(project.language ?? global.language ?? undefined);

  const tools = coerceStringList(global.tools);

  return {
    language,
    tools,
  };
}
