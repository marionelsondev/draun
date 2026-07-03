import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/index.js';
import { initProject, PROJECT_CONFIG_TEMPLATE } from '../src/lib/init.js';
import { PROJECT_CONFIG_RELPATH, SPECS_ROOT_REL } from '../src/lib/config.js';

// init resolves the global config and integration targets via os.homedir();
// point the home at a temp dir so the tests never touch the real one.
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
  dir = await mkdtemp(join(tmpdir(), 'draun-init-'));
  home = await mkdtemp(join(tmpdir(), 'draun-init-home-'));
  mocked.home = home;
  // Seed the global config so the CLI flow skips the first-run global setup.
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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

interface InitJson {
  root: string;
  configPath: string;
  specsRoot: string;
  createdSpecsRoot: boolean;
  createdConfig: boolean;
  initialized: boolean;
}

describe('initProject', () => {
  it('creates .draun/specs and .draun/config.yaml in a fresh dir', async () => {
    const result = await initProject(dir);

    expect(result.root).toBe(dir);
    expect(result.initialized).toBe(true);
    expect(result.createdConfig).toBe(true);
    expect(result.createdSpecsRoot).toBe(true);
    expect(result.configPath).toBe(join(dir, PROJECT_CONFIG_RELPATH));
    expect(result.specsRoot).toBe(join(dir, SPECS_ROOT_REL));

    expect((await stat(result.specsRoot)).isDirectory()).toBe(true);
    expect(await readFile(result.configPath, 'utf8')).toBe(PROJECT_CONFIG_TEMPLATE);
  });

  it('writes a minimal commented template', async () => {
    const result = await initProject(dir);
    const raw = await readFile(result.configPath, 'utf8');

    expect(raw.startsWith('# Draun project configuration')).toBe(true);
    expect(raw).not.toContain('context');
    expect(raw).not.toContain('rules');
    expect(raw).toContain('language');
  });

  it('never creates draun.config.yaml at the root', async () => {
    await initProject(dir);
    expect(await exists(join(dir, 'draun.config.yaml'))).toBe(false);
  });

  it('is idempotent: second run creates nothing and keeps config bytes', async () => {
    await initProject(dir);
    const before = await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8');

    const second = await initProject(dir);

    expect(second.initialized).toBe(false);
    expect(second.createdConfig).toBe(false);
    expect(second.createdSpecsRoot).toBe(false);
    const after = await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8');
    expect(after).toBe(before);
  });

  it('preserves a user-edited config byte for byte', async () => {
    const custom = 'language: pt-BR\n';
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, PROJECT_CONFIG_RELPATH), custom, 'utf8');

    const result = await initProject(dir);

    expect(result.createdConfig).toBe(false);
    expect(result.createdSpecsRoot).toBe(true);
    expect(await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8')).toBe(custom);
  });

  it('creates the missing config when .draun/specs already exists', async () => {
    await mkdir(join(dir, SPECS_ROOT_REL), { recursive: true });

    const result = await initProject(dir);

    expect(result.initialized).toBe(true);
    expect(result.createdConfig).toBe(true);
    expect(result.createdSpecsRoot).toBe(false);
  });
});

describe('draun init (command)', () => {
  it('fresh repo with global config runs without prompts and reports what was created', async () => {
    const { code, out } = await run(['init', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.initialized).toBe(true);
    expect(payload.createdSpecsRoot).toBe(true);
    expect(payload.createdConfig).toBe(true);

    expect((await stat(join(dir, SPECS_ROOT_REL))).isDirectory()).toBe(true);
    expect(await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8')).toBe(
      PROJECT_CONFIG_TEMPLATE
    );
    expect(await exists(join(dir, 'draun.config.yaml'))).toBe(false);
  });

  it('re-running reports everything already existing and changes no files', async () => {
    await run(['init', '--json']);
    const configBefore = await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8');
    const agentsBefore = await readFile(join(dir, 'AGENTS.md'), 'utf8');

    const { code, out } = await run(['init', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.initialized).toBe(false);
    expect(payload.createdSpecsRoot).toBe(false);
    expect(payload.createdConfig).toBe(false);

    expect(await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8')).toBe(configBefore);
    expect(await readFile(join(dir, 'AGENTS.md'), 'utf8')).toBe(agentsBefore);
  });

  it('preserves AGENTS.md content outside the managed block on re-init', async () => {
    await run(['init', '--json']);
    const generated = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    await writeFile(join(dir, 'AGENTS.md'), `# My project notes\n\n${generated}`, 'utf8');

    const { code } = await run(['init', '--json']);
    expect(code).toBe(0);

    const after = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(after).toContain('# My project notes');
    expect(after).toContain('<!-- draun:begin -->');
    expect(after).toContain('<!-- draun:end -->');
  });

  it('human output reports created items on a fresh repo', async () => {
    const { code, out } = await run(['init']);
    expect(code).toBe(0);
    expect(out).toContain('created');
    expect(out).not.toContain('already exists');
  });

  it('human output reports already-existing items on re-run', async () => {
    await run(['init', '--json']);

    const { code, out } = await run(['init']);
    expect(code).toBe(0);
    expect(out).toContain('already');
    expect(out).toContain('kept existing');
  });
});
