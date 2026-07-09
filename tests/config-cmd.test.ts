import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { runCli } from '../src/index.js';
import { globalConfigPath, resolveConfig } from '../src/lib/config.js';
import { writeGlobalConfig } from '../src/lib/global-setup.js';
import { generateSkills } from '../src/lib/skills-gen.js';
import { TOOL_REGISTRY } from '../src/lib/tools.js';
import { writeProjectLanguage } from '../src/lib/config-cmd.js';

// Global config and skills live under os.homedir(); isolate each test.
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
  dir = await mkdtemp(join(tmpdir(), 'draun-config-cmd-'));
  home = await mkdtemp(join(tmpdir(), 'draun-config-cmd-home-'));
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

function skillDir(toolId: string, workflow: string): string {
  const tool = TOOL_REGISTRY.find((t) => t.id === toolId);
  if (tool?.global?.skillsDir === undefined) {
    throw new Error(`tool ${toolId} has no global skillsDir`);
  }
  return join(home, tool.global.skillsDir, `draun-${workflow}`);
}

describe('draun config', () => {
  it('bootstraps global config with tools and language', async () => {
    const { code, out } = await run([
      'config',
      '--tools',
      'claude',
      '--language',
      'pt-BR',
      '--scope',
      'global',
      '--json',
    ]);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as {
      mode: string;
      tools: string[];
      language: string;
      bootstrapped: boolean;
      toolsChanged: boolean;
      skills: { generated: { byTool: { tool: string; files: string[] }[] } };
    };
    expect(payload.mode).toBe('apply');
    expect(payload.tools).toEqual(['claude']);
    expect(payload.language).toBe('pt-BR');
    expect(payload.bootstrapped).toBe(true);
    expect(payload.toolsChanged).toBe(true);
    expect(payload.skills.generated.byTool.some((e) => e.tool === 'claude')).toBe(true);

    const raw = await readFile(globalConfigPath(home), 'utf8');
    const yaml = load(raw) as { tools: string[]; language: string };
    expect(yaml.tools).toEqual(['claude']);
    expect(yaml.language).toBe('pt-BR');
    expect(await exists(join(skillDir('claude', 'spec'), 'SKILL.md'))).toBe(true);
  });

  it('updates tools: generates new skills and removes deselected ones', async () => {
    await writeGlobalConfig(['claude'], 'en-US', home);
    await generateSkills(
      TOOL_REGISTRY.filter((t) => t.id === 'claude'),
      home
    );
    expect(await exists(join(skillDir('claude', 'spec'), 'SKILL.md'))).toBe(true);

    const { code, out } = await run(['config', '--tools', 'cursor', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as {
      tools: string[];
      toolsChanged: boolean;
      skills: {
        generated: { byTool: { tool: string }[] };
        removed: { tool: string; paths: string[] }[];
      };
    };
    expect(payload.tools).toEqual(['cursor']);
    expect(payload.toolsChanged).toBe(true);
    expect(payload.skills.generated.byTool.some((e) => e.tool === 'cursor')).toBe(true);
    expect(payload.skills.removed.some((e) => e.tool === 'claude')).toBe(true);
    expect(await exists(skillDir('claude', 'spec'))).toBe(false);
    expect(await exists(join(skillDir('cursor', 'spec'), 'SKILL.md'))).toBe(true);

    const yaml = load(await readFile(globalConfigPath(home), 'utf8')) as {
      tools: string[];
      language: string;
    };
    expect(yaml.tools).toEqual(['cursor']);
    expect(yaml.language).toBe('en-US');
  });

  it('language-only global update keeps tools and skips skill churn', async () => {
    await writeGlobalConfig(['claude'], 'en-US', home);
    await generateSkills(
      TOOL_REGISTRY.filter((t) => t.id === 'claude'),
      home
    );
    const before = await readdir(join(home, '.claude', 'skills'));

    const { code, out } = await run([
      'config',
      '--language',
      'pt-BR',
      '--scope',
      'global',
      '--json',
    ]);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as {
      tools: string[];
      language: string;
      languageScope: string;
      toolsChanged: boolean;
      skills: { generated: { byTool: unknown[] }; removed: unknown[] };
    };
    expect(payload.tools).toEqual(['claude']);
    expect(payload.language).toBe('pt-BR');
    expect(payload.languageScope).toBe('global');
    expect(payload.toolsChanged).toBe(false);
    expect(payload.skills.generated.byTool).toEqual([]);
    expect(payload.skills.removed).toEqual([]);

    const yaml = load(await readFile(globalConfigPath(home), 'utf8')) as {
      tools: string[];
      language: string;
    };
    expect(yaml.tools).toEqual(['claude']);
    expect(yaml.language).toBe('pt-BR');
    expect(await readdir(join(home, '.claude', 'skills'))).toEqual(before);
  });

  it('applies language to project only when scope is project', async () => {
    await writeGlobalConfig(['claude'], 'en-US', home);
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(
      join(dir, '.draun', 'config.yaml'),
      '# Draun project configuration\ncontext:\nrules:\n',
      'utf8'
    );

    const { code, out } = await run([
      'config',
      '--language',
      'pt-BR',
      '--scope',
      'project',
      '--json',
    ]);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as {
      language: string;
      languageScope: string;
      projectConfigPath: string | null;
      tools: string[];
    };
    expect(payload.language).toBe('pt-BR');
    expect(payload.languageScope).toBe('project');
    expect(payload.projectConfigPath).toContain(join('.draun', 'config.yaml'));
    expect(payload.tools).toEqual(['claude']);

    const globalYaml = load(await readFile(globalConfigPath(home), 'utf8')) as {
      language: string;
      tools: string[];
    };
    expect(globalYaml.language).toBe('en-US');
    expect(globalYaml.tools).toEqual(['claude']);

    const projectYaml = load(
      await readFile(join(dir, '.draun', 'config.yaml'), 'utf8')
    ) as { language: string };
    expect(projectYaml.language).toBe('pt-BR');

    expect((await resolveConfig(dir, home)).language).toBe('pt-BR');
  });

  it('rejects --scope project outside an initialized project', async () => {
    await writeGlobalConfig(['claude'], 'en-US', home);
    const { code, err } = await run([
      'config',
      '--language',
      'pt-BR',
      '--scope',
      'project',
      '--json',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('project not initialized');
  });

  it('--json without flags dumps the current config', async () => {
    await writeGlobalConfig(['claude', 'cursor'], 'pt-BR', home);
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(join(dir, '.draun', 'config.yaml'), 'language: en-US\n', 'utf8');

    const { code, out } = await run(['config', '--json']);
    expect(code).toBe(0);
    const payload = JSON.parse(out) as {
      mode: string;
      tools: string[];
      language: string;
      globalLanguage: string;
      projectScopeAvailable: boolean;
      globalConfigExists: boolean;
    };
    expect(payload.mode).toBe('show');
    expect(payload.tools).toEqual(['claude', 'cursor']);
    expect(payload.language).toBe('en-US'); // project wins
    expect(payload.globalLanguage).toBe('pt-BR');
    expect(payload.projectScopeAvailable).toBe(true);
    expect(payload.globalConfigExists).toBe(true);
  });

  it('rejects unknown tool ids', async () => {
    const { code, err } = await run(['config', '--tools', 'nope', '--json']);
    expect(code).toBe(2);
    expect(err).toContain("unknown tool 'nope'");
  });

  it('rejects invalid language', async () => {
    const { code, err } = await run(['config', '--language', 'fr-FR', '--json']);
    expect(code).toBe(1);
    expect(err).toContain('unsupported language');
  });

  it('rejects invalid scope', async () => {
    const { code, err } = await run([
      'config',
      '--language',
      'en-US',
      '--scope',
      'team',
      '--json',
    ]);
    expect(code).toBe(2);
    expect(err).toContain('invalid scope');
  });

  it('non-TTY without flags errors (unless --json show)', async () => {
    const { code, err } = await run(['config']);
    expect(code).toBe(2);
    expect(err).toMatch(/terminal|flags|--json/i);
  });

  it('allows empty tools selection and removes previous skills', async () => {
    await writeGlobalConfig(['claude'], 'en-US', home);
    await generateSkills(
      TOOL_REGISTRY.filter((t) => t.id === 'claude'),
      home
    );

    // Empty tools string parses to []; exercise via runConfig (Commander omits empty --tools).
    const { runConfig } = await import('../src/lib/config-cmd.js');
    const result = await runConfig(
      dir,
      {
        tools: '',
        interactive: false,
        json: true,
      },
      home
    );
    expect(result.mode).toBe('apply');
    if (result.mode === 'apply') {
      expect(result.tools).toEqual([]);
      expect(result.skills.removed.some((e) => e.tool === 'claude')).toBe(true);
    }
    expect(await exists(skillDir('claude', 'spec'))).toBe(false);
    const yaml = load(await readFile(globalConfigPath(home), 'utf8')) as {
      tools: string[];
    };
    expect(yaml.tools).toEqual([]);
  });
});

describe('writeProjectLanguage', () => {
  it('preserves sibling keys when setting language', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });
    await writeFile(
      join(dir, '.draun', 'config.yaml'),
      'context: hello\nrules:\n  spec:\n    - keep-me\n',
      'utf8'
    );
    await writeProjectLanguage(dir, 'pt-BR');
    const doc = load(await readFile(join(dir, '.draun', 'config.yaml'), 'utf8')) as {
      language: string;
      context: string;
      rules: { spec: string[] };
    };
    expect(doc.language).toBe('pt-BR');
    expect(doc.context).toBe('hello');
    expect(doc.rules.spec).toEqual(['keep-me']);
  });
});
