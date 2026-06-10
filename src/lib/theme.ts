import pc from 'picocolors';

/**
 * Gold theme for the midas CLI.
 *
 * Color strategy is "committed": gold carries the brand on every interactive
 * surface, gray recedes, and nothing else competes. Truecolor gold is used
 * when the terminal supports it, falling back to ANSI yellow; picocolors
 * already honors NO_COLOR / FORCE_COLOR / non-TTY for the base colors.
 */

const truecolor =
  pc.isColorSupported &&
  (process.env.COLORTERM === 'truecolor' ||
    process.env.COLORTERM === '24bit' ||
    process.env.WT_SESSION !== undefined ||
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.TERM_PROGRAM === 'iTerm.app');

function rgb(r: number, g: number, b: number): (text: string) => string {
  if (!pc.isColorSupported) {
    return (text) => text;
  }
  if (!truecolor) {
    return pc.yellow;
  }
  return (text) => `[38;2;${r};${g};${b}m${text}[39m`;
}

/** Primary brand gold — headings, markers, anything midas-owned. */
export const gold = rgb(230, 182, 76);
/** Bright gold — the focused/active element. At most one per screen. */
export const goldBright = truecolor ? rgb(255, 213, 107) : pc.yellowBright;
/** Deep gold — filled progress, quiet brand accents. */
export const goldDim = truecolor ? rgb(158, 122, 46) : pc.yellow;

export const dim = pc.isColorSupported ? pc.dim : (text: string) => text;
export const bold = pc.isColorSupported ? pc.bold : (text: string) => text;
export const red = pc.isColorSupported ? pc.red : (text: string) => text;
export const green = pc.isColorSupported ? pc.green : (text: string) => text;
export const yellowWarn = pc.isColorSupported ? pc.yellow : (text: string) => text;

const unicode =
  process.platform !== 'win32' ||
  process.env.WT_SESSION !== undefined ||
  process.env.TERM_PROGRAM === 'vscode' ||
  process.env.TERM !== undefined;

function u(when: string, otherwise: string): string {
  return unicode ? when : otherwise;
}

/** Structural glyphs (clack-inspired pipe layout, rendered in gold). */
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
  wip: '~',
  blockFull: u('█', '#'),
  blockHalf: u('▓', '~'),
  blockEmpty: u('░', '.'),
};

const BANNER_LINES = [
  '███╗   ███╗ ██╗ ██████╗   █████╗  ███████╗',
  '████╗ ████║ ██║ ██╔══██╗ ██╔══██╗ ██╔════╝',
  '██╔████╔██║ ██║ ██║  ██║ ███████║ ███████╗',
  '██║╚██╔╝██║ ██║ ██║  ██║ ██╔══██║ ╚════██║',
  '██║ ╚═╝ ██║ ██║ ██████╔╝ ██║  ██║ ███████║',
  '╚═╝     ╚═╝ ╚═╝ ╚═════╝  ╚═╝  ╚═╝ ╚══════╝',
];

/**
 * The MIDAS wordmark in a top-to-bottom gold gradient (bright → gold → deep,
 * like light falling on metal), with a dim tagline. Falls back to a plain
 * bold word on terminals without unicode box-drawing support.
 */
export function banner(tagline: string): string {
  if (!unicode) {
    return `${bold(gold('M I D A S'))}\n${dim(tagline)}\n`;
  }
  const shades = [goldBright, goldBright, gold, gold, goldDim, goldDim];
  const art = BANNER_LINES.map((row, i) => shades[i](row)).join('\n');
  return `${art}\n${dim(tagline)}\n`;
}

/** `┌  midas · <subtitle>` — opens every multi-section report. */
export function header(subtitle: string): string {
  return `${gold(sym.barStart)}  ${bold(gold('midas'))} ${dim(sym.dot)} ${dim(subtitle)}`;
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
 * Gold progress bar with completion percentage: `████▓▓░░░░ 33%`.
 * Done issues fill with `█` (gold), in-progress with `▓` (deep gold), the
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
