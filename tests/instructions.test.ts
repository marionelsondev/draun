import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import { DEFAULT_SPECS_ROOT } from '../src/lib/init.js';
import {
  getInstructions,
  loadConfig,
  ANALYSIS_TEMPLATE,
  ISSUE_TEMPLATE,
  LANGUAGE_DIRECTIVES,
  SPEC_TEMPLATE,
} from '../src/lib/instructions.js';
import { makeInstructionsCommand } from '../src/commands/instructions.js';

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-instructions-'));
  home = await mkdtemp(join(tmpdir(), 'draun-instructions-home-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

const FULL_CONFIG = '';

async function writeConfig(content: string): Promise<void> {
  await mkdir(join(dir, '.draun'), { recursive: true });
  await writeFile(join(dir, '.draun', 'config.yaml'), content, 'utf8');
}

async function scaffoldSpec(slug: string, root = DEFAULT_SPECS_ROOT): Promise<void> {
  const specDir = join(dir, root, slug);
  await mkdir(specDir, { recursive: true });
  await writeFile(join(specDir, 'SPEC.md'), '# Spec\n', 'utf8');
}

describe('getInstructions', () => {
  it('returns spec template and SPEC.md path', async () => {
    await writeConfig(FULL_CONFIG);

    const payload = await getInstructions(dir, 'spec', 'pricing-engine', home);

    expect(payload.artifact).toBe('spec');
    expect(payload.template).toBe(SPEC_TEMPLATE);
    expect(payload.outputPath).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine', 'SPEC.md'));
    expect(payload.relOutputPath).toBe('.draun/specs/pricing-engine/SPEC.md');
  });

  it('returns issue template and issues/ path for break', async () => {
    await writeConfig(FULL_CONFIG);
    await scaffoldSpec('pricing-engine');

    const payload = await getInstructions(dir, 'break', 'pricing-engine', home);

    expect(payload.artifact).toBe('break');
    expect(payload.template).toBe(ISSUE_TEMPLATE);
    expect(payload.outputPath).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine', 'issues'));
    expect(payload.relOutputPath).toBe('.draun/specs/pricing-engine/issues');
  });

  it('returns analysis template and the SPEC.md path for analyze', async () => {
    await writeConfig(FULL_CONFIG);
    await scaffoldSpec('pricing-engine');

    const payload = await getInstructions(dir, 'analyze', 'pricing-engine', home);

    expect(payload.artifact).toBe('analyze');
    expect(payload.template).toBe(ANALYSIS_TEMPLATE);
    expect(payload.outputPath).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine', 'SPEC.md'));
    expect(payload.relOutputPath).toBe('.draun/specs/pricing-engine/SPEC.md');
  });

  it('rejects with CliError exit 1 for analyze with an unknown slug', async () => {
    await writeConfig(FULL_CONFIG);

    await expect(getInstructions(dir, 'analyze', 'no-such-spec', home)).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("unknown spec 'no-such-spec'"),
    });
  });

  it('rejects with CliError exit 2 for analyze without a slug', async () => {
    await writeConfig(FULL_CONFIG);

    await expect(getInstructions(dir, 'analyze', undefined, home)).rejects.toMatchObject({ exitCode: 2 });
  });

  it('uses a <slug> placeholder path for spec without a slug', async () => {
    await writeConfig(FULL_CONFIG);

    const payload = await getInstructions(dir, 'spec', undefined, home);

    expect(payload.outputPath).toBe(join(dir, DEFAULT_SPECS_ROOT, '<slug>', 'SPEC.md'));
    expect(payload.relOutputPath).toBe('.draun/specs/<slug>/SPEC.md');
  });

  it('rejects with CliError exit 1 when config is missing', async () => {
    let caught: unknown;
    try {
      await getInstructions(dir, 'spec', undefined, home);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
  });

  it('rejects with CliError exit 1 for break with an unknown slug', async () => {
    await writeConfig(FULL_CONFIG);

    let caught: unknown;
    try {
      await getInstructions(dir, 'break', 'no-such-spec', home);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CliError);
    expect((caught as CliError).exitCode).toBe(1);
    expect((caught as CliError).message).toContain("unknown spec 'no-such-spec'");
  });

  it('rejects with CliError exit 2 for break without a slug', async () => {
    await writeConfig(FULL_CONFIG);

    await expect(getInstructions(dir, 'break', undefined, home)).rejects.toMatchObject({ exitCode: 2 });
  });

  it('includes language pt-BR and the pt-BR directive when configured', async () => {
    await writeConfig(`${FULL_CONFIG}language: pt-BR\n`);

    const payload = await getInstructions(dir, 'spec', undefined, home);

    expect(payload.language).toBe('pt-BR');
    expect(payload.languageDirective).toBe(LANGUAGE_DIRECTIVES['pt-BR']);
    expect(payload.languageDirective).toContain('Brazilian Portuguese');
    expect(payload.languageDirective).toContain('INDEX.md');
    expect(payload.languageDirective).toContain('in English');
  });

  it('defaults language to en-US with the en-US directive when unconfigured', async () => {
    await writeConfig(FULL_CONFIG);

    const payload = await getInstructions(dir, 'spec', undefined, home);

    expect(payload.language).toBe('en-US');
    expect(payload.languageDirective).toBe(LANGUAGE_DIRECTIVES['en-US']);
    expect(payload.languageDirective).toContain('INDEX.md');
    expect(payload.languageDirective).toContain('in English');
  });

  it('includes language and directive on the break payload', async () => {
    await writeConfig(`${FULL_CONFIG}language: pt-BR\n`);
    await scaffoldSpec('pricing-engine');

    const payload = await getInstructions(dir, 'break', 'pricing-engine', home);

    expect(payload.language).toBe('pt-BR');
    expect(payload.languageDirective).toBe(LANGUAGE_DIRECTIVES['pt-BR']);
  });

  it('returns a byte-identical template regardless of language', async () => {
    await scaffoldSpec('pricing-engine');

    await writeConfig(`${FULL_CONFIG}language: pt-BR\n`);
    const ptSpec = await getInstructions(dir, 'spec', undefined, home);
    const ptBreak = await getInstructions(dir, 'break', 'pricing-engine', home);

    await writeConfig(FULL_CONFIG);
    const enSpec = await getInstructions(dir, 'spec', undefined, home);
    const enBreak = await getInstructions(dir, 'break', 'pricing-engine', home);

    expect(ptSpec.template).toBe(enSpec.template);
    expect(ptSpec.template).toBe(SPEC_TEMPLATE);
    expect(ptBreak.template).toBe(enBreak.template);
    expect(ptBreak.template).toBe(ISSUE_TEMPLATE);
  });

  it('rejects with CliError exit 1 for an unsupported language', async () => {
    await writeConfig(`${FULL_CONFIG}language: fr-FR\n`);

    await expect(getInstructions(dir, 'spec', undefined, home)).rejects.toMatchObject({ exitCode: 1 });
    await expect(getInstructions(dir, 'spec', undefined, home)).rejects.toThrow(/fr-FR/);
  });

  it('ignores a specsRoot override and keeps relOutputPath posix', async () => {
    await writeConfig(`specsRoot: custom/dir\n${FULL_CONFIG}`);
    await scaffoldSpec('pricing-engine');

    const payload = await getInstructions(dir, 'break', 'pricing-engine', home);

    expect(payload.outputPath).toBe(join(dir, DEFAULT_SPECS_ROOT, 'pricing-engine', 'issues'));
    expect(payload.relOutputPath).toBe('.draun/specs/pricing-engine/issues');
    expect(payload.relOutputPath).not.toContain('\\');
  });
});

describe('loadConfig', () => {
  it('rejects with exit 1 when the .draun directory is absent', async () => {
    await expect(loadConfig(dir, home)).rejects.toMatchObject({ exitCode: 1 });
  });

  it('succeeds with defaults when .draun exists without a config.yaml', async () => {
    await mkdir(join(dir, '.draun'), { recursive: true });

    const config = await loadConfig(dir, home);

    expect(config).toEqual({ language: 'en-US', tools: [] });
  });
});

describe('makeInstructionsCommand', () => {
  function makeProgram(): Command {
    const program = new Command('draun')
      .option('--json', 'emit machine-readable JSON output')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    program.addCommand(makeInstructionsCommand());
    return program;
  }

  it('emits a single JSON payload for instructions spec --json', async () => {
    await writeConfig(FULL_CONFIG);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    let out = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out += chunk.toString();
        return true;
      });

    try {
      await makeProgram().parseAsync(['instructions', 'spec', '--json'], { from: 'user' });
    } finally {
      stdoutSpy.mockRestore();
      cwdSpy.mockRestore();
    }

    const payload = JSON.parse(out) as {
      template: string;
      outputPath: string;
    };
    expect(payload.template).toBe(SPEC_TEMPLATE);
    expect(payload.outputPath).toBe(join(dir, DEFAULT_SPECS_ROOT, '<slug>', 'SPEC.md'));
  });

  it('emits language and languageDirective in the JSON payload', async () => {
    await writeConfig(`${FULL_CONFIG}language: pt-BR\n`);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    let out = '';
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out += chunk.toString();
        return true;
      });

    try {
      await makeProgram().parseAsync(['instructions', 'spec', '--json'], { from: 'user' });
    } finally {
      stdoutSpy.mockRestore();
      cwdSpy.mockRestore();
    }

    const payload = JSON.parse(out) as {
      template: string;
      language: string;
      languageDirective: string;
    };
    expect(payload.language).toBe('pt-BR');
    expect(payload.languageDirective).toBe(LANGUAGE_DIRECTIVES['pt-BR']);
    expect(payload.template).toBe(SPEC_TEMPLATE);
  });

  it('rejects with exit code 2 for an unknown artifact', async () => {
    await writeConfig(FULL_CONFIG);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);

    try {
      let caught: unknown;
      try {
        await makeProgram().parseAsync(['instructions', 'bogus'], { from: 'user' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(CliError);
      expect((caught as CliError).exitCode).toBe(2);
    } finally {
      cwdSpy.mockRestore();
    }
  });
});
