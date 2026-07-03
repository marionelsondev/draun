import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { CliError } from './output.js';
import { requireProjectRoot, resolveConfig, type ResolvedConfig } from './config.js';
import type { Language } from './language.js';
import { resolveSpecsRoot } from './new.js';

export type Artifact = 'spec' | 'break' | 'analyze';

export const SPEC_TEMPLATE = `# <Title>

## Overview

<One or two paragraphs describing what is being built and why.>

---

## <Page or Area Name>

<Short description of this page or area.>

### Components

- **<ComponentName>**: <what it is>

### Behaviors

- **<behavior-slug>**: <what happens and when>

---

## Open Questions

- None
`;

export const ISSUE_TEMPLATE = `# NN — <Title>

**Source:** <page or behavior in SPEC.md>

**Summary:** <one-sentence summary of the deliverable.>

## Functional Specification

- <observable behavior the implementation must satisfy>

## Preconditions

- <what must already exist or be true>

## Main Flow

1. <step>
2. <step>

## Expected Result

- <how to verify the issue is done>

## Blocked by

- <NN — Title>(NN-slug.md) or None

## Open Questions

- None
`;

export const ANALYSIS_TEMPLATE = `# Spec Analysis — <Spec Title>

## Summary

<One-paragraph verdict: is the spec ready to be broken into issues?>

## Findings

### <finding-slug> — <critical | warning | suggestion>

- **Where**: <page, component, or behavior in SPEC.md>
- **Problem**: <what is ambiguous, missing, or risky>
- **Suggestion**: <how to fix or what to clarify>

## Open Questions to resolve

- <question the user must answer before breaking the spec> or None

## Verdict

<ready | needs work> — <short justification>
`;

export const LANGUAGE_DIRECTIVES: Record<Language, string> = {
  'en-US':
    'Write all prose content (titles, descriptions, behaviors) in English (United States) and converse with the user in English (United States). Keep structural headings and INDEX.md syntax (e.g., `## Overview`, `## All issues`, checkbox lines, `blocked by:` annotations) in English.',
  'pt-BR':
    'Write all prose content (titles, descriptions, behaviors) in Brazilian Portuguese (pt-BR) and converse with the user in Brazilian Portuguese. Keep structural headings and INDEX.md syntax (e.g., `## Overview`, `## All issues`, checkbox lines, `blocked by:` annotations) in English.',
};

export type DraunConfig = ResolvedConfig;

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

export async function loadConfig(cwd: string, homeDir = homedir()): Promise<DraunConfig> {
  await requireProjectRoot(cwd, homeDir);
  return resolveConfig(cwd, homeDir);
}

export interface InstructionsPayload {
  artifact: Artifact;
  template: string;
  language: Language;
  languageDirective: string;
  outputPath: string;
  relOutputPath: string;
}

export async function getInstructions(
  cwd: string,
  artifact: Artifact,
  specSlug?: string,
  homeDir = homedir(),
): Promise<InstructionsPayload> {
  const config = await loadConfig(cwd, homeDir);
  const root = await resolveSpecsRoot(cwd, homeDir);

  if (artifact === 'spec') {
    const outputPath = join(root, specSlug ?? '<slug>', 'SPEC.md');
    return {
      artifact,
      template: SPEC_TEMPLATE,
      language: config.language,
      languageDirective: LANGUAGE_DIRECTIVES[config.language],
      outputPath,
      relOutputPath: toPosix(relative(cwd, outputPath)),
    };
  }

  if (specSlug === undefined || specSlug === '') {
    throw new CliError(`'${artifact}' requires --spec <slug>`, 2);
  }

  const specPath = join(root, specSlug, 'SPEC.md');
  try {
    await readFile(specPath);
  } catch {
    throw new CliError(`unknown spec '${specSlug}'`, 1);
  }

  if (artifact === 'analyze') {
    return {
      artifact,
      template: ANALYSIS_TEMPLATE,
      language: config.language,
      languageDirective: LANGUAGE_DIRECTIVES[config.language],
      outputPath: specPath,
      relOutputPath: toPosix(relative(cwd, specPath)),
    };
  }

  const outputPath = join(root, specSlug, 'issues');
  return {
    artifact,
    template: ISSUE_TEMPLATE,
    language: config.language,
    languageDirective: LANGUAGE_DIRECTIVES[config.language],
    outputPath,
    relOutputPath: toPosix(relative(cwd, outputPath)),
  };
}
