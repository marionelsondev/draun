import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfigApp } from '../src/tui/ConfigApp.js';
import type { ConfigApplyPayload, ConfigDraftState } from '../src/lib/config-cmd.js';
import { globalConfigPath } from '../src/lib/config.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mocked = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  const homedir = () => mocked.home;
  return { ...os, homedir, default: { ...os, homedir } };
});

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-config-tui-'));
  home = await mkdtemp(join(tmpdir(), 'draun-config-tui-home-'));
  mocked.home = home;
  await mkdir(join(home, '.draun'), { recursive: true });
  await writeFile(globalConfigPath(home), 'tools:\n  - claude\nlanguage: en-US\n', 'utf8');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

function draftFixture(overrides: Partial<ConfigDraftState> = {}): ConfigDraftState {
  return {
    tools: ['claude'],
    language: 'en-US',
    languageScope: 'global',
    globalLanguage: 'en-US',
    projectRoot: null,
    projectConfigPath: null,
    globalConfigPath: globalConfigPath(home),
    globalConfigExists: true,
    projectScopeAvailable: false,
    firstTime: false,
    ...overrides,
  };
}

/** From hub tabs focus: down to search, down to list. */
async function focusList(app: ReturnType<typeof render>): Promise<void> {
  app.stdin.write('\x1b[B'); // tabs → search
  await delay(15);
  app.stdin.write('\x1b[B'); // search → list
  await delay(15);
}

describe('ConfigApp hub', () => {
  it('renders Settings tab, search, and setting rows with values', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const app = render(<ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} />);
    await delay(50);
    const frame = app.lastFrame() ?? '';

    expect(frame).toContain('Settings');
    expect(frame).toContain('Search settings');
    expect(frame).toContain('Tools');
    expect(frame).toContain('claude');
    expect(frame).toContain('Spec language');
    expect(frame).toContain('en-US');
    expect(frame).toContain('global');

    app.unmount();
  });

  it('filters the list when typing in search', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const app = render(<ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} />);
    await delay(50);

    app.stdin.write('\x1b[B'); // → search
    await delay(15);
    app.stdin.write('tool');
    await delay(30);

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Tools');
    expect(frame).not.toContain('Spec language');

    app.unmount();
  });

  it('opens Tools on Enter and returns with Esc (draft only)', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const onApply = vi.fn();
    const app = render(
      <ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} onApply={onApply} />
    );
    await delay(50);

    await focusList(app);
    app.stdin.write('\r'); // open Tools (first item)
    await delay(30);

    let frame = app.lastFrame() ?? '';
    expect(frame).toContain('Claude Code');
    expect(frame).toContain('Esc back');
    expect(frame).not.toContain('Search settings');

    // Toggle first tool off
    app.stdin.write(' ');
    await delay(20);
    app.stdin.write('\x1b'); // Esc back
    await delay(30);

    frame = app.lastFrame() ?? '';
    expect(frame).toContain('Tools');
    expect(frame).toContain('unsaved');
    expect(frame).toMatch(/none|Tools/);
    expect(onApply).not.toHaveBeenCalled();

    app.unmount();
  });

  it('opens Spec language and can change language without saving', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const onApply = vi.fn();
    const app = render(
      <ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} onApply={onApply} />
    );
    await delay(50);

    await focusList(app);
    app.stdin.write('\x1b[B'); // second item
    await delay(15);
    app.stdin.write('\r');
    await delay(30);

    let frame = app.lastFrame() ?? '';
    expect(frame).toContain('Spec language');
    expect(frame).toContain('pt-BR');

    app.stdin.write('\x1b[B'); // pt-BR
    await delay(15);
    app.stdin.write(' ');
    await delay(15);
    app.stdin.write('\x1b');
    await delay(30);

    frame = app.lastFrame() ?? '';
    expect(frame).toContain('pt-BR');
    expect(frame).toContain('unsaved');
    expect(onApply).not.toHaveBeenCalled();

    app.unmount();
  });

  it('single save on hub with s persists full draft', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const payload: ConfigApplyPayload = {
      mode: 'apply',
      tools: ['claude'],
      language: 'pt-BR',
      languageScope: 'global',
      globalConfigPath: globalConfigPath(home),
      projectConfigPath: null,
      projectRoot: null,
      skills: { generated: { byTool: [], skipped: [] }, removed: [] },
      bootstrapped: false,
      toolsChanged: false,
    };
    const onApply = vi.fn(async () => payload);
    const app = render(
      <ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} onApply={onApply} />
    );
    await delay(50);

    // Change language in sub-screen
    await focusList(app);
    app.stdin.write('\x1b[B');
    await delay(15);
    app.stdin.write('\r');
    await delay(20);
    app.stdin.write('\x1b[B');
    await delay(15);
    app.stdin.write(' ');
    await delay(15);
    app.stdin.write('\x1b');
    await delay(20);

    // Save only from hub
    app.stdin.write('s');
    await delay(80);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]?.language).toBe('pt-BR');
    expect(app.lastFrame() ?? '').toMatch(/Saved|Saving/);

    app.unmount();
  });

  it('does not save from tools sub-screen with s', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const onApply = vi.fn();
    const app = render(
      <ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} onApply={onApply} />
    );
    await delay(50);

    await focusList(app);
    app.stdin.write('\r');
    await delay(20);
    app.stdin.write('s');
    await delay(40);

    expect(onApply).not.toHaveBeenCalled();
    app.unmount();
  });

  it('prompts before quit when dirty on hub', async () => {
    const onLoad = vi.fn(async () => draftFixture());
    const app = render(<ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} />);
    await delay(50);

    await focusList(app);
    app.stdin.write('\r');
    await delay(20);
    app.stdin.write(' ');
    await delay(15);
    app.stdin.write('\x1b');
    await delay(20);
    app.stdin.write('q');
    await delay(30);

    expect(app.lastFrame() ?? '').toContain('Unsaved changes');
    app.unmount();
  });

  it('shows scope options when project is available', async () => {
    const onLoad = vi.fn(async () =>
      draftFixture({
        projectScopeAvailable: true,
        projectRoot: dir,
        projectConfigPath: join(dir, '.draun', 'config.yaml'),
      })
    );
    const app = render(<ConfigApp cwd={dir} homeDir={home} onLoad={onLoad} />);
    await delay(50);

    await focusList(app);
    app.stdin.write('\x1b[B');
    await delay(15);
    app.stdin.write('\r');
    await delay(30);

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Apply to');
    expect(frame).toContain('This project only');
    app.unmount();
  });
});
