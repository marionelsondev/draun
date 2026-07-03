import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../src/lib/output.js';
import { globalConfigPath } from '../src/lib/config.js';
import { loadConfig } from '../src/lib/instructions.js';
import { readConfigLanguage, resolveLanguage } from '../src/lib/language.js';
import { runCli } from '../src/index.js';

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-language-'));
  home = await mkdtemp(join(tmpdir(), 'draun-language-home-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function writeConfig(content: string): Promise<void> {
  await mkdir(join(dir, '.draun'), { recursive: true });
  await writeFile(join(dir, '.draun', 'config.yaml'), content, 'utf8');
}

async function writeGlobalConfig(content: string): Promise<void> {
  await mkdir(join(home, '.draun'), { recursive: true });
  await writeFile(globalConfigPath(home), content, 'utf8');
}

describe('resolveLanguage', () => {
  it('returns en-US for undefined', () => {
    expect(resolveLanguage(undefined)).toBe('en-US');
  });

  it('passes through supported values', () => {
    expect(resolveLanguage('en-US')).toBe('en-US');
    expect(resolveLanguage('pt-BR')).toBe('pt-BR');
  });

  it('throws CliError naming the invalid value and listing supported languages', () => {
    let caught: unknown;
    try {
      resolveLanguage('fr-FR');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain("'fr-FR'");
    expect((caught as CliError).message).toContain('en-US');
    expect((caught as CliError).message).toContain('pt-BR');
  });
});

describe('readConfigLanguage', () => {
  it('reads explicit pt-BR from the project config', async () => {
    await writeConfig('language: pt-BR\n');

    expect(await readConfigLanguage(dir, home)).toBe('pt-BR');
  });

  it('reads explicit en-US from the project config', async () => {
    await writeConfig('language: en-US\n');

    expect(await readConfigLanguage(dir, home)).toBe('en-US');
  });

  it('reads the language from the global config when the project has none', async () => {
    await writeGlobalConfig('language: pt-BR\n');

    expect(await readConfigLanguage(dir, home)).toBe('pt-BR');
  });

  it('project language overrides the global language', async () => {
    await writeGlobalConfig('language: pt-BR\n');
    await writeConfig('language: en-US\n');

    expect(await readConfigLanguage(dir, home)).toBe('en-US');
  });

  it('defaults to en-US when the language key is absent', async () => {
    await writeConfig('foo: bar\n');

    expect(await readConfigLanguage(dir, home)).toBe('en-US');
  });

  it('defaults to en-US when no config exists in either layer', async () => {
    expect(await readConfigLanguage(dir, home)).toBe('en-US');
  });

  it('rejects with exit 1 for an unsupported value', async () => {
    await writeConfig('language: fr-FR\n');

    await expect(readConfigLanguage(dir, home)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("'fr-FR'"),
    });
  });
});

describe('loadConfig language', () => {
  it('exposes pt-BR from config', async () => {
    await writeConfig('language: pt-BR\n');

    expect((await loadConfig(dir, home)).language).toBe('pt-BR');
  });

  it('defaults to en-US when the field is missing', async () => {
    await writeConfig('foo: bar\n');

    expect((await loadConfig(dir, home)).language).toBe('en-US');
  });

  it('rejects with CliError exit 1 for language: fr-FR', async () => {
    await writeConfig('language: fr-FR\n');

    await expect(loadConfig(dir, home)).rejects.toMatchObject({
      name: 'CliError',
      exitCode: 1,
    });
  });
});

describe('CLI surfaces invalid language', () => {
  function capture() {
    let out = '';
    let err = '';
    return {
      io: {
        stdout: (chunk: string) => {
          out += chunk;
        },
        stderr: (chunk: string) => {
          err += chunk;
        },
      },
      get out() {
        return out;
      },
      get err() {
        return err;
      },
    };
  }

  it('instructions spec --json fails with {"error":{"message"}} naming fr-FR', async () => {
    await writeConfig('language: fr-FR\n');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const cap = capture();
    const code = await runCli(['--json', 'instructions', 'spec'], cap.io);

    expect(code).not.toBe(0);
    const parsed = JSON.parse(cap.err.trim());
    expect(parsed.error.message).toContain('fr-FR');
    expect(parsed.error.message).toContain('en-US');
    expect(parsed.error.message).toContain('pt-BR');
  });
});
