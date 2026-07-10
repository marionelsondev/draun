import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { useSpecData } from './useSpecData.js';
import { buildIssueView } from './data.js';
import { getMessages } from '../lib/messages.js';
import { bold, colorSupported, dim, sym, truecolorSupported } from '../lib/theme.js';
import {
  renderProgressBarWithLabel,
  resolveProgressBarMode,
  type ProgressBarRenderMode,
} from '../lib/progress-bar.js';
import type { SpecStatus } from '../lib/index-parser.js';
import type { IssueState } from '../lib/issues.js';

const VIOLET = '#6e3fe7';
const VIOLET_BRIGHT = '#a182ef';

const messages = getMessages();

type Pane = 'specs' | 'issues';

type TuiProgressBarModeOptions = {
  stdoutIsTTY?: boolean;
  env?: NodeJS.ProcessEnv;
  color?: boolean;
  truecolor?: boolean;
};

export function useAnimationClock(enabled: boolean, intervalMs = 110): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % Number.MAX_SAFE_INTEGER);
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  return enabled ? frame : 0;
}

function hasReducedMotionEnv(env: NodeJS.ProcessEnv): boolean {
  return (
    env.DRAUN_REDUCED_MOTION === '1' ||
    env.NO_MOTION === '1' ||
    env.CI === 'true' ||
    env.TERM === 'dumb'
  );
}

export function resolveTuiProgressBarMode({
  stdoutIsTTY = process.stdout.isTTY,
  env = process.env,
  color = colorSupported,
  truecolor = truecolorSupported,
}: TuiProgressBarModeOptions = {}): ProgressBarRenderMode {
  const interactive = Boolean(stdoutIsTTY);
  const reducedMotion = hasReducedMotionEnv(env);
  return resolveProgressBarMode({
    color,
    truecolor,
    interactive,
    animation: interactive && !reducedMotion,
    reducedMotion,
  });
}

