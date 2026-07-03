import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { DEFAULT_SPECS_ROOT } from '../src/lib/init.js';
import { newSpec, resolveSpecsRoot, slugify, SpecConflictError } from '../src/lib/new.js';
import { makeNewCommand } from '../src/commands/new.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-new-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('slugify', () => {
  it.each([
    ['Pricing Engine', 'pricing-engine'],
    ['  Foo__Bar!! ', 'foo-bar'],
    ['Café São', 'cafe-sao'],
    ['UPPER case', 'upper-case'],
    ['a   b---c', 'a-b-c'],
    ['--hello--', 'hello'],
    ['v2 API (draft)', 'v2-api-draft'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it.each([['!!!'], [''], ['   '], ['___']])('throws CliError exitCode 2 for %j', (input) => {
    let caught: unknown;
    try {
      slugify(input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(2);
  });
});

describe('resolveSpecsRoot', () => {
  it('returns <root>/.draun/specs when .draun is present', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    expect(await resolveSpecsRoot(dir)).toBe(join(dir, DEFAULT_SPECS_ROOT));
  });

  it('rejects with the project-not-initialized CliError when no .draun exists', async () => {
    const home = join(dir, 'home');
    await mkdir(home, { recursive: true });
    let caught: unknown;
    try {
      await resolveSpecsRoot(dir, home);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toBe('project not initialized — run draun init');
  });

  it('falls back to default on malformed YAML', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, '.draun', 'config.yaml'), 'specsRoot: [unclosed\n  ::bad', 'utf8');
    expect(await resolveSpecsRoot(dir)).toBe(join(dir, DEFAULT_SPECS_ROOT));
  });

  it('ignores a specsRoot key in the project config', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, '.draun', 'config.yaml'), 'specsRoot: other/dir\n', 'utf8');
    expect(await resolveSpecsRoot(dir)).toBe(join(dir, DEFAULT_SPECS_ROOT));
  });
});

describe('newSpec', () => {
  beforeEach(async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
  });

  it('creates .draun/specs/pricing-engine and returns paths', async () => {
    const result = await newSpec(dir, 'Pricing Engine');

    expect(result.slug).toBe('pricing-engine');
    expect(result.dir).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine'));
    expect(result.specPath).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine', 'SPEC.md'));
    expect(result.relDir).toBe('.draun/specs/pricing-engine');
    expect(result.relSpecPath).toBe('.draun/specs/pricing-engine/SPEC.md');
    expect((await stat(result.dir)).isDirectory()).toBe(true);
  });

  it('throws SpecConflictError when SPEC.md exists and leaves filesystem unchanged', async () => {
    const first = await newSpec(dir, 'Pricing Engine');
    await writeFile(first.specPath, '# spec\n', 'utf8');
    const snapshot = await readdir(first.dir);

    let caught: unknown;
    try {
      await newSpec(dir, 'Pricing Engine');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SpecConflictError);
    expect((caught as SpecConflictError).exitCode).not.toBe(0);
    expect((caught as SpecConflictError).slug).toBe('pricing-engine');
    expect((caught as SpecConflictError).specPath).toBe(first.specPath);
    expect(await readdir(first.dir)).toEqual(snapshot);
  });

  it('succeeds when the dir exists but has no SPEC.md', async () => {
    await mkdir(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine'), { recursive: true });

    const result = await newSpec(dir, 'Pricing Engine');

    expect(result.slug).toBe('pricing-engine');
    expect((await stat(result.dir)).isDirectory()).toBe(true);
  });

  it('ignores a specsRoot override in the project config', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, '.draun', 'config.yaml'), 'specsRoot: other/dir\n', 'utf8');

    const result = await newSpec(dir, 'Pricing Engine');

    expect(result.dir).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine'));
    expect((await stat(result.dir)).isDirectory()).toBe(true);
  });

  it('creates nothing for a slug-empty name', async () => {
    await expect(newSpec(dir, '!!!')).rejects.toMatchObject({ exitCode: 2 });
    await expect(stat(join(dir, DEFAULT_SPECS_ROOT))).rejects.toThrow();
  });
});

describe('makeNewCommand', () => {
  beforeEach(async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
  });

  function makeProgram(): Command {
    const program = new Command('draun')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeNewCommand());
    return program;
  }

  it('emits a single JSON doc with slug and specPath when run with --json', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    let out = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out += chunk.toString();
        return true;
      });

    try {
      await makeProgram().parseAsync(['new', 'Pricing Engine', '--json'], { from: 'user' });
    } finally {
      stdoutSpy.mockRestore();
      cwdSpy.mockRestore();
    }

    const payload = JSON.parse(out) as { slug: string; specPath: string };
    expect(payload.slug).toBe('pricing-engine');
    expect(payload.specPath).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine', 'SPEC.md'));
  });

  it('rejects with SpecConflictError on conflict', async () => {
    const first = await newSpec(dir, 'Pricing Engine');
    await writeFile(first.specPath, '# spec\n', 'utf8');

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      await expect(
        makeProgram().parseAsync(['new', 'Pricing Engine', '--json'], { from: 'user' }),
      ).rejects.toBeInstanceOf(SpecConflictError);
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
