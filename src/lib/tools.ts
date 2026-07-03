import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError } from './output.js';

/** Global install destinations, declared relative to the user's home directory. */
export interface ToolGlobalPaths {
  skillsDir?: string;
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
    skillsDir: '.claude/skills',
    global: {
      skillsDir: '.claude/skills',
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    rootDir: '.cursor',
    skillsDir: '.cursor/skills',
    global: {
      skillsDir: '.cursor/skills',
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
    name: 'Codex',
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
    },
  },
  {
    id: 'opencode',
    name: 'Opencode',
    rootDir: '.opencode',
    markerFiles: ['opencode.json', 'opencode.jsonc'],
    skillsDir: '.opencode/skills',
    global: {
      skillsDir: '.config/opencode/skills',
    },
  },
];

export interface ResolvedGlobalPaths {
  skillsDir?: string;
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
