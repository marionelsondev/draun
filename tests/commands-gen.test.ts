import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCommands, renderCommandFile } from '../src/lib/commands-gen.js';
import { parse } from 'smol-toml';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../src/lib/workflow-templates.js';
import { TOOL_REGISTRY, type ToolDescriptor } from '../src/lib/tools.js';

const claude = TOOL_REGISTRY.find((t) => t.id === 'claude') as ToolDescriptor;
const cursor = TOOL_REGISTRY.find((t) => t.id === 'cursor') as ToolDescriptor;
const windsurf = TOOL_REGISTRY.find((t) => t.id === 'windsurf') as ToolDescriptor;
const codex = TOOL_REGISTRY.find((t) => t.id === 'codex') as ToolDescriptor;
const antigravity = TOOL_REGISTRY.find((t) => t.id === 'antigravity') as ToolDescriptor;
const gemini = TOOL_REGISTRY.find((t) => t.id === 'gemini') as ToolDescriptor;

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'midas-commands-home-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('WORKFLOW_TEMPLATES', () => {
  it('defines the five workflow commands', () => {
    expect(WORKFLOW_TEMPLATES.map((t) => t.name)).toEqual([
      'spec',
      'analyze',
      'break',
      'implement',
      'archive',
    ]);
  });

  it('each body drives the workflow through midas --json calls', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      expect(template.body).toMatch(/`midas .*--json`/);
      expect(template.description.length).toBeGreaterThan(0);
    }
  });

  it('implement requires an execution mode and tracks issues via start/done', () => {
    const impl = WORKFLOW_TEMPLATES.find((t) => t.name === 'implement')!;
    expect(impl.argumentHint).toBe('[spec-slug] [manual|auto|ultracode]');
    expect(impl.body).toContain('`manual`');
    expect(impl.body).toContain('`auto`');
    expect(impl.body).toContain('`ultracode`');
    expect(impl.body).toContain('ASK the user');
    expect(impl.body).toContain('WAIT for the answer');
    expect(impl.body).toContain('midas start <spec-slug>');
    expect(impl.body).toContain('midas done <spec-slug>');
    // The ultracode recipe must keep INDEX.md writes serialized in the orchestrator.
    expect(impl.body).toContain('ONLY the orchestrator writes to INDEX.md');
  });

  it('analyze reviews the spec without editing it and points to break next', () => {
    const analyze = WORKFLOW_TEMPLATES.find((t) => t.name === 'analyze')!;
    expect(analyze.argumentHint).toBe('[spec-slug]');
    expect(analyze.body).toContain('midas instructions analyze --spec <spec-slug> --json');
    expect(analyze.body).toContain('midas validate <spec-slug> --json');
    expect(analyze.body).toContain('Do NOT rewrite or edit SPEC.md');
    expect(analyze.body).toContain('/midas:break <spec-slug>');
  });
});

describe('renderCommandFile', () => {
  it('renders yaml frontmatter with description and argument-hint', () => {
    const spec = WORKFLOW_TEMPLATES[0];
    const content = renderCommandFile(spec, 'yaml');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain(`description: ${spec.description}`);
    expect(content).toContain('argument-hint: [feature-description]');
    expect(content).toContain(spec.body);
  });

  it('renders no frontmatter for the none dialect', () => {
    const spec = WORKFLOW_TEMPLATES[0];
    const content = renderCommandFile(spec, 'none');
    expect(content.startsWith('---')).toBe(false);
    expect(content).toContain(spec.description);
    expect(content).toContain(spec.body);
  });
});

describe('renderCommandFile toml', () => {
  it('round-trips description and prompt for every workflow template', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const doc = parse(renderCommandFile(template, 'toml'));
      expect(doc.description).toBe(template.description);
      const expectedBody =
        template.argumentHint !== undefined
          ? `${template.body}\n\nARGUMENTS: {{args}}\n`
          : `${template.body}\n`;
      expect(doc.prompt).toBe(expectedBody);
      expect(Object.keys(doc).sort()).toEqual(['description', 'prompt']);
    }
  });

  it('uses a basic string for description and a multiline string for prompt', () => {
    const content = renderCommandFile(WORKFLOW_TEMPLATES[0], 'toml');
    expect(content.startsWith('description = "')).toBe(true);
    expect(content).toContain('prompt = """');
  });

  it('escapes hostile quotes, backslashes and triple quotes', () => {
    const hostile: WorkflowTemplate = {
      name: 'hostile',
      description: 'A "quoted" description with a back\\slash',
      body: [
        'Path with backslashes: C:\\path\\to\\file',
        'Embedded triple quotes: """inside"""',
        'A line ending with a quote "',
        'Some `backticks` and more text',
        'Body ends with a quote "',
      ].join('\n'),
    };
    const doc = parse(renderCommandFile(hostile, 'toml'));
    expect(doc.description).toBe(hostile.description);
    expect(doc.prompt).toBe(`${hostile.body}\n`);
  });
});

