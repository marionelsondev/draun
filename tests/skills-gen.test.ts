import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSkills, renderSkillFile } from '../src/lib/skills-gen.js';
import { WORKFLOW_TEMPLATES } from '../src/lib/workflow-templates.js';
import { TOOL_REGISTRY, type ToolDescriptor } from '../src/lib/tools.js';

const claude = TOOL_REGISTRY.find((t) => t.id === 'claude') as ToolDescriptor;
const windsurf = TOOL_REGISTRY.find((t) => t.id === 'windsurf') as ToolDescriptor;
const cursor = TOOL_REGISTRY.find((t) => t.id === 'cursor') as ToolDescriptor;
const codex = TOOL_REGISTRY.find((t) => t.id === 'codex') as ToolDescriptor;
const antigravity = TOOL_REGISTRY.find((t) => t.id === 'antigravity') as ToolDescriptor;

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'draun-skills-home-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('renderSkillFile', () => {
  it('renders name and description yaml frontmatter followed by the instructions', () => {
    const spec = WORKFLOW_TEMPLATES[0];
    const content = renderSkillFile(spec);
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain(`name: draun-${spec.name}`);
    expect(content).toContain(`description: ${spec.description}`);
    expect(content).toContain(spec.body);
  });

  it('reuses the shared workflow templates so skills mirror command content', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const content = renderSkillFile(template);
      expect(content).toContain(template.body);
      expect(content).toContain(template.description);
    }
  });
});

describe('generateSkills', () => {
  it('writes the five draun-* skill directories under each tool global skillsDir', async () => {
    const result = await generateSkills([claude, windsurf], home);

    expect(result.written).toEqual([
      join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md'),
      join(home, '.claude', 'skills', 'draun-analyze', 'SKILL.md'),
      join(home, '.claude', 'skills', 'draun-break', 'SKILL.md'),
      join(home, '.claude', 'skills', 'draun-implement', 'SKILL.md'),
      join(home, '.claude', 'skills', 'draun-archive', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-spec', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-analyze', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-break', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-implement', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-archive', 'SKILL.md'),
    ]);
    expect(result.skipped).toEqual([]);

    const skill = await readFile(
      join(home, '.claude', 'skills', 'draun-spec', 'SKILL.md'),
      'utf8'
    );
    expect(skill.startsWith('---\n')).toBe(true);
    expect(skill).toContain('name: draun-spec');
    expect(skill).toContain('draun instructions spec --json');
  });

  it('writes the five draun-* skill directories under the codex global skillsDir', async () => {
    const result = await generateSkills([codex], home);

    expect(result.written).toEqual([
      join(home, '.codex', 'skills', 'draun-spec', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-analyze', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-break', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-implement', 'SKILL.md'),
      join(home, '.codex', 'skills', 'draun-archive', 'SKILL.md'),
    ]);
    expect(result.skipped).toEqual([]);

    const skill = await readFile(
      join(home, '.codex', 'skills', 'draun-spec', 'SKILL.md'),
      'utf8'
    );
    expect(skill.startsWith('---\n')).toBe(true);
    expect(skill).toContain('name: draun-spec');
    expect(skill).toContain('description:');
    expect(skill).toContain('draun instructions spec --json');
  });

  it('writes the five draun-* skill directories under the antigravity global skillsDir', async () => {
    const result = await generateSkills([antigravity], home);

    expect(result.written).toEqual([
      join(home, '.gemini', 'antigravity', 'skills', 'draun-spec', 'SKILL.md'),
      join(home, '.gemini', 'antigravity', 'skills', 'draun-analyze', 'SKILL.md'),
      join(home, '.gemini', 'antigravity', 'skills', 'draun-break', 'SKILL.md'),
      join(home, '.gemini', 'antigravity', 'skills', 'draun-implement', 'SKILL.md'),
      join(home, '.gemini', 'antigravity', 'skills', 'draun-archive', 'SKILL.md'),
    ]);
    expect(result.skipped).toEqual([]);

    const skill = await readFile(
      join(home, '.gemini', 'antigravity', 'skills', 'draun-spec', 'SKILL.md'),
      'utf8'
    );
    expect(skill).toContain('name: draun-spec');
  });

  it('writes skills for cursor now that it has a global skills destination', async () => {
    const result = await generateSkills([cursor, claude], home);

    expect(result.skipped).toEqual([]);
    expect(result.written).toHaveLength(10);
    expect(
      result.written.some((p) => p.startsWith(join(home, '.cursor', 'skills')))
    ).toBe(true);
    expect(
      result.written.some((p) => p.startsWith(join(home, '.claude', 'skills')))
    ).toBe(true);
  });

  it('rewrites draun-* skills but leaves other skills untouched', async () => {
    const userSkillDir = join(home, '.claude', 'skills', 'my-skill');
    await mkdir(userSkillDir, { recursive: true });
    await writeFile(join(userSkillDir, 'SKILL.md'), 'user skill\n', 'utf8');
    const staleDir = join(home, '.claude', 'skills', 'draun-break');
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, 'SKILL.md'), 'stale generated content\n', 'utf8');

    const result = await generateSkills([claude], home);

    expect(result.written).toContain(join(staleDir, 'SKILL.md'));
    const breakSkill = await readFile(join(staleDir, 'SKILL.md'), 'utf8');
    expect(breakSkill).not.toContain('stale generated content');
    expect(breakSkill).toContain('name: draun-break');
    expect(await readFile(join(userSkillDir, 'SKILL.md'), 'utf8')).toBe('user skill\n');
  });

  it('skips a tool whose global directory cannot be created without aborting the rest', async () => {
    // a plain file occupying ~/.claude makes mkdir of .claude/skills/... fail
    await writeFile(join(home, '.claude'), 'not a directory\n', 'utf8');

    const result = await generateSkills([claude, windsurf], home);

    expect(result.skipped).toEqual(['claude']);
    expect(result.written).toEqual([
      join(home, '.windsurf', 'skills', 'draun-spec', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-analyze', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-break', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-implement', 'SKILL.md'),
      join(home, '.windsurf', 'skills', 'draun-archive', 'SKILL.md'),
    ]);
  });

  it('is idempotent: regeneration yields identical files', async () => {
    await generateSkills([claude, windsurf], home);
    const path = join(home, '.windsurf', 'skills', 'draun-implement', 'SKILL.md');
    const first = await readFile(path, 'utf8');

    await generateSkills([claude, windsurf], home);

    expect(await readFile(path, 'utf8')).toBe(first);
  });
});
