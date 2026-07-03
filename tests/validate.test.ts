import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { CliError } from '../src/lib/output.js';
import {
  parseIndexBlockedBy,
  parseIssueBlockedBy,
  validateIssueContent,
  validateSpec,
  validateSpecContent,
} from '../src/lib/validate.js';
import { makeValidateCommand } from '../src/commands/validate.js';

const VALID_SPEC = `# Pricing Engine

## Overview

Some overview text.

## Pricing Page

### Components

- **Table**: prices

### Behaviors

- **load-prices**: loads prices

## Open Questions

- None
`;

function issueContent(blockedBy: string): string {
  return `# 01 — Something

## Functional Specification

- does a thing

## Preconditions

- none

## Main Flow

1. step

## Expected Result

- result

## Blocked by

${blockedBy}

## Open Questions

- None
`;
}

function indexContent(lines: string[]): string {
  return `# Issues

## All issues

${lines.join('\n')}
`;
}

let cwd: string;
let specDir: string;
let issuesDir: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'draun-validate-'));
  specDir = join(cwd, '.draun', 'specs', 'pricing-engine');
  issuesDir = join(specDir, 'issues');
  await mkdir(specDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cwd, { recursive: true, force: true });
});

async function writeSpec(content: string = VALID_SPEC): Promise<void> {
  await writeFile(join(specDir, 'SPEC.md'), content, 'utf8');
}

describe('validateSpecContent', () => {
  it('passes a valid spec', () => {
    expect(validateSpecContent(VALID_SPEC, 'SPEC.md')).toEqual([]);
  });

  it('flags missing Overview', () => {
    const content = VALID_SPEC.replace('## Overview', '## Intro');
    const findings = validateSpecContent(content, 'SPEC.md');
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'spec-missing-section', message: expect.stringContaining('Overview') }),
    );
  });

  it('flags missing page with Components and Behaviors', () => {
    const content = VALID_SPEC.replace('### Behaviors', '### Other');
    const findings = validateSpecContent(content, 'SPEC.md');
    expect(findings).toContainEqual(
      expect.objectContaining({
        rule: 'spec-missing-section',
        message: expect.stringContaining('Components'),
      }),
    );
  });

  it('flags missing Open Questions', () => {
    const content = VALID_SPEC.replace('## Open Questions', '## Questions');
    const findings = validateSpecContent(content, 'SPEC.md');
    expect(findings).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('Open Questions') }),
    );
  });
});

describe('validateIssueContent', () => {
  it('passes a valid issue', () => {
    expect(validateIssueContent(issueContent('- None'), 'issues/01-x.md')).toEqual([]);
  });

  it.each([
    'Functional Specification',
    'Preconditions',
    'Main Flow',
    'Expected Result',
    'Blocked by',
    'Open Questions',
  ])('flags missing section: %s', (section) => {
    const content = issueContent('- None').replace(`## ${section}`, `## Removed`);
    const findings = validateIssueContent(content, 'issues/01-x.md');
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        rule: 'issue-missing-section',
        message: `missing required section: ${section}`,
      }),
    );
  });
});

describe('blocked-by parsing', () => {
  it('parses issue links and bare numbers', () => {
    expect(parseIssueBlockedBy(issueContent('- [03 — Other](03-other.md)\n- 04'))).toEqual(['3', '4']);
  });

  it('treats - None as empty', () => {
    expect(parseIssueBlockedBy(issueContent('- None'))).toEqual([]);
  });

  it('parses INDEX annotations', () => {
    expect(parseIndexBlockedBy('- [ ] [05 — X](05-x.md) — blocked by: 02, 03')).toEqual(['2', '3']);
    expect(parseIndexBlockedBy('- [ ] [01 — X](01-x.md) — blocked by: none')).toEqual([]);
  });
});

