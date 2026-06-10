import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../src/lib/output.js';
import { globalConfigPath } from '../src/lib/config.js';
import { loadConfig } from '../src/lib/instructions.js';
import { TOOL_REGISTRY, detectTools, resolveToolsFlag } from '../src/lib/tools.js';

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'midas-tools-'));
  home = await mkdtemp(join(tmpdir(), 'midas-tools-home-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function writeGlobalConfig(content: string): Promise<void> {
  await mkdir(join(home, '.midas'), { recursive: true });
  await writeFile(globalConfigPath(home), content, 'utf8');
}

describe('TOOL_REGISTRY', () => {
  it('covers exactly the supported tool ids', () => {
    const ids = TOOL_REGISTRY.map((tool) => tool.id);
    expect(ids).toEqual(['claude', 'cursor', 'windsurf', 'codex', 'antigravity', 'gemini']);
  });

  it('has unique ids', () => {
    const ids = TOOL_REGISTRY.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('formats claude and cursor command paths per their conventions', () => {
    const claude = TOOL_REGISTRY.find((tool) => tool.id === 'claude');
    const cursor = TOOL_REGISTRY.find((tool) => tool.id === 'cursor');
    expect(claude?.commands?.pathFor('spec')).toBe('.claude/commands/midas/spec.md');
    expect(cursor?.commands?.pathFor('spec')).toBe('.cursor/commands/midas-spec.md');
  });
});

describe('detectTools', () => {
  it('returns tools whose rootDir exists', async () => {
    await mkdir(join(dir, '.claude'), { recursive: true });
    await mkdir(join(dir, '.cursor'), { recursive: true });

    const detected = await detectTools(dir);

    expect(detected.map((tool) => tool.id)).toEqual(['claude', 'cursor']);
  });

  it('returns an empty list in a bare repo', async () => {
    expect(await detectTools(dir)).toEqual([]);
  });

  it('detects claude via the CLAUDE.md marker without .claude', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), '# notes\n', 'utf8');

    const detected = await detectTools(dir);

    expect(detected.map((tool) => tool.id)).toEqual(['claude']);
  });

  it('detects antigravity via the .agents/ directory', async () => {
    await mkdir(join(dir, '.agents'), { recursive: true });

    const detected = await detectTools(dir);

    expect(detected.map((tool) => tool.id)).toEqual(['antigravity']);
  });

  it('detects antigravity via the legacy .agent/ directory', async () => {
    await mkdir(join(dir, '.agent'), { recursive: true });

    const detected = await detectTools(dir);

    expect(detected.map((tool) => tool.id)).toEqual(['antigravity']);
  });

  it('does not detect antigravity in a repo with only .claude/', async () => {
    await mkdir(join(dir, '.claude'), { recursive: true });

    const detected = await detectTools(dir);

    expect(detected.map((tool) => tool.id)).not.toContain('antigravity');
  });
});

describe('resolveToolsFlag', () => {
  it('resolves a comma-separated id list in order', () => {
    const tools = resolveToolsFlag('claude,cursor');
    expect(tools.map((tool) => tool.id)).toEqual(['claude', 'cursor']);
  });

  it('resolves all to the full registry', () => {
    expect(resolveToolsFlag('all')).toEqual(TOOL_REGISTRY);
  });

  it('tolerates whitespace around ids', () => {
    const tools = resolveToolsFlag(' claude , gemini ');
    expect(tools.map((tool) => tool.id)).toEqual(['claude', 'gemini']);
  });

  it('maps all to exactly the six supported ids', () => {
    const tools = resolveToolsFlag('all');
    expect(tools.map((tool) => tool.id)).toEqual([
      'claude',
      'cursor',
      'windsurf',
      'codex',
      'antigravity',
      'gemini',
    ]);
  });

  it('rejects a removed id, listing only the supported ids', () => {
    let caught: unknown;
    try {
      resolveToolsFlag('aider');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(2);
    expect((caught as CliError).message).toContain("unknown tool 'aider'");
    for (const id of ['claude', 'cursor', 'windsurf', 'codex', 'antigravity', 'gemini']) {
      expect((caught as CliError).message).toContain(id);
    }
    expect((caught as CliError).message).not.toContain('opencode');
  });

  it('throws CliError exit 2 naming the unknown id and listing valid ids', () => {
    let caught: unknown;
    try {
      resolveToolsFlag('claude,nope');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(2);
    expect((caught as CliError).message).toContain("'nope'");
    for (const tool of TOOL_REGISTRY) {
      expect((caught as CliError).message).toContain(tool.id);
    }
  });
});

describe('loadConfig tools key', () => {
  beforeEach(async () => {
    // loadConfig requires an initialized project (a .midas/ dir).
    await mkdir(join(dir, '.midas'), { recursive: true });
  });

  it('parses tools as a string array from the global config', async () => {
    await writeGlobalConfig('tools:\n  - claude\n  - cursor\n');

    const config = await loadConfig(dir, home);

    expect(config.tools).toEqual(['claude', 'cursor']);
  });

  it('defaults tools to [] when the key is missing', async () => {
    await writeGlobalConfig('context: hello\n');

    const config = await loadConfig(dir, home);

    expect(config.tools).toEqual([]);
  });

  it('coerces a single string to a one-element array and drops non-strings', async () => {
    await writeGlobalConfig('tools: claude\n');
    expect((await loadConfig(dir, home)).tools).toEqual(['claude']);

    await writeGlobalConfig('tools:\n  - claude\n  - 42\n');
    expect((await loadConfig(dir, home)).tools).toEqual(['claude']);
  });
});
