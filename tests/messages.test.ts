import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMessages } from '../src/lib/messages.js';
import { renderSpecDetail } from '../src/commands/status.js';
import { runCli } from '../src/index.js';

// Language resolution reads the global config in os.homedir(); point the home
// at a temp dir so the real one never leaks in.
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
  dir = await mkdtemp(join(tmpdir(), 'midas-messages-'));
  home = await mkdtemp(join(tmpdir(), 'midas-messages-home-'));
  mocked.home = home;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function writeFixture(base: string, language?: string): Promise<void> {
  const issuesDir = join(base, '.midas', 'specs', 'demo', 'issues');
  await mkdir(issuesDir, { recursive: true });
  if (language !== undefined) {
    await writeFile(join(base, '.midas', 'config.yaml'), `language: ${language}\n`, 'utf8');
  }
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

describe('getMessages', () => {
  it('issuesSummary matches the expected English wording', () => {
    expect(getMessages().status.issuesSummary(3, 2, 0, 1)).toBe('3 issues · 2 done · 1 pending');
    expect(getMessages().status.issuesSummary(4, 2, 1, 1)).toBe(
      '4 issues · 2 done · 1 in progress · 1 pending',
    );
  });

  it('renderSpecDetail prints English for a not-broken-down spec', () => {
    const out = renderSpecDetail({
      slug: 'demo',
      brokenDown: false,
      total: 0,
      done: 0,
      inProgress: 0,
      pending: 0,
      issues: [],
    });
    expect(out).toBe("Spec 'demo' has not been broken down yet.");
  });
});

describe('CLI human output is always en-US', () => {
  it('status <slug> prints English even with language: pt-BR configured', async () => {
    await writeFixture(dir, 'pt-BR');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const cap = capture();
    const code = await runCli(['status', 'demo'], cap.io);

    expect(code).toBe(0);
    expect(cap.out).toContain('3 issues · 2 done · 1 pending');
    expect(cap.out).not.toContain('concluídas');
  });

  it('status <slug> prints English with no language setting', async () => {
    await writeFixture(dir);
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const cap = capture();
    const code = await runCli(['status', 'demo'], cap.io);

    expect(code).toBe(0);
    expect(cap.out).toContain('3 issues · 2 done · 1 pending');
  });

  it('validate missing-spec prints the English error even with pt-BR configured', async () => {
    await writeFixture(dir, 'pt-BR');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const cap = capture();
    const code = await runCli(['validate', 'missing-spec'], cap.io);

    expect(code).toBe(1);
    expect(cap.err).toContain('Error:');
    expect(cap.err).toContain('not found');
  });

  it('validate missing-spec --json keeps the English error shape', async () => {
    await writeFixture(dir, 'pt-BR');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const cap = capture();
    const code = await runCli(['--json', 'validate', 'missing-spec'], cap.io);

    expect(code).toBe(1);
    const parsed = JSON.parse(cap.err.trim());
    expect(parsed.error.message).toContain('not found');
  });
});

describe('--json byte identity', () => {
  it('status <slug> --json stdout is byte-identical under en-US and pt-BR', async () => {
    const enDir = join(dir, 'en');
    const ptDir = join(dir, 'pt');
    await mkdir(enDir, { recursive: true });
    await mkdir(ptDir, { recursive: true });
    await writeFixture(enDir, 'en-US');
    await writeFixture(ptDir, 'pt-BR');

    vi.spyOn(process, 'cwd').mockReturnValue(enDir);
    const capEn = capture();
    expect(await runCli(['--json', 'status', 'demo'], capEn.io)).toBe(0);

    vi.spyOn(process, 'cwd').mockReturnValue(ptDir);
    const capPt = capture();
    expect(await runCli(['--json', 'status', 'demo'], capPt.io)).toBe(0);

    expect(capPt.out).toBe(capEn.out);
  });
});