describe('validateSpec', () => {
  it('returns ok for a consistent spec with issues and INDEX', async () => {
    await writeSpec();
    await mkdir(issuesDir, { recursive: true });
    await writeFile(join(issuesDir, '01-first.md'), issueContent('- None'), 'utf8');
    await writeFile(join(issuesDir, '02-second.md'), issueContent('- [01 — First](01-first.md)'), 'utf8');
    await writeFile(
      join(issuesDir, 'INDEX.md'),
      indexContent([
        '- [ ] [01 — First](01-first.md) — blocked by: none',
        '- [x] [02 — Second](02-second.md) — blocked by: 01',
      ]),
      'utf8',
    );

    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.findings).toEqual([]);
    expect(result).toMatchObject({ slug: 'pricing-engine', ok: true, errorCount: 0, warningCount: 0 });
  });

  it('flags blocked-by mismatch between INDEX and issue file', async () => {
    await writeSpec();
    await mkdir(issuesDir, { recursive: true });
    await writeFile(join(issuesDir, '01-first.md'), issueContent('- 03'), 'utf8');
    await writeFile(
      join(issuesDir, 'INDEX.md'),
      indexContent(['- [ ] [01 — First](01-first.md) — blocked by: 02']),
      'utf8',
    );

    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: 'error', rule: 'index-blockedby-mismatch' }),
    );
  });

  it('treats none annotation and - None section as equivalent', async () => {
    await writeSpec();
    await mkdir(issuesDir, { recursive: true });
    await writeFile(join(issuesDir, '01-first.md'), issueContent('- None'), 'utf8');
    await writeFile(
      join(issuesDir, 'INDEX.md'),
      indexContent(['- [ ] [01 — First](01-first.md) — blocked by: none']),
      'utf8',
    );

    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.findings).toEqual([]);
  });

  it('reports orphan issue files as warnings only', async () => {
    await writeSpec();
    await mkdir(issuesDir, { recursive: true });
    await writeFile(join(issuesDir, '01-first.md'), issueContent('- None'), 'utf8');
    await writeFile(join(issuesDir, '02-orphan.md'), issueContent('- None'), 'utf8');
    await writeFile(
      join(issuesDir, 'INDEX.md'),
      indexContent(['- [ ] [01 — First](01-first.md) — blocked by: none']),
      'utf8',
    );

    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.ok).toBe(true);
    expect(result.warningCount).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: 'warning', rule: 'orphan-issue-file' }),
    );
  });

  it('reports INDEX entries pointing to missing files as errors', async () => {
    await writeSpec();
    await mkdir(issuesDir, { recursive: true });
    await writeFile(
      join(issuesDir, 'INDEX.md'),
      indexContent(['- [ ] [01 — Ghost](01-ghost.md) — blocked by: none']),
      'utf8',
    );

    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: 'error', rule: 'index-missing-file' }),
    );
  });

  it('errors when issues/ exists without INDEX.md', async () => {
    await writeSpec();
    await mkdir(issuesDir, { recursive: true });
    await writeFile(join(issuesDir, '01-first.md'), issueContent('- None'), 'utf8');

    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: 'index-missing' }));
  });

  it('is ok with a valid SPEC and no issues/ folder', async () => {
    await writeSpec();
    const result = await validateSpec(cwd, 'pricing-engine');
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('throws CliError for an unknown slug', async () => {
    await expect(validateSpec(cwd, 'nope')).rejects.toThrowError(CliError);
  });
});

describe('makeValidateCommand', () => {
  it('prints a single JSON document with --json', async () => {
    await writeSpec();
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    let out = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });

    const program = new Command();
    program.exitOverride();
    program.option('--json', 'machine-readable output');
    program.addCommand(makeValidateCommand());
    await program.parseAsync(['validate', 'pricing-engine', '--json'], { from: 'user' });

    const parsed = JSON.parse(out);
    expect(parsed).toMatchObject({ slug: 'pricing-engine', ok: true, errorCount: 0 });
  });

  it('throws CliError with exit code 1 when validation fails', async () => {
    await writeSpec('# Broken\n\n## Overview\n\ntext\n');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const program = new Command();
    program.exitOverride();
    program.option('--json', 'machine-readable output');
    program.addCommand(makeValidateCommand());

    await expect(
      program.parseAsync(['validate', 'pricing-engine'], { from: 'user' }),
    ).rejects.toMatchObject({ name: 'CliError', exitCode: 1 });
  });
});
