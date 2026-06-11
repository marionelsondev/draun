import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { load } from 'js-yaml';
import { runCli } from '../src/index.js';
import { PROJECT_CONFIG_RELPATH } from '../src/lib/config.js';
import { TOOL_REGISTRY } from '../src/lib/tools.js';
import { pickCheckbox } from '../src/lib/picker.js';

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
  dir = await mkdtemp(join(tmpdir(), 'midas-init-tools-'));
  home = await mkdtemp(join(tmpdir(), 'midas-init-tools-home-'));
  mocked.home = home;
  // Seed the global config so init exercises the per-repo flow, not the
  // first-run global setup (covered by init-global-setup.test.ts).
  await mkdir(join(home, '.midas'), { recursive: true });
  await writeFile(join(home, '.midas', 'config.yaml'), 'tools: []\nlanguage: en-US\n', 'utf8');
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
  initialized: boolean;
  tools: string[];
  generated: {
    agents: { path: string; action: string };
    commands: { byTool: { tool: string; files: string[] }[]; skipped: string[] };
    skills: { byTool: { tool: string; files: string[] }[]; skipped: string[] };
  };
}

describe('midas init --tools', () => {
  it('generates all three layers and reports the selection without writing it to the repo', async () => {
    const { code, out } = await run(['init', '--tools', 'claude,cursor', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.initialized).toBe(true);
    expect(payload.tools).toEqual(['claude', 'cursor']);

    // AGENTS.md layer
    expect(payload.generated.agents).toEqual({ path: 'AGENTS.md', action: 'created' });
    const agents = await readFile(join(dir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('<!-- midas:begin -->');
    expect(agents).toContain('<!-- midas:end -->');

    // Commands layer, grouped by tool — written under the global home, never the repo
    expect(payload.generated.commands.byTool.map((entry) => entry.tool)).toEqual([
      'claude',
      'cursor',
    ]);
    expect(payload.generated.commands.byTool[0].files).toContain(
      join(home, '.claude', 'commands', 'midas', 'spec.md')
    );
    expect(payload.generated.commands.byTool[1].files).toContain(
      join(home, '.cursor', 'commands', 'midas-spec.md')
    );
    expect(await exists(join(home, '.claude', 'commands', 'midas', 'implement.md'))).toBe(true);
    expect(await exists(join(home, '.cursor', 'commands', 'midas-archive.md'))).toBe(true);
    expect(await exists(join(dir, '.claude'))).toBe(false);
    expect(await exists(join(dir, '.cursor'))).toBe(false);

    // Skills layer: claude only, cursor reported as skipped
    expect(payload.generated.skills.byTool.map((entry) => entry.tool)).toEqual(['claude']);
    expect(payload.generated.skills.skipped).toContain('cursor');
    expect(await exists(join(home, '.claude', 'skills', 'midas-spec', 'SKILL.md'))).toBe(true);

    // tools live only in the global config: no midas.config.yaml is created
    // and the project config gains no tools key.
    expect(await exists(join(dir, 'midas.config.yaml'))).toBe(false);
    const config = load(await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(config).not.toHaveProperty('tools');
  });

  it('--tools all selects exactly the six supported tools', async () => {
    const { code, out } = await run(['init', '--tools', 'all', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(TOOL_REGISTRY.map((tool) => tool.id));
    expect(payload.tools).toEqual([
      'claude',
      'cursor',
      'windsurf',
      'codex',
      'antigravity',
      'gemini',
    ]);
  });

  it('--tools antigravity installs the five skills and workflows', async () => {
    const { code, out } = await run(['init', '--tools', 'antigravity', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(['antigravity']);

    const skillsRoot = join(home, '.gemini', 'antigravity', 'skills');
    const entry = payload.generated.skills.byTool.find((e) => e.tool === 'antigravity');
    expect(entry?.files).toEqual([
      join(skillsRoot, 'midas-spec', 'SKILL.md'),
      join(skillsRoot, 'midas-analyze', 'SKILL.md'),
      join(skillsRoot, 'midas-break', 'SKILL.md'),
      join(skillsRoot, 'midas-implement', 'SKILL.md'),
      join(skillsRoot, 'midas-archive', 'SKILL.md'),
    ]);
    for (const file of entry?.files ?? []) {
      expect(await exists(file)).toBe(true);
    }

    // Workflows land in the commands layer under global_workflows.
    expect(payload.generated.commands.skipped).not.toContain('antigravity');
    const workflowsDir = join(home, '.gemini', 'antigravity', 'global_workflows');
    const commandsEntry = payload.generated.commands.byTool.find((e) => e.tool === 'antigravity');
    expect(commandsEntry?.files).toEqual([
      join(workflowsDir, 'midas-spec.md'),
      join(workflowsDir, 'midas-analyze.md'),
      join(workflowsDir, 'midas-break.md'),
      join(workflowsDir, 'midas-implement.md'),
      join(workflowsDir, 'midas-archive.md'),
    ]);
    expect(await exists(join(workflowsDir, 'midas-spec.md'))).toBe(true);

    // Nothing is written into the project beyond AGENTS.md and .midas/.
    expect(await exists(join(dir, '.agents'))).toBe(false);
    expect(await exists(join(dir, '.gemini'))).toBe(false);
  });

  it('--tools gemini installs the five TOML commands and skips skills', async () => {
    const { code, out } = await run(['init', '--tools', 'gemini', '--json']);
    expect(code).toBe(0);

    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(['gemini']);

    const entry = payload.generated.commands.byTool.find((e) => e.tool === 'gemini');
    expect(entry?.files).toEqual([
      join(home, '.gemini', 'commands', 'midas', 'spec.toml'),
      join(home, '.gemini', 'commands', 'midas', 'analyze.toml'),
      join(home, '.gemini', 'commands', 'midas', 'break.toml'),
      join(home, '.gemini', 'commands', 'midas', 'implement.toml'),
      join(home, '.gemini', 'commands', 'midas', 'archive.toml'),
    ]);
    expect(payload.generated.commands.skipped).not.toContain('gemini');
    expect(payload.generated.skills.skipped).toContain('gemini');

    const spec = await readFile(join(home, '.gemini', 'commands', 'midas', 'spec.toml'), 'utf8');
    expect(spec).toContain('{{args}}');
  });

  it('rejects the removed aider id with exit 2', async () => {
    const { code, err } = await run(['init', '--tools', 'aider', '--json']);
    expect(code).toBe(2);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain("unknown tool 'aider'");
    expect(parsed.error.message).toContain('claude');
  });

  it('rejects unknown tool ids with exit 2 listing valid ids', async () => {
    const { code, err } = await run(['init', '--tools', 'nope', '--json']);
    expect(code).toBe(2);
    const parsed = JSON.parse(err.trim()) as { error: { message: string } };
    expect(parsed.error.message).toContain("unknown tool 'nope'");
    expect(parsed.error.message).toContain('claude');
  });

  it('re-running refreshes generated files without writing midas.config.yaml', async () => {
    await run(['init', '--tools', 'claude', '--json']);
    await rm(join(home, '.claude', 'commands', 'midas', 'spec.md'));

    const { code, out } = await run(['init', '--tools', 'claude', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as InitJson;
    expect(payload.initialized).toBe(false);
    expect(await exists(join(home, '.claude', 'commands', 'midas', 'spec.md'))).toBe(true);
    expect(await exists(join(dir, 'midas.config.yaml'))).toBe(false);
  });
});

describe('midas init --force / non-TTY', () => {
  it('--force uses the tools from the global config', async () => {
    await writeFile(
      join(home, '.midas', 'config.yaml'),
      'tools:\n  - claude\nlanguage: en-US\n',
      'utf8'
    );

    const { code, out } = await run(['init', '--force', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(['claude']);
  });

  it('--force keeps the global selection and preserves the project config bytes', async () => {
    await writeFile(
      join(home, '.midas', 'config.yaml'),
      'tools:\n  - cursor\nlanguage: en-US\n',
      'utf8'
    );
    await mkdir(join(dir, '.midas'), { recursive: true });
    const projectConfig = 'context: hello\n';
    await writeFile(join(dir, PROJECT_CONFIG_RELPATH), projectConfig, 'utf8');

    const { code, out } = await run(['init', '--force', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(['cursor']);
    expect((await stat(join(dir, '.midas', 'specs'))).isDirectory()).toBe(true);

    // The existing project config is preserved byte for byte: no tools key added.
    expect(await readFile(join(dir, PROJECT_CONFIG_RELPATH), 'utf8')).toBe(projectConfig);
    expect(await exists(join(dir, 'midas.config.yaml'))).toBe(false);
  });

  it('non-TTY without flags uses the global tools without asking', async () => {
    await writeFile(
      join(home, '.midas', 'config.yaml'),
      'tools:\n  - cursor\nlanguage: en-US\n',
      'utf8'
    );

    const { code, out } = await run(['init', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(['cursor']);
  });

  it('silently ignores removed ids left in the global config', async () => {
    await writeFile(
      join(home, '.midas', 'config.yaml'),
      'tools:\n  - claude\n  - aider\n  - zed\nlanguage: en-US\n',
      'utf8'
    );

    const { code, out } = await run(['init', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as InitJson;
    expect(payload.tools).toEqual(['claude']);
  });

  it('human output lists generated files grouped by layer and tool', async () => {
    const { code, out } = await run(['init', '--tools', 'claude,cursor']);
    expect(code).toBe(0);
    expect(out).toContain('Tools: claude, cursor');
    expect(out).toContain('AGENTS.md created');
    expect(out).toContain('Slash commands:');
    expect(out).toContain(join(home, '.claude', 'commands', 'midas', 'spec.md'));
    expect(out).toContain(join(home, '.cursor', 'commands', 'midas-break.md'));
    expect(out).toContain('Skills:');
    expect(out).toContain(join(home, '.claude', 'skills', 'midas-implement', 'SKILL.md'));
    expect(out).toContain('skipped (not supported): cursor');
  });
});

describe('pickCheckbox', () => {
  it('toggles with space, moves with arrows, confirms with enter', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();

    const picked = pickCheckbox(
      [
        { id: 'a', label: 'Tool A', checked: true },
        { id: 'b', label: 'Tool B', checked: false },
      ],
      { input, output }
    );

    const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
    await tick();
    input.write(' '); // toggle A off
    await tick();
    input.write('[B'); // down to B
    await tick();
    input.write(' '); // toggle B on
    await tick();
    input.write('\r'); // confirm

    await expect(picked).resolves.toEqual(['b']);
  });
});
