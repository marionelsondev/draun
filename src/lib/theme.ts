import { release } from 'node:os';
import pc from 'picocolors';

/**
 * Electric violet theme for the draun CLI.
 *
 * Color strategy is "committed": violet carries the brand on every interactive
 * surface, gray recedes, and nothing else competes. Truecolor violet is used
 * when the terminal supports it, falling back to ANSI magenta; picocolors
 * already honors NO_COLOR / FORCE_COLOR / non-TTY for the base colors.
 */

// Windows 10 build number (third segment of os.release, e.g. "10.0.26100").
// Conhost renders unicode box drawing since build 10586 and 24-bit color
// since build 14931, so plain PowerShell/cmd get the full theme too.
const winBuild =
  process.platform === 'win32' ? Number(release().split('.')[2]) || 0 : 0;

const truecolor =
  pc.isColorSupported &&
  (process.env.COLORTERM === 'truecolor' ||
    process.env.COLORTERM === '24bit' ||
    process.env.WT_SESSION !== undefined ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    winBuild >= 14931);

function rgb(r: number, g: number, b: number): (text: string) => string {
  if (!pc.isColorSupported) {
    return (text) => text;
  }
  if (!truecolor) {
    return pc.magenta;
  }
  return (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** Primary brand color — electric violet; headings, markers, anything draun-owned. */
export const gold = rgb(110, 63, 231);
/** Bright violet — the focused/active element. At most one per screen. */
export const goldBright = truecolor ? rgb(161, 130, 239) : pc.magentaBright;
/** Deep violet — filled progress, quiet brand accents. */
export const goldDim = truecolor ? rgb(75, 43, 157) : pc.magenta;

export const dim = pc.isColorSupported ? pc.dim : (text: string) => text;
export const bold = pc.isColorSupported ? pc.bold : (text: string) => text;
export const red = pc.isColorSupported ? pc.red : (text: string) => text;
export const green = pc.isColorSupported ? pc.green : (text: string) => text;
export const yellowWarn = pc.isColorSupported ? pc.yellow : (text: string) => text;

const unicode =
  process.platform !== 'win32' ||
  process.env.WT_SESSION !== undefined ||
  process.env.TERM_PROGRAM === 'vscode' ||
  process.env.TERM !== undefined ||
  winBuild >= 10586;

function u(when: string, otherwise: string): string {
  return unicode ? when : otherwise;
}

/** Structural glyphs (clack-inspired pipe layout, rendered in violet). */
export const sym = {
  barStart: u('┌', ','),
  bar: u('│', '|'),
  barEnd: u('└', "'"),
  step: u('◇', 'o'),
  active: u('◆', '*'),
  on: u('●', '(x)'),
  off: u('○', '( )'),
  check: u('✓', '+'),
  cross: u('✗', 'x'),
  dot: u('·', '-'),
  arrow: u('→', '->'),
  wip: '~',
  blockFull: u('█', '#'),
  blockHalf: u('▓', '~'),
  blockEmpty: u('░', '.'),
};

const DRAUN_LINES = [
  '██████╗  ██████╗   █████╗  ██╗   ██╗ ███╗   ██╗',
  '██╔══██╗ ██╔══██╗ ██╔══██╗ ██║   ██║ ████╗  ██║',
  '██║  ██║ ██████╔╝ ███████║ ██║   ██║ ██╔██╗ ██║',
  '██║  ██║ ██╔══██╗ ██╔══██║ ██║   ██║ ██║╚██╗██║',
  '██████╔╝ ██║  ██║ ██║  ██║ ╚██████╔╝ ██║ ╚████║',
  '╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝  ╚═════╝  ╚═╝  ╚═══╝',
];

/**
 * The DRAUN wordmark in a top-to-bottom violet gradient (bright → violet →
 * deep). Falls back to a plain bold word on terminals without unicode
 * box-drawing support.
 */
export function banner(): string {
  if (!unicode) {
    return `${bold(gold('D R A U N'))}\n`;
  }
  const shades = [goldBright, goldBright, gold, gold, goldDim, goldDim];
  const art = DRAUN_LINES.map((row, i) => shades[i % shades.length](row)).join('\n');
  return `${art}\n`;
}

/** `┌  draun · <subtitle>` — opens every multi-section report. */
export function header(subtitle: string): string {
  return `${gold(sym.barStart)}  ${bold(gold('draun'))} ${dim(sym.dot)} ${dim(subtitle)}`;
}

/** `│` continuation line (optionally with indented content). */
export function line(content = ''): string {
  return content === '' ? gold(sym.bar) : `${gold(sym.bar)}  ${content}`;
}

/** `◇  <title>` — a completed step/section marker. */
export function step(title: string): string {
  return `${gold(sym.step)}  ${title}`;
}

/** `└  <text>` — closes a report with a hint or summary. */
export function footer(text: string): string {
  return `${gold(sym.barEnd)}  ${text}`;
}

/**
 * Violet progress bar with completion percentage: `████▓▓░░░░ 33%`.
 * Done issues fill with `█` (violet), in-progress with `▓` (deep violet), the
 * remainder with `░` (dim). The percentage counts only done issues.
 */
export function progressBar(done: number, inProgress: number, total: number, width = 14): string {
  if (total <= 0) {
    return `${dim(sym.blockEmpty.repeat(width))} ${dim('0%')}`;
  }
  const filled = Math.round((done / total) * width);
  const half = Math.min(width - filled, Math.round((inProgress / total) * width));
  const empty = width - filled - half;
  const bar =
    gold(sym.blockFull.repeat(filled)) +
    goldDim(sym.blockHalf.repeat(half)) +
    dim(sym.blockEmpty.repeat(empty));
  const pct = Math.round((done / total) * 100);
  return `${bar} ${bold(`${pct}%`)}`;
}
