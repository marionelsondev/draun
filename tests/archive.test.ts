import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { archiveDirName, archiveSpec } from '../src/lib/archive.js';
import { makeArchiveCommand, renderArchive } from '../src/commands/archive.js';

const ALL_DONE_INDEX = `# Issues — Pricing Engine

## All issues

- [x] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [x] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
`;

const PENDING_INDEX = `# Issues — Pricing Engine

## All issues

- [x] [01 — Set up schema](01-set-up-schema.md) — blocked by: none
- [ ] [02 — Build calculator](02-build-calculator.md) — blocked by: 01
- [ ] [03 — Add API](03-add-api.md) — blocked by: 01, 02
`;

const SPEC_CONTENT = '# Pricing Engine\n\nSome spec body.\n';
const NOW = new Date(2026, 5, 9); // 2026-06-09 local

let dir: string;
let specsRoot: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-'));
  specsRoot = join(dir, '.draun', 'specs');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function makeSpec(slug: string, indexContent?: string): Promise<void> {
  const specDir = join(specsRoot, slug);
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, 'SPEC.md'), SPEC_CONTENT, 'utf8');
  if (indexContent !== undefined) {
    await mkdir(join(specDir, 'issues'), { recursive: true });
    await writeFile(join(specDir, 'issues', 'INDEX.md'), indexContent, 'utf8');
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

describe('archiveDirName', () => {
  it('produces a zero-padded local-date prefix', () => {
    expect(archiveDirName('x', new Date(2026, 5, 9))).toBe('2026-06-09-x');
  });
});

describe('archiveSpec', () => {
  it('moves an all-done spec verbatim into the archive folder', async () => {
    await makeSpec('pricing-engine', ALL_DONE_INDEX);

    const result = await archiveSpec(dir, 'pricing-engine', { now: NOW });

    const dest = join(specsRoot, 'archive', '2026-06-09-pricing-engine');
    expect(result.to).toBe(dest);
    expect(result.relTo).toBe('.draun/specs/archive/2026-06-09-pricing-engine');
    expect(result.forced).toBe(false);
    expect(result.pendingIssues).toBe(0);
    expect(await exists(join(specsRoot, 'pricing-engine'))).toBe(false);
    expect(await readFile(join(dest, 'SPEC.md'), 'utf8')).toBe(SPEC_CONTENT);
    expect(await readFile(join(dest, 'issues', 'INDEX.md'), 'utf8')).toBe(ALL_DONE_INDEX);
  });

  it('refuses pending issues without force and leaves the source untouched', async () => {
    await makeSpec('pricing-engine', PENDING_INDEX);

    let caught: unknown;
    try {
      await archiveSpec(dir, 'pricing-engine', { now: NOW });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).message).toContain('--force');
    expect((caught as CliError).message).toContain('2 pending');
    expect(await exists(join(specsRoot, 'pricing-engine', 'SPEC.md'))).toBe(true);
  });

  it('archives pending issues with force: true', async () => {
    await makeSpec('pricing-engine', PENDING_INDEX);

    const result = await archiveSpec(dir, 'pricing-engine', { force: true, now: NOW });

    expect(result.forced).toBe(true);
    expect(result.pendingIssues).toBe(2);
    expect(await exists(join(specsRoot, 'archive', '2026-06-09-pricing-engine'))).toBe(true);
    expect(await exists(join(specsRoot, 'pricing-engine'))).toBe(false);
  });

  it('rejects an unknown slug', async () => {
    await mkdir(specsRoot, { recursive: true });

    await expect(archiveSpec(dir, 'nope', { now: NOW })).rejects.toThrowError(/unknown spec/);
  });

  it('archives a spec without an issues/ folder without force', async () => {
    await makeSpec('bare-spec');

    const result = await archiveSpec(dir, 'bare-spec', { now: NOW });

    expect(result.pendingIssues).toBe(0);
    expect(await exists(join(specsRoot, 'archive', '2026-06-09-bare-spec'))).toBe(true);
  });

  it('rejects when the destination already exists and leaves the source untouched', async () => {
    await makeSpec('pricing-engine', ALL_DONE_INDEX);
    await mkdir(join(specsRoot, 'archive', '2026-06-09-pricing-engine'), { recursive: true });

    await expect(archiveSpec(dir, 'pricing-engine', { now: NOW })).rejects.toThrowError(
      /already exists/,
    );
    expect(await exists(join(specsRoot, 'pricing-engine', 'SPEC.md'))).toBe(true);
  });

  it("rejects the 'archive' slug itself", async () => {
    await mkdir(join(specsRoot, 'archive'), { recursive: true });

    await expect(archiveSpec(dir, 'archive', { now: NOW })).rejects.toBeInstanceOf(CliError);
  });
});

describe('renderArchive', () => {
  it('adds a warning line when forced with pending issues', () => {
    const text = renderArchive({
      slug: 'x',
      from: '/a/x',
      to: '/a/archive/2026-06-09-x',
      relFrom: '.draun/specs/x',
      relTo: '.draun/specs/archive/2026-06-09-x',
      pendingIssues: 2,
      forced: true,
    });
    expect(text).toContain("Archived 'x' -> .draun/specs/archive/2026-06-09-x/");
    expect(text).toContain('2 pending issues');
  });
});

describe('makeArchiveCommand', () => {
  function makeProgram(): Command {
    const program = new Command('draun')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeArchiveCommand());
    return program;
  }

  async function runCapture(args: string[], cwd: string): Promise<string> {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    let out = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out += chunk.toString();
        return true;
      });
    try {
      await makeProgram().parseAsync(args, { from: 'user' });
    } finally {
      stdoutSpy.mockRestore();
      cwdSpy.mockRestore();
    }
    return out;
  }

  it('emits JSON with to/relTo for --json', async () => {
    await makeSpec('pricing-engine', ALL_DONE_INDEX);

    const out = await runCapture(['archive', 'pricing-engine', '--json'], dir);

    const payload = JSON.parse(out) as { slug: string; to: string; relTo: string };
    expect(payload.slug).toBe('pricing-engine');
    expect(payload.relTo).toMatch(/^\.draun\/specs\/archive\/\d{4}-\d{2}-\d{2}-pricing-engine$/);
    expect(payload.to).toContain('pricing-engine');
  });

  it('rejects pending issues without --force and archives with --force', async () => {
    await makeSpec('pricing-engine', PENDING_INDEX);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      await expect(
        makeProgram().parseAsync(['archive', 'pricing-engine'], { from: 'user' }),
      ).rejects.toBeInstanceOf(CliError);
    } finally {
      cwdSpy.mockRestore();
    }

    const out = await runCapture(['archive', 'pricing-engine', '--force'], dir);
    expect(out).toContain("Archived 'pricing-engine'");
    expect(out).toContain('--force');
  });
});
