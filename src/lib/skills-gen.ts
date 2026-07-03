import { mkdir, writeFile } from 'node:fs/promises';
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
