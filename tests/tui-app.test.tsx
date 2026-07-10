import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React, { act } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import {
  resolveTuiProgressBarMode,
  StatusApp,
  useAnimationClock,
} from '../src/tui/StatusApp.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let dir: string;

function demoIndex(done = false): string {
  return [
    '# Issues — Demo',
    '',
    '## All issues',
    '',
    '- [x] [01 — First task](01-first.md) — blocked by: none',
    `${done ? '- [x]' : '- [ ]'} [02 — Second task](02-second.md) — blocked by: 01`,
    '',
  ].join('\n');
}

async function writeDemoIndex(done = false): Promise<void> {
  await writeFile(join(dir, 'demo', 'issues', 'INDEX.md'), demoIndex(done), 'utf8');
}

async function waitForFrame(
  app: ReturnType<typeof render>,
  predicate: (frame: string) => boolean,
): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const frame = app.lastFrame() ?? '';
    if (predicate(frame)) {
      return frame;
    }
    await delay(25);
  }
  return app.lastFrame() ?? '';
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'draun-tui-app-'));
  const specDir = join(dir, 'demo', 'issues');
  await mkdir(specDir, { recursive: true });
  await writeDemoIndex();
  await mkdir(join(dir, 'bare-spec'), { recursive: true });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

function ClockProbe({
  enabled,
  intervalMs,
}: {
  enabled: boolean;
  intervalMs?: number;
}): React.JSX.Element {
  const frame = useAnimationClock(enabled, intervalMs);
  return <Text>{frame}</Text>;
}

describe('StatusApp', () => {
  it('renders the spec and its resolved issues', async () => {
    const app = render(<StatusApp root={dir} />);
    const frame = await waitForFrame(app, (current) => current.includes('Second task'));

    expect(frame).toContain('demo');
    expect(frame).toContain('First task');
    expect(frame).toContain('Second task');
    expect(frame.match(/50%/g)).toHaveLength(2);
    // The footer legend is always visible.
    expect(frame).toContain('quit');

    app.unmount();
  });

  it('keeps specs without breakdown on the existing badge instead of a progress bar', async () => {
    const app = render(<StatusApp root={dir} />);
    await waitForFrame(app, (current) => current.includes('Second task'));

    app.stdin.write('j');
    const frame = await waitForFrame(app, (current) =>
      current.includes("Spec 'bare-spec' has not been broken down yet."),
    );

    expect(frame).toContain('bare-spec');
    expect(frame).toContain('not broken down');
    expect(frame).not.toContain('bare-spec  0%');

    app.unmount();
  });

  it('refreshes progress bars and summaries after r input', async () => {
    await rm(join(dir, 'bare-spec'), { recursive: true, force: true });
    const app = render(<StatusApp root={dir} />);
    await waitForFrame(app, (current) => current.includes('2 issues · 1 done · 1 pending'));

    await writeDemoIndex(true);
    app.stdin.write('r');

    const frame = await waitForFrame(app, (current) =>
      current.includes('2 issues · 2 done · 0 pending'),
    );

    expect(frame.match(/100%/g)).toHaveLength(2);

    app.unmount();
  });

  it('responds to j, k, Tab, Esc, and q navigation input without crashing', async () => {
    const app = render(<StatusApp root={dir} />);
    await waitForFrame(app, (current) => current.includes('Second task'));

    app.stdin.write('j');
    let frame = await waitForFrame(app, (current) =>
      current.includes("Spec 'bare-spec' has not been broken down yet."),
    );
    expect(frame).toContain('bare-spec');

    app.stdin.write('k');
    frame = await waitForFrame(app, (current) => current.includes('2 issues · 1 done · 1 pending'));
    expect(frame).toContain('demo');

    await delay(20);
    app.stdin.write('[C');
    await delay(20);
    app.stdin.write('j');
    frame = await waitForFrame(app, (current) => current.includes('Second task'));
    expect(frame).toContain('Second task');

    app.stdin.write('\t');
    await delay(20);
    app.stdin.write('j');
    frame = await waitForFrame(app, (current) =>
      current.includes("Spec 'bare-spec' has not been broken down yet."),
    );
    expect(frame).toContain('bare-spec');

    app.stdin.write('k');
    frame = await waitForFrame(app, (current) => current.includes('2 issues · 1 done · 1 pending'));
    expect(frame).toContain('demo');

    await delay(20);
    app.stdin.write('[C');
    await delay(20);
    app.stdin.write('\x1b');
    await delay(20);
    app.stdin.write('j');
    frame = await waitForFrame(app, (current) =>
      current.includes("Spec 'bare-spec' has not been broken down yet."),
    );
    expect(frame).toContain('bare-spec');

    app.stdin.write('[B'); // down arrow
    app.stdin.write('[C'); // right arrow → focus issues
    await delay(20);
    expect(app.lastFrame() ?? '').toContain('bare-spec');

    app.stdin.write('q'); // quit
    await delay(20);
    app.unmount();
  });

  it('advances the animation clock while enabled and cleans up on unmount', async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const app = render(<ClockProbe enabled intervalMs={50} />);

    expect(app.lastFrame()).toBe('0');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    expect(app.lastFrame()).toBe('3');

    await act(async () => {
      app.unmount();
    });
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('keeps the animation clock static when disabled', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const app = render(<ClockProbe enabled={false} intervalMs={50} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    expect(app.lastFrame()).toBe('0');
    expect(setIntervalSpy).not.toHaveBeenCalled();

    app.unmount();
  });

  it('falls back to static progress bars outside animated interactive TUI mode', () => {
    expect(
      resolveTuiProgressBarMode({
        stdoutIsTTY: true,
        env: {},
        color: true,
        truecolor: true,
      }),
    ).toBe('animated-truecolor');
    expect(
      resolveTuiProgressBarMode({
        stdoutIsTTY: false,
        env: {},
        color: true,
        truecolor: true,
      }),
    ).toBe('static-truecolor');
    for (const env of [
      { DRAUN_REDUCED_MOTION: '1' },
      { NO_MOTION: '1' },
      { CI: 'true' },
      { TERM: 'dumb' },
    ]) {
      expect(
        resolveTuiProgressBarMode({
          stdoutIsTTY: true,
          env,
          color: true,
          truecolor: true,
        }),
      ).toBe('static-truecolor');
    }
  });
});
