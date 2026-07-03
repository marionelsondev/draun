import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AGENTS_FILENAME,
  BLOCK_BEGIN,
  BLOCK_END,
  MANAGED_BLOCK,
  writeAgentsBlock,
} from '../src/lib/agents-md.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-agents-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeAgentsBlock', () => {
  it('creates AGENTS.md containing only the managed block when missing', async () => {
    const result = await writeAgentsBlock(dir);

    expect(result.action).toBe('created');
    expect(result.path).toBe(join(dir, AGENTS_FILENAME));
    const content = await readFile(result.path, 'utf8');
    expect(content).toBe(`${MANAGED_BLOCK}\n`);
    expect(content).toContain(BLOCK_BEGIN);
    expect(content).toContain(BLOCK_END);
  });

  it('appends the block to an existing file without markers, preserving content byte-for-byte', async () => {
    const path = join(dir, AGENTS_FILENAME);
    const original = '# My project\n\nSome user instructions.\n';
    await writeFile(path, original, 'utf8');

    const result = await writeAgentsBlock(dir);

    expect(result.action).toBe('updated');
    const content = await readFile(path, 'utf8');
    expect(content.startsWith(original)).toBe(true);
    expect(content.endsWith(`${MANAGED_BLOCK}\n`)).toBe(true);
  });

  it('appends with a separating newline when the file has no trailing newline', async () => {
    const path = join(dir, AGENTS_FILENAME);
    const original = '# My project';
    await writeFile(path, original, 'utf8');

    const result = await writeAgentsBlock(dir);

    expect(result.action).toBe('updated');
    const content = await readFile(path, 'utf8');
    expect(content.startsWith(original)).toBe(true);
    expect(content).toBe(`${original}\n\n${MANAGED_BLOCK}\n`);
  });

  it('replaces only the content between existing markers', async () => {
    const path = join(dir, AGENTS_FILENAME);
    const before = '# User heading\n\nAbove the block.\n\n';
    const after = '\n\n## Below\n\nAfter the block.\n';
    await writeFile(
      path,
      `${before}${BLOCK_BEGIN}\nstale old content\n${BLOCK_END}${after}`,
      'utf8'
    );

    const result = await writeAgentsBlock(dir);

    expect(result.action).toBe('updated');
    const content = await readFile(path, 'utf8');
    expect(content).toBe(`${before}${MANAGED_BLOCK}${after}`);
    expect(content).not.toContain('stale old content');
  });

  it('is idempotent: second run reports unchanged and keeps file bytes identical', async () => {
    await writeAgentsBlock(dir);
    const path = join(dir, AGENTS_FILENAME);
    const first = await readFile(path, 'utf8');

    const second = await writeAgentsBlock(dir);

    expect(second.action).toBe('unchanged');
    expect(await readFile(path, 'utf8')).toBe(first);
  });

  it('ignores marker text quoted inline and preserves user content around the real block', async () => {
    const path = join(dir, AGENTS_FILENAME);
    const before = `docs: ${BLOCK_BEGIN} is the marker\n\nIMPORTANT USER CONTENT\n\n`;
    await writeFile(path, `${before}${BLOCK_BEGIN}\nstale\n${BLOCK_END}\n`, 'utf8');

    const result = await writeAgentsBlock(dir);

    expect(result.action).toBe('updated');
    const content = await readFile(path, 'utf8');
    expect(content).toBe(`${before}${MANAGED_BLOCK}\n`);
    expect(content).toContain('IMPORTANT USER CONTENT');
  });

  it('ignores a stray inline end marker before the real block instead of duplicating it', async () => {
    const path = join(dir, AGENTS_FILENAME);
    const before = `note: ${BLOCK_END} ends the block\n\n`;
    await writeFile(path, `${before}${BLOCK_BEGIN}\nstale\n${BLOCK_END}\n`, 'utf8');

    await writeAgentsBlock(dir);
    const second = await writeAgentsBlock(dir);

    expect(second.action).toBe('unchanged');
    const content = await readFile(path, 'utf8');
    expect(content).toBe(`${before}${MANAGED_BLOCK}\n`);
    expect(content.split(BLOCK_END).length - 1).toBe(2); // inline mention + real block
  });

  it('fails with a clear error when a begin marker has no matching end marker', async () => {
    const path = join(dir, AGENTS_FILENAME);
    await writeFile(path, `# Mine\n\n${BLOCK_BEGIN}\norphaned\n`, 'utf8');

    await expect(writeAgentsBlock(dir)).rejects.toThrow(/without a matching/);
    expect(await readFile(path, 'utf8')).toContain('orphaned');
  });

  it('documents command invocations that match the real CLI signatures', () => {
    expect(MANAGED_BLOCK).toContain('draun issues <spec-slug> --ready');
    expect(MANAGED_BLOCK).toContain('draun done <spec-slug> <issue-number>');
    expect(MANAGED_BLOCK).toContain('draun reopen <spec-slug> <issue-number>');
    expect(MANAGED_BLOCK).toContain('draun validate <spec-slug>');
    expect(MANAGED_BLOCK).toContain('draun start <spec-slug> <issue-number>');
    expect(MANAGED_BLOCK).toContain('draun-spec');
    expect(MANAGED_BLOCK).toContain('.draun/config.yaml');
  });

  it('is idempotent with surrounding user content', async () => {
    const path = join(dir, AGENTS_FILENAME);
    await writeFile(path, '# Mine\n\nKeep me.\n', 'utf8');
    await writeAgentsBlock(dir);
    const first = await readFile(path, 'utf8');

    const second = await writeAgentsBlock(dir);

    expect(second.action).toBe('unchanged');
    const content = await readFile(path, 'utf8');
    expect(content).toBe(first);
    expect(content).toContain('Keep me.');
  });
});