function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24,
  });
  useEffect(() => {
    const onResize = () => setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

/** A window of `height` items centered on `index`, plus whether more exist above/below. */
function windowed<T>(
  items: T[],
  index: number,
  height: number,
): { start: number; visible: T[]; more: { up: boolean; down: boolean } } {
  if (items.length <= height) {
    return { start: 0, visible: items, more: { up: false, down: false } };
  }
  let start = index - Math.floor(height / 2);
  start = Math.max(0, Math.min(start, items.length - height));
  return {
    start,
    visible: items.slice(start, start + height),
    more: { up: start > 0, down: start + height < items.length },
  };
}

function issueGlyph(state: IssueState): string {
  if (state === 'done') {
    return sym.check;
  }
  if (state === 'in-progress') {
    return sym.wip;
  }
  return sym.off;
}

function tuiProgressBar(
  done: number,
  inProgress: number,
  total: number,
  width: number,
  mode: ProgressBarRenderMode,
  frame: number,
): string {
  return renderProgressBarWithLabel(
    { done, inProgress, total, width },
    {
      mode,
      frame,
      symbols: {
        done: sym.blockFull,
        inProgress: sym.blockHalf,
        pending: sym.blockEmpty,
      },
      emphasizeLabel: total <= 0 ? dim : bold,
    },
  );
}

function SpecRow({
  spec,
  selected,
  progressMode,
  progressFrame,
}: {
  spec: SpecStatus;
  selected: boolean;
  progressMode: ProgressBarRenderMode;
  progressFrame: number;
}): React.JSX.Element {
  const marker = selected ? sym.arrow : ' ';
  const bar = spec.brokenDown
    ? tuiProgressBar(spec.done, spec.inProgress, spec.total, 8, progressMode, progressFrame)
    : messages.status.notBrokenDownBadge;
  return (
    <Text wrap="truncate-end">
      <Text color={selected ? VIOLET_BRIGHT : undefined} bold={selected}>
        {marker} {spec.slug}
      </Text>
      {'  '}
      {spec.brokenDown ? <Text>{bar}</Text> : <Text dimColor>{bar}</Text>}
    </Text>
  );
}

function IssueRow({
  glyph,
  color,
  cursor,
  text,
  blockers,
}: {
  glyph: string;
  color?: string;
  cursor: boolean;
  text: string;
  blockers: string;
}): React.JSX.Element {
  return (
    <Text wrap="truncate-end">
      <Text color={cursor ? VIOLET_BRIGHT : undefined} bold={cursor}>
        {cursor ? sym.arrow : ' '}{' '}
      </Text>
      <Text color={color}>{glyph}</Text> <Text dimColor={color === undefined && glyph === sym.check}>{text}</Text>
      {blockers ? <Text dimColor> {blockers}</Text> : null}
    </Text>
  );
}

export function StatusApp({
  root,
  initialSlug,
}: {
  root: string;
  initialSlug?: string;
}): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { columns, rows } = useTerminalSize();
  const { specs, error, loading, refresh } = useSpecData(root);

  const [specIndex, setSpecIndex] = useState(0);
  const [issueIndex, setIssueIndex] = useState(0);
  const [pane, setPane] = useState<Pane>('specs');
  const initialised = useRef(false);

  // Pre-select the requested spec once data has loaded.
  useEffect(() => {
    if (!initialised.current && specs.length > 0) {
      initialised.current = true;
      if (initialSlug) {
        const i = specs.findIndex((s) => s.slug === initialSlug);
        if (i >= 0) {
          setSpecIndex(i);
        }
      }
    }
  }, [specs, initialSlug]);

  const safeSpecIndex = specs.length === 0 ? 0 : Math.min(specIndex, specs.length - 1);
  const selectedSpec = specs[safeSpecIndex];
  const view = selectedSpec ? buildIssueView(selectedSpec) : undefined;
  const issues = view?.issues ?? [];
  const safeIssueIndex = issues.length === 0 ? 0 : Math.min(issueIndex, issues.length - 1);
  const progressMode = resolveTuiProgressBarMode({ stdoutIsTTY: stdout.isTTY });
  const progressFrame = useAnimationClock(progressMode === 'animated-truecolor');

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'r') {
      refresh();
      return;
    }
    if (pane === 'specs') {
      if (key.upArrow || input === 'k') {
        setSpecIndex((i) => Math.max(0, Math.min(i, specs.length - 1) - 1));
        setIssueIndex(0);
      } else if (key.downArrow || input === 'j') {
        setSpecIndex((i) => Math.min(specs.length - 1, i + 1));
        setIssueIndex(0);
      } else if (key.rightArrow || key.tab || key.return) {
        if (issues.length > 0) {
          setPane('issues');
        }
      }
    } else {
      if (key.upArrow || input === 'k') {
        setIssueIndex((i) => Math.max(0, Math.min(i, issues.length - 1) - 1));
      } else if (key.downArrow || input === 'j') {
        setIssueIndex((i) => Math.min(issues.length - 1, i + 1));
      } else if (key.leftArrow || key.escape || key.tab) {
        setPane('specs');
      }
    }
  });

  const leftWidth = Math.max(20, Math.min(42, Math.floor(columns * 0.35)));
  // Reserve rows for the outer padding (2), header (1), footer (1), and — for
  // the issue list — the spec header (2).
  const specHeight = Math.max(1, rows - 6);
  const issueHeight = Math.max(1, rows - 8);
  const detailProgressWidth = Math.max(
    14,
    Math.min(48, columns - leftWidth - (selectedSpec?.slug.length ?? 0) - 10),
  );

  const specWindow = windowed(specs, safeSpecIndex, specHeight);
  const issueWindow = windowed(issues, safeIssueIndex, issueHeight);

  return (
    <Box flexDirection="column" height={rows} width={columns} paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={VIOLET}>
          DRAUN
        </Text>
        <Text dimColor> {sym.dot} status</Text>
        <Text dimColor>
          {'  '}
          {sym.dot} {specs.length} spec{specs.length === 1 ? '' : 's'} {sym.dot} live
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="row">
        <Box
          flexDirection="column"
          width={leftWidth}
          borderStyle="single"
          borderColor="gray"
          borderTop={false}
          borderBottom={false}
          borderLeft={false}
          paddingRight={1}
        >
          {loading ? (
            <Text dimColor>Loading…</Text>
          ) : error ? (
            <Text color="red">{error}</Text>
          ) : specs.length === 0 ? (
            <Text dimColor>{messages.status.noSpecs}</Text>
          ) : (
            <>
              {specWindow.more.up ? <Text dimColor> {sym.arrow}↑ more</Text> : null}
              {specWindow.visible.map((spec) => (
                <SpecRow
                  key={spec.slug}
                  spec={spec}
                  selected={specs.indexOf(spec) === safeSpecIndex}
                  progressMode={progressMode}
                  progressFrame={progressFrame}
                />
              ))}
              {specWindow.more.down ? <Text dimColor> {sym.arrow}↓ more</Text> : null}
            </>
          )}
        </Box>

        <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
          {selectedSpec === undefined ? null : !view?.brokenDown ? (
            <Text dimColor>{messages.status.notBrokenDown(selectedSpec.slug)}</Text>
          ) : (
            <>
              <Text>
                <Text bold color={pane === 'issues' ? VIOLET_BRIGHT : VIOLET}>
                  {selectedSpec.slug}
                </Text>
                {'  '}
                <Text>
                  {tuiProgressBar(
                    view.done,
                    view.inProgress,
                    view.total,
                    detailProgressWidth,
                    progressMode,
                    progressFrame,
                  )}
                </Text>
              </Text>
              <Text dimColor>
                {messages.status.issuesSummary(view.total, view.done, view.inProgress, view.pending)}
              </Text>
              {issueWindow.more.up ? <Text dimColor> {sym.arrow}↑ more</Text> : null}
              {issueWindow.visible.map((issue) => {
                const cursor = pane === 'issues' && issues.indexOf(issue) === safeIssueIndex;
                const color =
                  issue.state === 'in-progress'
                    ? VIOLET_BRIGHT
                    : issue.state === 'done'
                      ? 'green'
                      : issue.state === 'blocked'
                        ? 'gray'
                        : undefined;
                const blockers =
                  issue.state === 'blocked' && issue.pendingBlockers.length > 0
                    ? `(${messages.status.blockedBy(issue.pendingBlockers.join(', '))})`
                    : issue.state === 'in-progress'
                      ? `(${messages.status.inProgressLabel})`
                      : '';
                return (
                  <IssueRow
                    key={issue.number}
                    glyph={issueGlyph(issue.state)}
                    color={color}
                    cursor={cursor}
                    text={`${issue.number} — ${issue.title}`}
                    blockers={blockers}
                  />
                );
              })}
              {issueWindow.more.down ? <Text dimColor> {sym.arrow}↓ more</Text> : null}
            </>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {sym.arrow} ↑/↓ navigate {sym.dot} →/Tab issues {sym.dot} ←/Esc back {sym.dot} r refresh{' '}
          {sym.dot} q quit
        </Text>
      </Box>
    </Box>
  );
}
