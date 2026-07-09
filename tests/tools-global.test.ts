import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TOOL_REGISTRY, resolveGlobalPaths } from '../src/lib/tools.js';
import type { ToolDescriptor } from '../src/lib/tools.js';

function getTool(id: string): ToolDescriptor {
  const tool = TOOL_REGISTRY.find((entry) => entry.id === id);
  if (tool === undefined) {
    throw new Error(`tool '${id}' missing from registry`);
  }
  return tool;
}

describe('resolveGlobalPaths', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'draun-tools-global-'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('resolves claude global skills under the home', () => {
    const resolved = resolveGlobalPaths(getTool('claude'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.claude', 'skills'));
  });

  it('resolves cursor global skills only', () => {
    const resolved = resolveGlobalPaths(getTool('cursor'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.cursor', 'skills'));
  });

  it('resolves windsurf global skills only', () => {
    const resolved = resolveGlobalPaths(getTool('windsurf'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.windsurf', 'skills'));
  });

  it('resolves codex global skills only', () => {
    const resolved = resolveGlobalPaths(getTool('codex'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.codex', 'skills'));
  });

  it('resolves antigravity global skills', () => {
    const resolved = resolveGlobalPaths(getTool('antigravity'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.gemini', 'antigravity', 'skills'));
  });

  it('resolves opencode global skills under ~/.config/opencode', () => {
    const resolved = resolveGlobalPaths(getTool('opencode'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.config', 'opencode', 'skills'));
  });

  it('resolves grok global skills under ~/.grok/skills', () => {
    const resolved = resolveGlobalPaths(getTool('grok'), home);
    expect(resolved).not.toBeNull();
    expect(resolved?.skillsDir).toBe(join(home, '.grok', 'skills'));
  });

  it('returns null for every tool without a global destination', () => {
    const withoutGlobal: string[] = [];
    for (const id of withoutGlobal) {
      expect(resolveGlobalPaths(getTool(id), home)).toBeNull();
    }
    for (const tool of TOOL_REGISTRY) {
      const resolved = resolveGlobalPaths(tool, home);
      if (tool.global === undefined) {
        expect(resolved).toBeNull();
        expect(withoutGlobal).toContain(tool.id);
      } else {
        expect(resolved).not.toBeNull();
      }
    }
  });

  it('keeps every resolved path inside the injected home', () => {
    for (const tool of TOOL_REGISTRY) {
      const resolved = resolveGlobalPaths(tool, home);
      if (resolved === null) {
        continue;
      }
      if (resolved.skillsDir !== undefined) {
        expect(resolved.skillsDir.startsWith(home)).toBe(true);
      }
    }
  });

  it('defaults to os.homedir() when no home is given', () => {
    const resolved = resolveGlobalPaths(getTool('claude'));
    expect(resolved?.skillsDir?.startsWith(homedir())).toBe(true);
  });
});
