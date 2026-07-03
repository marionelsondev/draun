import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/index.js';
import { runUpdate } from '../src/lib/update.js';
import { CliError } from '../src/lib/output.js';

// Integrations are generated into the user's global tool folders via
// os.homedir(); point the home at a temp dir so the tests never touch it.
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
  dir = await mkdtemp(join(tmpdir(), 'draun-update-'));
  home = await mkdtemp(join(tmpdir(), 'draun-update-home-'));
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

/** Write the global config (~/.draun/config.yaml) inside the temp home. */
async function writeGlobalConfig(homePath: string, yaml: string): Promise<void> {
  await mkdir(join(homePath, '.draun'), { recursive: true });
  await writeFile(join(homePath, '.draun', 'config.yaml'), yaml, 'utf8');
}

interface UpdateJson {
  tools: string[];
  generated: {
    skills: { byTool: { tool: string; files: string[] }[]; skipped: string[] };
  };
}

describe('draun update', () => {
  it('regenerates the global integrations from the global tools config', async () => {
    await writeGlobalConfig(home, 'tools:\n  - claude\n  - cursor\n');

    const { code, out } = await run(['update', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as UpdateJson;
    expect(payload.tools).toEqual(['claude', 'cursor']);
    expect(payload.generated.skills.byTool.map((entry) => entry.tool)).toEqual([
      'claude',
      'cursor',
    ]);
    expect(payload.generated.skills.byTool[0].files).toContain(
      join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md')
    );
    expect(payload.generated.skills.skipped).not.toContain('cursor');

    expect(await exists(join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md'))).toBe(true);
    expect(await exists(join(home, '.cursor', 'skills', 'draun-spec', 'SKILL.md'))).toBe(true);
    // Nothing is written inside the repo — no AGENTS.md, no .claude/.
    expect(await readdir(dir)).toEqual([]);
  });

  it('overwrites draun-managed files and preserves foreign files in the same folders', async () => {
    await writeGlobalConfig(home, 'tools:\n  - claude\n');
    const managed = join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md');
    const foreignSkill = join(home, '.claude', 'skills', 'meu-skill', 'SKILL.md');
    await mkdir(join(home, '.claude', 'skills', 'draun-spec'), { recursive: true });
    await mkdir(join(home, '.claude', 'skills', 'meu-skill'), { recursive: true });
    await writeFile(managed, 'stale garbage\n', 'utf8');
    await writeFile(foreignSkill, 'my own skill\n', 'utf8');

    const { code } = await run(['update', '--json']);
    expect(code).toBe(0);

    expect(await readFile(managed, 'utf8')).toContain('draun instructions');
    expect(await readFile(foreignSkill, 'utf8')).toBe('my own skill\n');
  });

  it('fails with exit 1 pointing to draun init when the global config is missing', async () => {
    const { code, err } = await run(['update', '--json']);
    expect(code).toBe(1);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain('draun init');
    expect(parsed.error.message).toContain(join(home, '.draun', 'config.yaml'));
  });

  it('with no tools configured reports no tools and writes nothing', async () => {
    await writeGlobalConfig(home, 'tools: []\n');

    const { code, out } = await run(['update']);
    expect(code).toBe(0);
    expect(out).toContain('No tools configured.');
    expect(await exists(join(home, '.claude'))).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it('ignores unknown tool ids left in the global config', async () => {
    await writeGlobalConfig(home, 'tools:\n  - claude\n  - nope\n');

    const { code, out } = await run(['update', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as UpdateJson;
    expect(payload.tools).toEqual(['claude']);
  });

  it('human output lists refreshed files and skipped tools', async () => {
    await writeGlobalConfig(home, 'tools:\n  - claude\n  - cursor\n');

    const { code, out } = await run(['update']);
    expect(code).toBe(0);
    expect(out).toContain('Tools: claude, cursor');
    expect(out).toContain('Skills:');
    expect(out).toContain(join(home, '.claude', 'skills', 'draun-implement', 'SKILL.md'));
    expect(out).toContain(join(home, '.cursor', 'skills', 'draun-implement', 'SKILL.md'));
  });

  describe('runUpdate (lib)', () => {
    it('returns the report for an injected home without relying on os.homedir', async () => {
      const otherHome = await mkdtemp(join(tmpdir(), 'draun-update-lib-'));
      try {
        await writeGlobalConfig(otherHome, 'tools:\n  - claude\n');
        const report = await runUpdate(otherHome);
        expect(report.tools).toEqual(['claude']);
        expect(report.skills.byTool[0].tool).toBe('claude');
        expect(report.skills.byTool[0].files).toContain(
          join(otherHome, '.claude', 'skills', 'draun-spec', 'SKILL.md')
        );
      } finally {
        await rm(otherHome, { recursive: true, force: true });
      }
    });

    it('throws CliError with exit 1 when the global config does not exist', async () => {
      const emptyHome = await mkdtemp(join(tmpdir(), 'draun-update-lib-'));
      try {
        await expect(runUpdate(emptyHome)).rejects.toMatchObject({
          exitCode: 1,
          message: expect.stringContaining('draun init'),
        });
        await expect(runUpdate(emptyHome)).rejects.toBeInstanceOf(CliError);
      } finally {
        await rm(emptyHome, { recursive: true, force: true });
      }
    });
  });
});
