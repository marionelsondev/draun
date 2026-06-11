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
  repoDir = await mkdtemp(join(tmpdir(), 'midas-config-repo-'));
  homeDir = await mkdtemp(join(tmpdir(), 'midas-config-home-'));
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
  await rm(homeDir, { recursive: true, force: true });
});

async function writeGlobalConfig(content: string): Promise<void> {
  await mkdir(join(homeDir, '.midas'), { recursive: true });
  await writeFile(globalConfigPath(homeDir), content, 'utf8');
}

async function writeProjectConfig(content: string): Promise<void> {
  await mkdir(join(repoDir, '.midas'), { recursive: true });
  await writeFile(join(repoDir, '.midas', 'config.yaml'), content, 'utf8');
}

describe('globalConfigPath', () => {
  it('joins the home dir with .midas/config.yaml', () => {
    expect(globalConfigPath(homeDir)).toBe(join(homeDir, '.midas', 'config.yaml'));
  });
});

describe('resolveConfig', () => {
  it('returns built-in defaults when neither layer exists', async () => {
    const config = await resolveConfig(repoDir, homeDir);

    expect(config).toEqual({
      language: 'en-US',
      tools: [],
      context: null,
      rules: { spec: [], break: [], analyze: [] },
    });
  });

  it('uses the global layer when only it exists', async () => {
    await writeGlobalConfig('language: pt-BR\ntools:\n  - claude-code\ncontext: global ctx\n');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('pt-BR');
    expect(config.tools).toEqual(['claude-code']);
    expect(config.context).toBe('global ctx');
    expect(config.rules).toEqual({ spec: [], break: [], analyze: [] });
  });

  it('uses the project layer when only it exists', async () => {
    await writeProjectConfig(
      'language: pt-BR\ncontext: project ctx\nrules:\n  spec:\n    - rule a\n  break:\n    - rule b\n',
    );

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('pt-BR');
    expect(config.context).toBe('project ctx');
    expect(config.rules).toEqual({ spec: ['rule a'], break: ['rule b'], analyze: [] });
    expect(config.tools).toEqual([]);
  });

  it('project overrides global per field, absent fields fall through', async () => {
    await writeGlobalConfig(
      'language: en-US\ntools:\n  - claude-code\ncontext: global ctx\nrules:\n  spec:\n    - global spec rule\n  break:\n    - global break rule\n  analyze:\n    - global analyze rule\n',
    );
    await writeProjectConfig('language: pt-BR\nrules:\n  spec:\n    - project spec rule\n');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('pt-BR'); // project wins
    expect(config.context).toBe('global ctx'); // absent in project, falls to global
    expect(config.rules.spec).toEqual(['project spec rule']); // project wins per subfield
    expect(config.rules.break).toEqual(['global break rule']); // falls to global
    expect(config.rules.analyze).toEqual(['global analyze rule']); // falls to global
    expect(config.tools).toEqual(['claude-code']); // global only
  });

  it('ignores a tools key in the project config', async () => {
    await writeGlobalConfig('context: global ctx\n');
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
    await writeProjectConfig('context: [unclosed\n  ::bad');

    const config = await resolveConfig(repoDir, homeDir);

    expect(config.language).toBe('en-US');
    expect(config.context).toBeNull();
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
