import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { StatusApp } from '../src/tui/StatusApp.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-tui-app-'));
  const specDir = join(dir, 'demo', 'issues');
  await mkdir(specDir, { recursive: true });
  await writeFile(
    join(specDir, 'INDEX.md'),
    [
      '# Issues — Demo',
      '',
      '## All issues',
      '',
      '- [x] [01 — First task](01-first.md) — blocked by: none',
      '- [ ] [02 — Second task](02-second.md) — blocked by: 01',
      '',
    ].join('\n'),
    'utf8',
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('StatusApp', () => {
  it('renders the spec and its resolved issues', async () => {
    const app = render(<StatusApp root={dir} />);
    await delay(80);
    const frame = app.lastFrame() ?? '';

    expect(frame).toContain('demo');
    expect(frame).toContain('First task');
    expect(frame).toContain('Second task');
    // The footer legend is always visible.
    expect(frame).toContain('quit');

    app.unmount();
  });

  it('responds to navigation and quit input without crashing', async () => {
    const app = render(<StatusApp root={dir} />);
    await delay(80);

    app.stdin.write('[B'); // down arrow
    app.stdin.write('[C'); // right arrow → focus issues
    await delay(20);
    expect(app.lastFrame() ?? '').toContain('Second task');

    app.stdin.write('q'); // quit
    await delay(20);
    app.unmount();
  });
});
