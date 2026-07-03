import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/index.js';
import { CliError, printResult, renderError, renderJson } from '../src/lib/output.js';

// The global-setup check resolves ~/.draun/config.yaml via os.homedir();
// point the home at a temp dir so the real one never leaks in.
const mocked = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => mocked.home;
  return { ...os, homedir, default: { ...os, homedir } };
});

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

describe('runCli', () => {
  it('--help exits 0 and prints usage', async () => {
    const cap = capture();
    const code = await runCli(['--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out).toContain('Usage: draun');
  });

  it('no args exits 0 and prints help', async () => {
    const cap = capture();
    const code = await runCli([], cap.io);
    expect(code).toBe(0);
    expect(cap.out).toContain('Usage: draun');
  });

  it('--version exits 0 and prints name@semver', async () => {
    const cap = capture();
    const code = await runCli(['--version'], cap.io);
    expect(code).toBe(0);
    expect(cap.out.trim()).toMatch(/^draun@\d+\.\d+\.\d+$/);
  });

  describe('global-setup hint', () => {
    let dir: string;
    let home: string;

    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'draun-cli-'));
      home = await mkdtemp(join(tmpdir(), 'draun-cli-home-'));
      mocked.home = home;
      await mkdir(join(dir, '.draun', 'specs'), { recursive: true });
    });

    afterEach(async () => {
      mocked.home = '';
      await rm(dir, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    });

    async function runStatus(): Promise<{ code: number; err: string }> {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const cap = capture();
      try {
        const code = await runCli(['status'], cap.io);
        return { code, err: cap.err };
      } finally {
        stdoutSpy.mockRestore();
        cwdSpy.mockRestore();
      }
    }

    it('points at draun init on stderr when the global config is missing', async () => {
      const { code, err } = await runStatus();
      expect(code).toBe(0);
      expect(err).toContain('run `draun init`');
    });

    it('stays quiet once the global config exists', async () => {
      await mkdir(join(home, '.draun'), { recursive: true });
      await writeFile(join(home, '.draun', 'config.yaml'), 'language: en-US\n', 'utf8');

      const { code, err } = await runStatus();
      expect(code).toBe(0);
      expect(err).not.toContain('draun init');
    });
  });

  it('unknown command exits non-zero with one-line stderr mentioning the command', async () => {
    const cap = capture();
    const code = await runCli(['bogus'], cap.io);
    expect(code).not.toBe(0);
    expect(cap.err).toContain('bogus');
    expect(cap.err.trim().split('\n')).toHaveLength(1);
  });

  it('unknown command with --json emits one-line JSON error on stderr', async () => {
    const cap = capture();
    const code = await runCli(['--json', 'bogus'], cap.io);
    expect(code).not.toBe(0);
    const line = cap.err.trim();
    expect(line.split('\n')).toHaveLength(1);
    const parsed = JSON.parse(line);
    expect(parsed.error.message).toContain('bogus');
  });
});

describe('renderError', () => {
  it('json=true produces JSON with error.message', () => {
    const parsed = JSON.parse(renderError('x', true));
    expect(parsed.error.message).toBe('x');
  });

  it('json=false produces a single line', () => {
    const text = renderError('x', false);
    expect(text).toContain('Error: x');
    expect(text.split('\n')).toHaveLength(1);
  });
});

describe('renderJson', () => {
  it('round-trips an object', () => {
    const payload = { a: 1, b: ['x', 'y'], c: { nested: true } };
    expect(JSON.parse(renderJson(payload))).toEqual(payload);
  });
});

describe('printResult', () => {
  it('writes exactly one JSON document when json=true', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      printResult({ ok: true }, 'human text', true);
      expect(spy).toHaveBeenCalledTimes(1);
      const written = spy.mock.calls[0][0] as string;
      expect(JSON.parse(written)).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
    }
  });

  it('writes human text when json=false', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      printResult({ ok: true }, 'human text', false);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe('human text\n');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('CliError', () => {
  it('defaults exitCode to 1', () => {
    expect(new CliError('boom').exitCode).toBe(1);
  });

  it('preserves a custom exitCode', () => {
    expect(new CliError('boom', 3).exitCode).toBe(3);
  });
});
