import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { CliError } from './output.js';
import { requireProjectRoot, SPECS_ROOT_REL } from './config.js';

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') {
    throw new CliError(`invalid spec name: '${name}' produces an empty slug`, 2);
  }
  return slug;
}

export class SpecConflictError extends CliError {
  constructor(
    public slug: string,
    public specPath: string,
  ) {
    super(`spec '${slug}' already exists at ${specPath}`, 1);
    this.name = 'SpecConflictError';
  }
}

/**
 * Specs always live at `<root>/.draun/specs`, where the project root is
 * discovered by walking up from `cwd` until a `.draun/` directory is found.
 * Throws the standard "project not initialized" CliError when no root exists.
 */
export async function resolveSpecsRoot(cwd: string, homeDir = homedir()): Promise<string> {
  const root = await requireProjectRoot(cwd, homeDir);
  return join(root, SPECS_ROOT_REL);
}

export interface NewSpecResult {
  slug: string;
  dir: string;
  specPath: string;
  relDir: string;
  relSpecPath: string;
}

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

export async function newSpec(cwd: string, name: string): Promise<NewSpecResult> {
  const slug = slugify(name);
  const root = await resolveSpecsRoot(cwd);
  const dir = join(root, slug);
  const specPath = join(dir, 'SPEC.md');

  let specExists = false;
  try {
    await readFile(specPath);
    specExists = true;
  } catch {
    // SPEC.md absent: no conflict
  }
  if (specExists) {
    throw new SpecConflictError(slug, specPath);
  }

  await mkdir(dir, { recursive: true });

  return {
    slug,
    dir,
    specPath,
    relDir: toPosix(relative(cwd, dir)),
    relSpecPath: toPosix(relative(cwd, specPath)),
  };
}
