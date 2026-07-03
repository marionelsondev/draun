import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../src/lib/output.js';
import { findProjectRoot, requireProjectRoot } from '../src/lib/config.js';
import { runCli } from '../src/index.js';

const INDEX_FIXTURE = `# Issues — Pricing Engine

## All issues

- [ ] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
`;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-root-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('findProjectRoot', () => {
  it('finds the root when .draun is in the start directory itself', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    expect(await findProjectRoot(dir, join(dir, 'home'))).toBe(dir);
  });

  it('finds the root walking up from a nested subdirectory', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    const nested = join(dir, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });
    expect(await findProjectRoot(nested, join(dir, 'home'))).toBe(dir);
  });

  it('returns null when no ancestor contains .draun', async () => {
    expect(await findProjectRoot(dir, join(dir, 'home'))).toBeNull();
  });

  it('does not treat the home directory as a project root', async () => {
    const home = join(dir, 'home');
    const sub = join(home, 'sub');
    await mkdir(join(home, '.draun'), { recursive: true });
    await mkdir(sub, { recursive: true });
    expect(await findProjectRoot(sub, home)).toBeNull();
  });
});

describe('requireProjectRoot', () => {
  it('returns the discovered root', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    expect(await requireProjectRoot(dir, join(dir, 'home'))).toBe(dir);
  });

  it('throws CliError exit 1 with the standard message when not initialized', async () => {
    let caught: unknown;
    try {
      await requireProjectRoot(dir, join(dir, 'home'));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toBe('project not initialized — run draun init');
  });
});

describe('runCli root discovery', () => {
  let out: string;
  let errOut: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  const io = {
    stdout: (chunk: string) => {
      out += chunk;
    },
    stderr: (chunk: string) => {
      errOut += chunk;
    },
  };

  beforeEach(() => {
    out = '';
    errOut = '';
  });

  afterEach(() => {
    cwdSpy.mockRestore();
  });

  it('status --json works from a subdirectory of a project whose .draun has no config.yaml', async () => {
    const issuesDir = join(dir, '.draun', 'specs', 'pricing-engine', 'issues');
    await mkdir(issuesDir, { recursive: true });
    await writeFile(join(issuesDir, 'INDEX.md'), INDEX_FIXTURE, 'utf8');
    const sub = join(dir, 'packages', 'app');
    await mkdir(sub, { recursive: true });
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(sub);
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out += chunk.toString();
        return true;
      });

    let code: number;
    try {
      code = await runCli(['status', '--json'], io);
    } finally {
      stdoutSpy.mockRestore();
    }

    expect(code).toBe(0);
    const payload = JSON.parse(out) as { specs: Array<{ slug: string }> };
    expect(payload.specs.map((s) => s.slug)).toContain('pricing-engine');
  });

  it('status --json outside any project exits 1 with the standard JSON error shape', async () => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const code = await runCli(['status', '--json'], io);

    expect(code).toBe(1);
    expect(JSON.parse(errOut)).toEqual({
      error: { message: 'project not initialized — run draun init' },
    });
  });

  it('issues --json outside any project exits 1 with the standard JSON error shape', async () => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);

    const code = await runCli(['issues', 'pricing-engine', '--json'], io);

    expect(code).toBe(1);
    expect(JSON.parse(errOut)).toEqual({
      error: { message: 'project not initialized — run draun init' },
    });
  });
});
