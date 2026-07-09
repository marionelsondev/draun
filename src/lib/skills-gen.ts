import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveGlobalPaths, type ToolDescriptor } from './tools.js';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from './workflow-templates.js';

export interface GenerateSkillsResult {
  /** Absolute paths of every SKILL.md written under the user home. */
  written: string[];
  /** Ids of tools without a global skills destination or whose directory could not be created. */
  skipped: string[];
}

export interface RemoveSkillsResult {
  /** Per-tool skill folder paths that were removed. */
  byTool: { tool: string; paths: string[] }[];
}

export function renderSkillFile(template: WorkflowTemplate): string {
  return [
    '---',
    `name: draun-${template.name}`,
    `description: ${template.description}`,
    '---',
    '',
    template.body,
    '',
  ].join('\n');
}

export async function generateSkills(
  tools: ToolDescriptor[],
  home: string = homedir()
): Promise<GenerateSkillsResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const tool of tools) {
    const resolved = resolveGlobalPaths(tool, home);
    if (resolved === null || resolved.skillsDir === undefined) {
      skipped.push(tool.id);
      continue;
    }
    try {
      for (const template of WORKFLOW_TEMPLATES) {
        const absPath = join(resolved.skillsDir, `draun-${template.name}`, 'SKILL.md');
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(absPath, renderSkillFile(template), 'utf8');
        written.push(absPath);
      }
    } catch {
      skipped.push(tool.id);
    }
  }

  return { written, skipped };
}

/**
 * Remove only Draun-managed skill folders (`draun-<workflow>`) for the given
 * tools under each tool's global skills directory. Unrelated skills are left
 * untouched. Missing paths are ignored.
 */
export async function removeSkills(
  tools: ToolDescriptor[],
  home: string = homedir()
): Promise<RemoveSkillsResult> {
  const byTool: { tool: string; paths: string[] }[] = [];

  for (const tool of tools) {
    const resolved = resolveGlobalPaths(tool, home);
    if (resolved === null || resolved.skillsDir === undefined) {
      continue;
    }
    const paths: string[] = [];
    for (const template of WORKFLOW_TEMPLATES) {
      const skillDir = join(resolved.skillsDir, `draun-${template.name}`);
      try {
        await stat(skillDir);
      } catch {
        continue;
      }
      try {
        await rm(skillDir, { recursive: true, force: true });
        paths.push(skillDir);
      } catch {
        // Unreadable / locked path: skip
      }
    }
    if (paths.length > 0) {
      byTool.push({ tool: tool.id, paths });
    }
  }

  return { byTool };
}
