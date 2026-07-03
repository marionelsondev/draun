import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runCli } from '../src/index.js';
import { PROJECT_CONFIG_RELPATH } from '../src/lib/config.js';
import { pickSelect } from '../src/lib/picker.js';

// init resolves the language from the layered config via os.homedir(); point
// the home at a temp dir so the tests never read (or write to) the real one.
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
  dir = await mkdtemp(join(tmpdir(), 'draun-init-language-'));
  home = await mkdtemp(join(tmpdir(), 'draun-init-language-home-'));
  mocked.home = home;
  // Seed the global config so init exercises the per-repo flow, not the
  // first-run global setup (covered by init-global-setup.test.ts).
  await mkdir(join(home, '.draun'), { recursive: true });
  await writeFile(join(home, '.draun', 'config.yaml'), 'tools: []\nlanguage: en-US\n', 'utf8');
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

interface InitJson {
  initialized: boolean;
  tools: string[];
  language: string;
}

describe('draun init language', () => {
  it('fresh init reports the default en-US without writing language anywhere', async () => {
    const { code, out } = await run(['init', '--tools', 'claude', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.language).toBe('en-US');

    const raw = await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8');
    expect(raw).toContain('# Draun project configuration');
    expect(raw).not.toMatch(/^language:/m);
    // The global config in the repo's home stays untouched by init's repo phase.
    const globalRaw = await readFile(join(home, '.draun', 'config.yaml'), 'utf8');
    expect(globalRaw).toBe('tools: []\nlanguage: en-US\n');
    // The old root-level template is never created.
    await expect(readFile(join(dir, 'draun.config.yaml'), 'utf8')).rejects.toThrow();
  });

  it('rerun reports the project-layer pt-BR without copying it anywhere', async () => {
    // The language lives in the layered config (project layer, manual edit).
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, PROJECT_CONFIG_RELPATH), 'language: pt-BR\n', 'utf8');

    const { code, out } = await run(['init', '--force', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.language).toBe('pt-BR');

    // The override is read, never rewritten or copied.
    const layered = await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8');
    expect(layered).toBe('language: pt-BR\n');
    await expect(readFile(join(dir, 'draun.config.yaml'), 'utf8')).rejects.toThrow();
  });

  it('fails with exit 1 naming an unsupported language from the project layer', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, '.draun', 'config.yaml'), 'language: fr-FR\n', 'utf8');

    const { code, err } = await run(['init', '--force', '--json']);
    expect(code).toBe(1);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain("unsupported language 'fr-FR'");
    expect(parsed.error.message).toContain('en-US, pt-BR');
  });

  it('human output shows the language resolved from the global layer', async () => {
    await mkdir(join(home, '.draun'), { recursive: true });
    await writeFile(join(home, '.draun', 'config.yaml'), 'language: pt-BR\n', 'utf8');

    const { code, out } = await run(['init', '--tools', 'claude']);
    expect(code).toBe(0);
    expect(out).toContain('Language: pt-BR');
  });

  it('human output defaults to en-US with no layer configured', async () => {
    const { code, out } = await run(['init', '--tools', 'claude']);
    expect(code).toBe(0);
    expect(out).toContain('Language: en-US');
  });
});

describe('pickSelect', () => {
  const items = [
    { id: 'en-US', label: 'en-US — English (United States)' },
    { id: 'pt-BR', label: 'pt-BR — Português (Brasil)' },
  ];

  const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

  it('enter confirms the preselected option', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const picked = pickSelect('Select language', items, 'en-US', { input, output });
    await tick();
    input.write('\r');

    await expect(picked).resolves.toBe('en-US');
  });

  it('preselection follows the default argument', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const picked = pickSelect('Select language', items, 'pt-BR', { input, output });
    await tick();
    input.write('\r');

    await expect(picked).resolves.toBe('pt-BR');
  });

  it('arrow down then enter selects the other option', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const picked = pickSelect('Select language', items, 'en-US', { input, output });
    await tick();
    input.write('\x1b[B'); // down to pt-BR
    await tick();
    input.write('\r');

    await expect(picked).resolves.toBe('pt-BR');
  });
});
