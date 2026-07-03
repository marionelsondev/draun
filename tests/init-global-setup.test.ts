import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { load } from 'js-yaml';
import { runCli } from '../src/index.js';
import {
  globalConfigExists,
  renderGlobalConfig,
  runGlobalSetup,
  writeGlobalConfig,
} from '../src/lib/global-setup.js';

// The global setup reads/writes ~/.draun/config.yaml and the global tool
// folders via os.homedir(); point the home at a temp dir per test.
const mocked = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => mocked.home;
  return { ...os, homedir, default: { ...os, homedir } };
});

let dir: string;
let home: string;
let originalIsTTY: boolean | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-global-setup-'));
  home = await mkdtemp(join(tmpdir(), 'draun-global-setup-home-'));
  mocked.home = home;
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  originalIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = false;
});

afterEach(async () => {
  vi.restoreAllMocks();
  (process.stdin as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

/** Run the CLI capturing stdout (printResult writes there directly) and stderr. */
async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      out += chunk.toString();
      return true;
    });
  try {
    const code = await runCli(argv, {
      stdout: (chunk) => {
        out += chunk;
      },
      stderr: (chunk) => {
        err += chunk;
      },
    });
    return { code, out, err };
  } finally {
    stdoutSpy.mockRestore();
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const globalConfig = () => join(home, '.draun', 'config.yaml');

interface InitJson {
  initialized: boolean;
  tools: string[];
  language: string;
  globalSetup: { performed: boolean; configPath: string | null };
  generated: {
    skills: { byTool: { tool: string; files: string[] }[]; skipped: string[] };
  };
}

describe('draun init — first-run global setup', () => {
  it('clean home + flags creates the global config and global integrations', async () => {
    const { code, out } = await run([
      'init',
      '--tools',
      'claude',
      '--language',
      'pt-BR',
      '--json',
    ]);
    expect(code).toBe(0);

    const config = load(await readFile(globalConfig(), 'utf8')) as Record<string, unknown>;
    expect(config.tools).toEqual(['claude']);
    expect(config.language).toBe('pt-BR');

    // Global integrations live under the home, never inside the repo.
    expect(await exists(join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md'))).toBe(true);
    expect(await exists(join(dir, '.claude'))).toBe(false);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.language).toBe('pt-BR');
    expect(payload.globalSetup.performed).toBe(true);
    expect(payload.globalSetup.configPath).toBe(globalConfig());
    expect(payload.generated.skills.byTool[0].files).toContain(
      join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md')
    );
  });

  it('second run asks nothing and does not rewrite the global config', async () => {
    await run(['init', '--tools', 'claude', '--language', 'pt-BR', '--json']);
    const before = await readFile(globalConfig(), 'utf8');

    const { code, out } = await run(['init', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.globalSetup).toEqual({ performed: false, configPath: null });
    expect(payload.tools).toEqual(['claude']);
    expect(await readFile(globalConfig(), 'utf8')).toBe(before);
  });

  it('non-interactive clean home without flags fails with exit 2 naming the flags', async () => {
    const { code, err } = await run(['init', '--json']);
    expect(code).toBe(2);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain('--tools');
    expect(parsed.error.message).toContain('--language');
    expect(await exists(globalConfig())).toBe(false);
  });

  it('non-interactive with only --tools also fails naming both flags', async () => {
    const { code, err } = await run(['init', '--tools', 'claude', '--json']);
    expect(code).toBe(2);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain('--tools');
    expect(parsed.error.message).toContain('--language');
    expect(await exists(globalConfig())).toBe(false);
  });

  it('rejects an unsupported --language with exit 1', async () => {
    const { code, err } = await run([
      'init',
      '--tools',
      'claude',
      '--language',
      'fr-FR',
      '--json',
    ]);
    expect(code).toBe(1);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain("unsupported language 'fr-FR'");
    expect(await exists(globalConfig())).toBe(false);
  });
});

describe('runGlobalSetup — interactive', () => {
  it('drives the tool and language pickers and writes the global config', async () => {
    // .claude in the cwd pre-checks Claude Code in the picker.
    await mkdir(join(dir, '.claude'), { recursive: true });

    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const pending = runGlobalSetup(dir, { interactive: true, io: { input, output } }, home);

    const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
    await tick();
    input.write('\r'); // confirm tools (claude pre-checked)
    await tick();
    input.write('\x1b[B'); // language: down to pt-BR
    await tick();
    input.write('\r'); // confirm language

    const result = await pending;
    expect(result.tools.map((tool) => tool.id)).toEqual(['claude']);
    expect(result.language).toBe('pt-BR');
    expect(result.configPath).toBe(globalConfig());

    const config = load(await readFile(globalConfig(), 'utf8')) as Record<string, unknown>;
    expect(config.tools).toEqual(['claude']);
    expect(config.language).toBe('pt-BR');
  });
});

describe('global config helpers', () => {
  it('renderGlobalConfig serializes tools and language', () => {
    expect(renderGlobalConfig(['claude', 'cursor'], 'pt-BR')).toBe(
      '# Draun global configuration\ntools:\n  - claude\n  - cursor\nlanguage: pt-BR\n'
    );
  });

  it('renderGlobalConfig writes an empty selection as tools: []', () => {
    expect(renderGlobalConfig([], 'en-US')).toBe(
      '# Draun global configuration\ntools: []\nlanguage: en-US\n'
    );
  });

  it('globalConfigExists reflects the file before and after writeGlobalConfig', async () => {
    expect(await globalConfigExists(home)).toBe(false);
    const path = await writeGlobalConfig(['claude'], 'en-US', home);
    expect(path).toBe(globalConfig());
    expect(await globalConfigExists(home)).toBe(true);
    const config = load(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(config.tools).toEqual(['claude']);
    expect(config.language).toBe('en-US');
  });
});
