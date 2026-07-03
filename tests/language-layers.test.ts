import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../src/lib/output.js';
import { globalConfigPath } from '../src/lib/config.js';
import { getInstructions } from '../src/lib/instructions.js';
import { runCli } from '../src/index.js';

// CLI consumers resolve the home via os.homedir(); point it at a temp dir so
// every test controls the global layer (mock node:os, never fs).
const mocked = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => mocked.home;
  return { ...os, homedir, default: { ...os, homedir } };
});

const INDEX_FIXTURE = `# Issues — Demo

## All issues

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
- [X] [03 — Add API](03-add-api.md) — blocked by: 01, 02
`;

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-lang-layers-'));
  home = await mkdtemp(join(tmpdir(), 'draun-lang-layers-home-'));
  mocked.home = home;
  await mkdir(join(dir, '.draun'), { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function writeProjectConfig(content: string): Promise<void> {
  await writeFile(join(dir, '.draun', 'config.yaml'), content, 'utf8');
}

async function writeGlobalConfig(content: string): Promise<void> {
  await mkdir(join(home, '.draun'), { recursive: true });
  await writeFile(globalConfigPath(home), content, 'utf8');
}

async function writeDemoSpec(): Promise<void> {
  const issuesDir = join(dir, '.draun', 'specs', 'demo', 'issues');
  await mkdir(issuesDir, { recursive: true });
  await writeFile(join(issuesDir, 'INDEX.md'), INDEX_FIXTURE, 'utf8');
}

// printResult writes command payloads straight to process.stdout, so capture
// both the injected io (stderr/help) and a process.stdout spy.
function capture() {
  let out = '';
  let err = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
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

describe('getInstructions resolves the language across layers', () => {
  it('uses the global layer when the project has none', async () => {
    await writeGlobalConfig('language: pt-BR\n');

    const payload = await getInstructions(dir, 'spec', undefined, home);
    expect(payload.language).toBe('pt-BR');
    expect(payload.languageDirective).toContain('Brazilian Portuguese');
  });

  it('uses the project layer when the global has none', async () => {
    await writeProjectConfig('language: pt-BR\n');

    const payload = await getInstructions(dir, 'spec', undefined, home);
    expect(payload.language).toBe('pt-BR');
    expect(payload.languageDirective).toContain('Brazilian Portuguese');
  });

  it('project en-US overrides global pt-BR', async () => {
    await writeGlobalConfig('language: pt-BR\n');
    await writeProjectConfig('language: en-US\n');

    const payload = await getInstructions(dir, 'spec', undefined, home);
    expect(payload.language).toBe('en-US');
    expect(payload.languageDirective).toContain('English (United States)');
  });

  it('defaults to en-US when no layer sets a language', async () => {
    const payload = await getInstructions(dir, 'spec', undefined, home);
    expect(payload.language).toBe('en-US');
    expect(payload.languageDirective).toContain('English (United States)');
  });

  it('rejects an unsupported value coming from the global layer', async () => {
    await writeGlobalConfig('language: fr-FR\n');

    let caught: unknown;
    try {
      await getInstructions(dir, 'spec', undefined, home);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain('fr-FR');
    expect((caught as CliError).message).toContain('en-US');
    expect((caught as CliError).message).toContain('pt-BR');
  });

  it('rejects an unsupported value coming from the project layer', async () => {
    await writeProjectConfig('language: fr-FR\n');

    let caught: unknown;
    try {
      await getInstructions(dir, 'spec', undefined, home);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain('fr-FR');
    expect((caught as CliError).message).toContain('en-US');
    expect((caught as CliError).message).toContain('pt-BR');
  });
});

describe('CLI consumers follow the layered language', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  it('instructions spec (human) shows the global-layer pt-BR', async () => {
    await writeGlobalConfig('language: pt-BR\n');

    const cap = capture();
    const code = await runCli(['instructions', 'spec'], cap.io);

    expect(code).toBe(0);
    expect(cap.out).toContain('Language: pt-BR');
  });

  it('instructions spec --json carries the project override over the global', async () => {
    await writeGlobalConfig('language: en-US\n');
    await writeProjectConfig('language: pt-BR\n');

    const cap = capture();
    const code = await runCli(['--json', 'instructions', 'spec'], cap.io);

    expect(code).toBe(0);
    const payload = JSON.parse(cap.out) as { language: string; languageDirective: string };
    expect(payload.language).toBe('pt-BR');
    expect(payload.languageDirective).toContain('Brazilian Portuguese');
  });

  it('status <slug> prints English even with pt-BR in the global layer (CLI output is always en-US)', async () => {
    await writeDemoSpec();
    await writeGlobalConfig('language: pt-BR\n');

    const cap = capture();
    const code = await runCli(['status', 'demo'], cap.io);

    expect(code).toBe(0);
    expect(cap.out).toContain('2 done');
    expect(cap.out).not.toContain('concluídas');
  });

  it('status <slug> prints English when no layer sets a language', async () => {
    await writeDemoSpec();

    const cap = capture();
    const code = await runCli(['status', 'demo'], cap.io);

    expect(code).toBe(0);
    expect(cap.out).toContain('3 issues · 2 done · 1 pending');
  });

  it('status ignores an invalid language, but instructions fails clearly for fr-FR', async () => {
    await writeDemoSpec();
    await writeGlobalConfig('language: fr-FR\n');

    // status never reads the language (CLI output is always en-US)
    const capStatus = capture();
    expect(await runCli(['status', 'demo'], capStatus.io)).toBe(0);

    // instructions consumes the language and must reject the invalid value
    const capInstr = capture();
    const code = await runCli(['instructions', 'spec'], capInstr.io);
    expect(code).toBe(1);
    expect(capInstr.err).toContain("unsupported language 'fr-FR'");
  });
});
