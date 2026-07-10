export type ProgressBarRenderMode =
  | 'animated-truecolor'
  | 'static-truecolor'
  | 'static-ansi'
  | 'plain';

export type ProgressBarSegmentKind = 'done' | 'in-progress' | 'pending';

export type ProgressBarSegment = {
  kind: ProgressBarSegmentKind;
  width: number;
};

export type ProgressBarModel = {
  width: number;
  total: number;
  done: number;
  inProgress: number;
  percent: number;
  segments: ProgressBarSegment[];
};

export type ProgressBarInput = {
  done: number;
  inProgress: number;
  total: number;
  width?: number;
};

export type ProgressBarSymbols = {
  done: string;
  inProgress: string;
  pending: string;
};

export type ProgressBarCapabilities = {
  color: boolean;
  truecolor: boolean;
  interactive: boolean;
  animation: boolean;
  reducedMotion?: boolean;
};

export type ProgressBarRenderOptions = {
  mode?: ProgressBarRenderMode;
  frame?: number;
  symbols?: ProgressBarSymbols;
  label?: boolean;
  emphasizeLabel?: (text: string) => string;
};

const DEFAULT_WIDTH = 14;
const DEFAULT_SYMBOLS: ProgressBarSymbols = {
  done: '█',
  inProgress: '▓',
  pending: '░',
};

const STATIC_DONE_GRADIENT = [
  [91, 33, 182],
  [124, 58, 237],
  [147, 92, 246],
  [180, 151, 255],
  [139, 92, 246],
] as const;

const ANIMATED_DONE_GRADIENT = [
  [43, 18, 91],
  [67, 22, 132],
  [91, 33, 182],
  [126, 34, 206],
  [147, 51, 234],
  [168, 85, 247],
  [187, 115, 255],
  [154, 73, 244],
  [111, 42, 205],
  [61, 22, 124],
  [101, 38, 190],
  [176, 92, 255],
] as const;

const DONE_PLASMA_DARK = [39, 16, 85] as const;
const DONE_PLASMA_MID = [109, 40, 217] as const;
const DONE_PLASMA_BRIGHT = [184, 96, 255] as const;
const DONE_HIGHLIGHT = [198, 128, 255] as const;
const IN_PROGRESS_DARK = [95, 28, 126] as const;
const IN_PROGRESS_MID = [190, 48, 220] as const;
const IN_PROGRESS_BRIGHT = [238, 116, 255] as const;
const IN_PROGRESS_HIGHLIGHT = [238, 132, 255] as const;

const IN_PROGRESS_GRADIENT = [
  [75, 43, 157],
] as const;

const PENDING_TRUECOLOR = [107, 114, 128] as const;
const SMALL_SEGMENT_MAX_WIDTH = 2;

const REPRESENTATIVE_COLORS = {
  done: [147, 51, 234],
  'in-progress': [75, 43, 157],
  pending: PENDING_TRUECOLOR,
} as const satisfies Record<ProgressBarSegmentKind, readonly [number, number, number]>;

const ANSI_SEGMENT_COLORS = {
  done: 35,
  'in-progress': 35,
  pending: 90,
} as const satisfies Record<ProgressBarSegmentKind, number>;

const TRUECOLOR_SEGMENT_GRADIENTS = {
  done: {
    static: STATIC_DONE_GRADIENT,
    animated: ANIMATED_DONE_GRADIENT,
  },
  'in-progress': {
    static: IN_PROGRESS_GRADIENT,
    animated: IN_PROGRESS_GRADIENT,
  },
} as const;

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizedCount(value: number): number {
  return Math.max(0, finiteNumber(value));
}

