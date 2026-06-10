import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError } from './output.js';

export type CommandFormat = 'yaml' | 'none' | 'toml';

export interface ToolCommands {
  /** Relative path (posix) of the command file for a given command name. */
  pathFor: (name: string) => string;
  format: CommandFormat;
}

/** Global install destinations, declared relative to the user's home directory. */
export interface ToolGlobalPaths {
  skillsDir?: string;
  commands?: ToolCommands;
}

export interface ToolDescriptor {
  id: string;
  name: string;
  /** Directory at the repo root whose presence indicates the tool (omitted for marker-only tools). */
  rootDir?: string;
  /** Files (or directories) at the repo root whose presence indicates the tool. */
  markerFiles?: string[];
  /** When true, detection requires a marker file — rootDir alone is too generic. */
  markerOnlyDetection?: boolean;
  commands?: ToolCommands;
  skillsDir?: string;
  /** Global (home-relative) destinations; omitted when no global convention applies. */
  global?: ToolGlobalPaths;
}

export const TOOL_REGISTRY: ToolDescriptor[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    rootDir: '.claude',
    markerFiles: ['CLAUDE.md'],
    commands: {
      pathFor: (name) => `.claude/commands/midas/${name}.md`,
      format: 'yaml',
    },
    skillsDir: '.claude/skills',
    global: {
      skillsDir: '.claude/skills',
      commands: {
        pathFor: (name) => `.claude/commands/midas/${name}.md`,
        format: 'yaml',
      },
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    rootDir: '.cursor',
    commands: {
      pathFor: (name) => `.cursor/commands/midas-${name}.md`,
      format: 'none',
    },
    global: {
      commands: {
        pathFor: (name) => `.cursor/commands/midas-${name}.md`,
        format: 'none',
      },
    },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    rootDir: '.windsurf',
    skillsDir: '.windsurf/skills',
    global: {
      skillsDir: '.windsurf/skills',
    },
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    rootDir: '.codex',
    skillsDir: '.codex/skills',
    global: {
      skillsDir: '.codex/skills',
    },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    rootDir: '.agents',
    markerFiles: ['.agent'],
    global: {
      skillsDir: '.gemini/antigravity/skills',
      commands: {
        pathFor: (name) => `.gemini/antigravity/global_workflows/midas-${name}.md`,
        format: 'yaml',
      },
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    rootDir: '.gemini',
    markerFiles: ['GEMINI.md'],
    global: {
      commands: {
        pathFor: (name) => `.gemini/commands/midas/${name}.toml`,
        format: 'toml',
      },
    },
  },
];

export interface ResolvedGlobalPaths {
  skillsDir?: string;
  commands?: {
    pathFor: (name: string) => string;
    format: CommandFormat;
  };
}

/**
 * Resolves a tool's global destinations against the user's home directory.
 * Returns null when the tool has no global convention (it should be skipped).
 */
export function resolveGlobalPaths(
  tool: ToolDescriptor,
  home: string = homedir(),
): ResolvedGlobalPaths | null {
  if (tool.global === undefined) {
    return null;
  }
  const resolved: ResolvedGlobalPaths = {};
  if (tool.global.skillsDir !== undefined) {
    resolved.skillsDir = join(home, tool.global.skillsDir);
  }
  if (tool.global.commands !== undefined) {
    const { pathFor, format } = tool.global.commands;
    resolved.commands = {
      pathFor: (name) => join(home, pathFor(name)),
      format,
    };
  }
  return resolved;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectTools(cwd: string): Promise<ToolDescriptor[]> {
  const detected: ToolDescriptor[] = [];
  for (const tool of TOOL_REGISTRY) {
    let found = false;
    if (tool.rootDir !== undefined && !tool.markerOnlyDetection) {
      found = await pathExists(join(cwd, tool.rootDir));
    }
    if (!found && tool.markerFiles !== undefined) {
      for (const marker of tool.markerFiles) {
        if (await pathExists(join(cwd, marker))) {
          found = true;
          break;
        }
      }
    }
    if (found) {
      detected.push(tool);
    }
  }
  return detected;
}

export function resolveToolsFlag(value: string): ToolDescriptor[] {
  if (value.trim() === 'all') {
    return [...TOOL_REGISTRY];
  }
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  const resolved: ToolDescriptor[] = [];
  for (const id of ids) {
    const tool = TOOL_REGISTRY.find((entry) => entry.id === id);
    if (tool === undefined) {
      const valid = TOOL_REGISTRY.map((entry) => entry.id).join(', ');
      throw new CliError(`unknown tool '${id}' — valid ids: ${valid}`, 2);
    }
    if (!resolved.includes(tool)) {
      resolved.push(tool);
    }
  }
  return resolved;
}
