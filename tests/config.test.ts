import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../src/lib/output.js';
import { globalConfigPath, resolveConfig } from '../src/lib/config.js';
import { DEFAULT_SPECS_ROOT } from '../src/lib/init.js';
import { resolveSpecsRoot } from '../src/lib/new.js';

let repoDir: string;
let homeDir: string;

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'draun-config-repo-'));
  homeDir = await mkdtemp(join(tmpdir(), 'draun-config-home-'));
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
  await rm(homeDir, { recursive: true, force: true });
});

async function writeGlobalConfig(content: string): Promise<void> {
  await mkdir(join(homeDir, '.draun'), { recursive: true });
  await writeFile(globalConfigPath(homeDir), content, 'utf8');
}

async function writeProjectConfig(content: string): Promise<void> {
  await mkdir(join(repoDir, '.draun'), { recursive: true });
  await writeFile(join(repoDir, '.draun', 'config.yaml'), content, 'utf8');
}

describe('globalConfigPath', () => {
  it('joins the home dir with .draun/config.yaml', () => {
    expect(globalConfigPath(homeDir)).toBe(join(homeDir, '.draun', 'config.yaml'));
  });
});

describe('resolveConfig', () => {
  it('returns built-in defaults when neither layer exists', async () => {
    const config = await resolveConfig(repoDir, homeDir);

    expect(config).toEqual({
      language: 'en-US',
      tools: [],
    });
  });

  it('uses the global layer when only it exists', async () => {
    await writeGlobalConfig('language: pt-BR\ntools:\n  - claude-code\n');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('pt-BR');
    expect(config.tools).toEqual(['claude-code']);
  });

  it('uses the project layer when only it exists', async () => {
    await writeProjectConfig('language: pt-BR\n');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('pt-BR');
    expect(config.tools).toEqual([]);
  });

  it('project overrides global per field, absent fields fall through', async () => {
    await writeGlobalConfig('language: en-US\ntools:\n  - claude-code\n');
    await writeProjectConfig('language: pt-BR\n');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('pt-BR'); // project wins
    expect(config.tools).toEqual(['claude-code']); // global only
  });

  it('ignores a tools key in the project config', async () => {
    await writeGlobalConfig('language: en-US\n');
    await writeProjectConfig('tools:\n  - cursor\n');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.tools).toEqual([]);
  });

  it('coerces a string tools value from the global config to a list', async () => {
    await writeGlobalConfig('tools: claude-code\n');

    expect((await resolveConfig(repoDir, homeDir)).tools).toEqual(['claude-code']);
  });

  it('ignores specsRoot in both layers — specs root stays fixed', async () => {
    await writeGlobalConfig('specsRoot: global/specs\n');
    await writeProjectConfig('specsRoot: other/dir\n');

    const config = await resolveConfig(repoDir, homeDir);
    expect(config).not.toHaveProperty('specsRoot');
    expect(await resolveSpecsRoot(repoDir)).toBe(join(repoDir, DEFAULT_SPECS_ROOT));
  });

  it('treats malformed YAML in the global layer as an absent layer', async () => {
    await writeGlobalConfig('language: [unclosed\n  ::bad');
    await writeProjectConfig('language: pt-BR\n');

    expect((await resolveConfig(repoDir, homeDir)).language).toBe('pt-BR');
  });

  it('treats malformed YAML in the project layer as an absent layer', async () => {
    await writeGlobalConfig('language: pt-BR\n');
    await writeProjectConfig('language: [unclosed\n  ::bad');

    expect((await resolveConfig(repoDir, homeDir)).language).toBe('pt-BR');
  });

  it('falls back to defaults when both layers are malformed', async () => {
    await writeGlobalConfig('language: [unclosed\n  ::bad');
    await writeProjectConfig('language: [unclosed\n  ::bad');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('en-US');
  });

  it('rejects with CliError exit 1 naming an invalid language in the project layer', async () => {
    await writeProjectConfig('language: fr-FR\n');

    let caught: unknown;
    try {
      await resolveConfig(repoDir, homeDir);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain("'fr-FR'");
  });

  it('rejects with CliError exit 1 for an invalid language in the global layer', async () => {
    await writeGlobalConfig('language: xx-XX\n');

    await expect(resolveConfig(repoDir, homeDir)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("'xx-XX'"),
    });
  });

  it('a valid project language masks an invalid global language', async () => {
    await writeGlobalConfig('language: xx-XX\n');
    await writeProjectConfig('language: en-US\n');

    expect((await resolveConfig(repoDir, homeDir)).language).toBe('en-US');
  });
});