function normalizedWidth(width: number | undefined): number {
  return Math.max(0, Math.floor(finiteNumber(width ?? DEFAULT_WIDTH)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function visibleLength(symbol: string): string {
  return symbol.length > 0 ? symbol : ' ';
}

function ansi(code: number): (text: string) => string {
  return (text) => `\x1b[${code}m${text}\x1b[39m`;
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

function truecolor(r: number, g: number, b: number): (text: string) => string {
  return (text) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function truecolorTuple(color: readonly [number, number, number]): (text: string) => string {
  return truecolor(color[0], color[1], color[2]);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function mixColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number,
): readonly [number, number, number] {
  const clamped = clamp(amount, 0, 1);
  return [
    Math.round(lerp(from[0], to[0], clamped)),
    Math.round(lerp(from[1], to[1], clamped)),
    Math.round(lerp(from[2], to[2], clamped)),
  ];
}

function sampleGradient(
  gradient: readonly (readonly [number, number, number])[],
  position: number,
): readonly [number, number, number] {
  if (gradient.length === 0) {
    return [255, 255, 255];
  }
  if (gradient.length === 1) {
    return gradient[0];
  }

  const scaled = clamp(position, 0, 1) * (gradient.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(gradient.length - 1, left + 1);
  return mixColor(gradient[left], gradient[right], scaled - left);
}

function circularDistance(a: number, b: number): number {
  const distance = Math.abs(a - b);
  return Math.min(distance, 1 - distance);
}

function animatedColor(
  kind: 'done' | 'in-progress',
  position: number,
  frame: number | undefined,
): readonly [number, number, number] {
  const phase = finiteNumber(frame) * 0.045;
  const primary = (Math.sin((position * 1.65 - phase * 1.7) * Math.PI * 2) + 1) / 2;
  const secondary = (Math.sin((position * 3.1 + phase * 0.82 + 0.28) * Math.PI * 2) + 1) / 2;
  const energy = clamp(primary * 0.86 + secondary * 0.14, 0, 1);
  const dark = kind === 'done' ? DONE_PLASMA_DARK : IN_PROGRESS_DARK;
  const mid = kind === 'done' ? DONE_PLASMA_MID : IN_PROGRESS_MID;
  const bright = kind === 'done' ? DONE_PLASMA_BRIGHT : IN_PROGRESS_BRIGHT;
  const highlight = kind === 'done' ? DONE_HIGHLIGHT : IN_PROGRESS_HIGHLIGHT;
  const base =
    energy < 0.52
      ? mixColor(dark, mid, energy / 0.52)
      : mixColor(mid, bright, (energy - 0.52) / 0.48);

  const sweepCenter = ((phase * 0.72) % 1 + 1) % 1;
  const sweepDistance = circularDistance(position, sweepCenter);
  const sweep = Math.exp(-(sweepDistance * sweepDistance) / 0.085);
  const intensity = kind === 'done' ? sweep * 0.09 : sweep * 0.06;

  return mixColor(base, highlight, intensity);
}

function renderRepeatedColor(
  color: readonly [number, number, number],
  symbol: string,
  width: number,
): string {
  return truecolorTuple(color)(symbol.repeat(width));
}

function renderSmoothGradientSegment(
  kind: 'done' | 'in-progress',
  symbol: string,
  width: number,
  mode: ProgressBarRenderMode,
  frame: number | undefined,
): string {
  const gradientSet = TRUECOLOR_SEGMENT_GRADIENTS[kind];
  const gradient =
    mode === 'animated-truecolor' && kind === 'done' ? gradientSet.animated : gradientSet.static;

  return Array.from({ length: width }, (_, i) => {
    const position = width <= 1 ? 0.5 : i / (width - 1);
    const color =
      mode === 'animated-truecolor' && kind === 'done'
        ? animatedColor(kind, position, frame)
        : sampleGradient(gradient, position);
    return truecolorTuple(color)(symbol);
  }).join('');
}

export function resolveProgressBarMode(capabilities: ProgressBarCapabilities): ProgressBarRenderMode {
  if (!capabilities.color) {
    return 'plain';
  }
  if (!capabilities.truecolor) {
    return 'static-ansi';
  }
  if (capabilities.interactive && capabilities.animation && !capabilities.reducedMotion) {
    return 'animated-truecolor';
  }
  return 'static-truecolor';
}

export function calculateProgressBar(input: ProgressBarInput): ProgressBarModel {
  const width = normalizedWidth(input.width);
  const total = normalizedCount(input.total);
  const done = total === 0 ? 0 : clamp(normalizedCount(input.done), 0, total);
  const inProgress =
    total === 0 ? 0 : clamp(normalizedCount(input.inProgress), 0, Math.max(0, total - done));
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  if (width === 0) {
    return {
      width,
      total,
      done,
      inProgress,
      percent,
      segments: [
        { kind: 'done', width: 0 },
        { kind: 'in-progress', width: 0 },
        { kind: 'pending', width: 0 },
      ],
    };
  }

  if (total === 0) {
    return {
      width,
      total,
      done,
      inProgress,
      percent,
      segments: [
        { kind: 'done', width: 0 },
        { kind: 'in-progress', width: 0 },
        { kind: 'pending', width },
      ],
    };
  }

  const doneWidth = clamp(Math.round((done / total) * width), 0, width);
  const inProgressWidth = clamp(
    Math.round((inProgress / total) * width),
    0,
    width - doneWidth,
  );
  const pendingWidth = width - doneWidth - inProgressWidth;

  return {
    width,
    total,
    done,
    inProgress,
    percent,
    segments: [
      { kind: 'done', width: doneWidth },
      { kind: 'in-progress', width: inProgressWidth },
      { kind: 'pending', width: pendingWidth },
    ],
  };
}

function renderSegment(
  segment: ProgressBarSegment,
  symbols: ProgressBarSymbols,
  mode: ProgressBarRenderMode,
  frame: number | undefined,
): string {
  const symbol =
    segment.kind === 'done'
      ? visibleLength(symbols.done)
      : segment.kind === 'in-progress'
        ? visibleLength(symbols.inProgress)
        : visibleLength(symbols.pending);

  if (segment.width <= 0) {
    return '';
  }

  if (mode === 'plain') {
    return symbol.repeat(segment.width);
  }

  if (mode === 'static-ansi') {
    const colored = ansi(ANSI_SEGMENT_COLORS[segment.kind])(symbol.repeat(segment.width));
    return segment.kind === 'pending' ? dim(colored) : colored;
  }

  if (segment.kind === 'pending') {
    return renderRepeatedColor(PENDING_TRUECOLOR, symbol, segment.width);
  }

  if (segment.width <= SMALL_SEGMENT_MAX_WIDTH) {
    return renderRepeatedColor(REPRESENTATIVE_COLORS[segment.kind], symbol, segment.width);
  }

  return renderSmoothGradientSegment(segment.kind, symbol, segment.width, mode, frame);
}

export function renderProgressBar(input: ProgressBarInput, options: ProgressBarRenderOptions = {}): string {
  const model = calculateProgressBar(input);
  const mode = options.mode ?? 'plain';
  const symbols = options.symbols ?? DEFAULT_SYMBOLS;
  return model.segments
    .map((segment) => renderSegment(segment, symbols, mode, options.frame))
    .join('');
}

export function renderProgressBarWithLabel(
  input: ProgressBarInput,
  options: ProgressBarRenderOptions = {},
): string {
  const model = calculateProgressBar(input);
  const label = `${model.percent}%`;
  const renderedLabel = options.emphasizeLabel ? options.emphasizeLabel(label) : label;
  const bar = renderProgressBar(input, options);
  return options.label === false ? bar : `${bar} ${renderedLabel}`;
}
