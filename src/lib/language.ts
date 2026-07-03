import { homedir } from 'node:os';
import { CliError } from './output.js';
import { resolveConfig } from './config.js';

export const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en-US';

/**
 * Coerce a raw config value to a Language. Absent values (undefined/null)
 * resolve to the default; anything else unsupported throws a CliError.
 */
export function resolveLanguage(value: unknown): Language {
  if (value === undefined || value === null) {
    return DEFAULT_LANGUAGE;
  }
  if (SUPPORTED_LANGUAGES.includes(value as Language)) {
    return value as Language;
  }
  throw new CliError(
    `unsupported language '${String(value)}' — supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`,
    1,
  );
}

/**
 * The effective language resolved from the layered config
 * (project `.draun/config.yaml` > global `~/.draun/config.yaml` > default).
 * Missing files, unparseable YAML, or absent keys resolve to the default;
 * an unsupported value throws a CliError.
 */
export async function readConfigLanguage(cwd: string, homeDir = homedir()): Promise<Language> {
  return (await resolveConfig(cwd, homeDir)).language;
}
