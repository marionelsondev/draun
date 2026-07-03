import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateIntegrations } from '../src/lib/init.js';
import { TOOL_REGISTRY, type ToolDescriptor } from '../src/lib/tools.js';

const claude = TOOL_REGISTRY.find((t) => t.id === 'claude') as ToolDescriptor;
const cursor = TOOL_REGISTRY.find((t) => t.id === 'cursor') as ToolDescriptor;
const codex = TOOL_REGISTRY.find((t) => t.id === 'codex') as ToolDescriptor;

let projectDir: string;
let home: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'draun-integrations-project-'));
  home = await mkdtemp(join(tmpdir(), 'draun-integrations-home-'));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('generateIntegrations (global destinations)', () => {
  it('writes every skill under the home, never inside the project', async () => {
    const report = await generateIntegrations(projectDir, [claude, cursor, codex], home);

    for (const entry of report.skills.byTool) {
      expect(entry.files.length).toBeGreaterThan(0);
      expect(entry.files.every((p) => p.startsWith(home))).toBe(true);
    }

    expect(report.skills.skipped).not.toContain('codex');
    expect(report.skills.skipped).not.toContain('cursor');

    // only AGENTS.md is created in the project — no .claude/.cursor dirs
    expect(await readdir(projectDir)).toEqual(['AGENTS.md']);

    const skill = await readFile(
      join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md'),
      'utf8'
    );
    expect(skill).toContain('name: draun-spec');
    const cursorSkill = await readFile(
      join(home, '.cursor', 'skills', 'draun-spec', 'SKILL.md'),
      'utf8'
    );
    expect(cursorSkill).toContain('name: draun-spec');
  });

  it('installs codex skills globally', async () => {
    const report = await generateIntegrations(projectDir, [codex], home);

    expect(report.skills.skipped).toEqual([]);

    const entry = report.skills.byTool.find((e) => e.tool === 'codex');
    expect(entry).toBeDefined();
    expect(entry?.files).toEqual([
      join(home, '.codex', 'skills', 'draun-spec', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-analyze', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-break', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-implement', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-archive', 'SKILL.md'),
    ]);

    const skill = await readFile(
      join(home, '.codex', 'skills', 'draun-archive', 'SKILL.md'),
      'utf8'
    );
    expect(skill).toContain('name: draun-archive');
  });
});
