import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { resolveGlobalPaths, type CommandFormat, type ToolDescriptor } from './tools.js';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from './workflow-templates.js';

export interface GenerateCommandsResult {
  /** Absolute paths of every command file written under the user home. */
  written: string[];
  /** Ids of tools without a global command destination or whose directory could not be created. */
  skipped: string[];
}

function escapeTomlBasicString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeTomlMultilineString(value: string): string {
  let escaped = value.replace(/\\/g, '\\\\');
  escaped = escaped.replace(/"""/g, '""\\"');
  escaped = escaped.replace(/"$/, '\\"');
  return escaped;
}

export function renderCommandFile(template: WorkflowTemplate, format: CommandFormat): string {
  if (format === 'yaml') {
    const lines = ['---', `description: ${template.description}`];
    if (template.argumentHint !== undefined) {
      lines.push(`argument-hint: ${template.argumentHint}`);
    }
    lines.push('---', '', template.body);
    return `${lines.join('\n')}\n`;
  }
  if (format === 'toml') {
    const description = escapeTomlBasicString(template.description);
    let body = template.body;
    if (template.argumentHint !== undefined) {
      body += '\n\nARGUMENTS: {{args}}';
    }
    const prompt = escapeTomlMultilineString(body);
    return `description = "${description}"\n\nprompt = """\n${prompt}\n"""\n`;
  }
  return `# midas ${template.name} — ${template.description}\n\n${template.body}\n`;
}

export async function generateCommands(
  tools: ToolDescriptor[],
  home: string = homedir()
): Promise<GenerateCommandsResult> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const tool of tools) {
    const resolved = resolveGlobalPaths(tool, home);
    if (resolved === null || resolved.commands === undefined) {
      skipped.push(tool.id);
      continue;
    }
    try {
      for (const template of WORKFLOW_TEMPLATES) {
        const absPath = resolved.commands.pathFor(template.name);
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(
          absPath,
          renderCommandFile(template, resolved.commands.format),
          'utf8'
        );
        written.push(absPath);
      }
    } catch {
      skipped.push(tool.id);
    }
  }

  return { written, skipped };
}