describe('generateCommands', () => {
  it('writes the five command files at each tool global path', async () => {
    const result = await generateCommands([claude, cursor], home);

    expect(result.written).toEqual([
      join(home, '.claude', 'commands', 'midas', 'spec.md'),
      join(home, '.claude', 'commands', 'midas', 'analyze.md'),
      join(home, '.claude', 'commands', 'midas', 'break.md'),
      join(home, '.claude', 'commands', 'midas', 'implement.md'),
      join(home, '.claude', 'commands', 'midas', 'archive.md'),
      join(home, '.cursor', 'commands', 'midas-spec.md'),
      join(home, '.cursor', 'commands', 'midas-analyze.md'),
      join(home, '.cursor', 'commands', 'midas-break.md'),
      join(home, '.cursor', 'commands', 'midas-implement.md'),
      join(home, '.cursor', 'commands', 'midas-archive.md'),
    ]);
    expect(result.skipped).toEqual([]);

    const claudeSpec = await readFile(
      join(home, '.claude', 'commands', 'midas', 'spec.md'),
      'utf8'
    );
    expect(claudeSpec.startsWith('---\n')).toBe(true);
    expect(claudeSpec).toContain('description:');

    const cursorSpec = await readFile(join(home, '.cursor', 'commands', 'midas-spec.md'), 'utf8');
    expect(cursorSpec.startsWith('---')).toBe(false);
    expect(cursorSpec).toContain('midas instructions spec --json');
  });

  it('writes the five gemini TOML commands under the global home', async () => {
    const result = await generateCommands([gemini], home);

    expect(result.skipped).toEqual([]);
    expect(result.written).toEqual([
      join(home, '.gemini', 'commands', 'midas', 'spec.toml'),
      join(home, '.gemini', 'commands', 'midas', 'analyze.toml'),
      join(home, '.gemini', 'commands', 'midas', 'break.toml'),
      join(home, '.gemini', 'commands', 'midas', 'implement.toml'),
      join(home, '.gemini', 'commands', 'midas', 'archive.toml'),
    ]);

    const spec = WORKFLOW_TEMPLATES[0];
    const doc = parse(
      await readFile(join(home, '.gemini', 'commands', 'midas', 'spec.toml'), 'utf8')
    );
    expect(doc.description).toBe(spec.description);
    expect(doc.prompt).toContain('{{args}}');
    expect(doc.prompt).toContain('midas instructions spec --json');
  });

  it('writes the five antigravity workflows under global_workflows', async () => {
    const result = await generateCommands([antigravity], home);

    const workflowsDir = join(home, '.gemini', 'antigravity', 'global_workflows');
    expect(result.skipped).toEqual([]);
    expect(result.written).toEqual([
      join(workflowsDir, 'midas-spec.md'),
      join(workflowsDir, 'midas-analyze.md'),
      join(workflowsDir, 'midas-break.md'),
      join(workflowsDir, 'midas-implement.md'),
      join(workflowsDir, 'midas-archive.md'),
    ]);

    const spec = WORKFLOW_TEMPLATES[0];
    const content = await readFile(join(workflowsDir, 'midas-spec.md'), 'utf8');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain(`description: ${spec.description}`);
    expect(content).toContain('argument-hint: [feature-description]');
    expect(content).toContain(spec.body);

    // Idempotent: a second run rewrites without leaving extra files behind.
    await generateCommands([antigravity], home);
    const entries = (await readdir(workflowsDir)).sort();
    expect(entries).toEqual([
      'midas-analyze.md',
      'midas-archive.md',
      'midas-break.md',
      'midas-implement.md',
      'midas-spec.md',
    ]);
  });

  it('reports tools without a global command destination as skipped', async () => {
    const result = await generateCommands([windsurf, codex, claude], home);

    expect(result.skipped).toEqual(['windsurf', 'codex']);
    expect(result.written).toHaveLength(5);
    expect(result.written.every((p) => p.startsWith(join(home, '.claude')))).toBe(true);
  });

  it('overwrites midas-owned files but leaves other files untouched', async () => {
    const commandsDir = join(home, '.claude', 'commands', 'midas');
    await mkdir(commandsDir, { recursive: true });
    await writeFile(join(commandsDir, 'custom.md'), 'user content\n', 'utf8');
    await writeFile(join(commandsDir, 'spec.md'), 'stale generated content\n', 'utf8');

    const result = await generateCommands([claude], home);

    expect(result.written).toContain(join(commandsDir, 'spec.md'));
    const spec = await readFile(join(commandsDir, 'spec.md'), 'utf8');
    expect(spec).not.toContain('stale generated content');
    expect(spec).toContain('midas instructions spec --json');
    expect(await readFile(join(commandsDir, 'custom.md'), 'utf8')).toBe('user content\n');
  });

  it('skips a tool whose global directory cannot be created without aborting the rest', async () => {
    // a plain file occupying ~/.claude makes mkdir of .claude/commands/... fail
    await writeFile(join(home, '.claude'), 'not a directory\n', 'utf8');

    const result = await generateCommands([claude, cursor], home);

    expect(result.skipped).toEqual(['claude']);
    expect(result.written).toEqual([
      join(home, '.cursor', 'commands', 'midas-spec.md'),
      join(home, '.cursor', 'commands', 'midas-analyze.md'),
      join(home, '.cursor', 'commands', 'midas-break.md'),
      join(home, '.cursor', 'commands', 'midas-implement.md'),
      join(home, '.cursor', 'commands', 'midas-archive.md'),
    ]);
  });

  it('is idempotent: regeneration yields identical files', async () => {
    await generateCommands([claude, cursor], home);
    const path = join(home, '.cursor', 'commands', 'midas-implement.md');
    const first = await readFile(path, 'utf8');

    await generateCommands([claude, cursor], home);

    expect(await readFile(path, 'utf8')).toBe(first);
  });
});
