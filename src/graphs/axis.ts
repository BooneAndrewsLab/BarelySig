/**
 * The value axis (notes 05, 07): its range, ticks and tick labels, linear
 * or log₁₀, automatic or as the user set them. Pure; the layout maps
 * values through `frac`.
 */
import { scaleLinear } from 'd3-scale';

export interface AxisOptions {
  readonly scale?: 'log10' | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Major tick interval (linear only). */
  readonly step?: number | undefined;
  /** Tick label decimals (linear only). */
  readonly decimals?: number | undefined;
}

export interface ValueAxis {
  readonly scale: 'linear' | 'log10';
  readonly domain: readonly [number, number];
  readonly ticks: readonly { readonly v: number; readonly text: string }[];
  /** Unlabelled ticks between the major ones (log axes). */
  readonly minor: readonly number[];
  /** Where a value sits: 0 at the bottom of the axis, 1 at the top; null if it can't be shown (≤ 0 on a log axis). */
  frac(v: number): number | null;
  readonly notes: readonly string[];
}

const MINUS = '−';
/** More ticks than this and a user's interval is ignored (a typo shouldn't hang the page). */
const MAX_TICKS = 50;

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** A power of ten as a tick label: 0.001 … 10000 written out, 10⁻⁴ and 10⁵ beyond. */
export function powerLabel(k: number): string {
  if (k >= 0 && k <= 4) return `1${'0'.repeat(k)}`;
  if (k < 0 && k >= -3) return `0.${'0'.repeat(-k - 1)}1`;
  return `10${String(k).replace(/[-0-9]/g, (c) => SUPERSCRIPT[c] ?? c)}`;
}

const minus = (s: string) => s.replace('-', MINUS);

function fixed(v: number, decimals: number): string {
  const s = v.toFixed(decimals);
  // "-0.0" is zero.
  return Number(s) === 0 ? s.replace('-', '') : minus(s);
}

/** Decimals a tick interval is written with: 0.25 → 2, 5 → 0, 1e-7 → 7. */
function stepDecimals(step: number): number {
  const [mantissa = '', exp] = String(step).split('e');
  const frac = mantissa.split('.')[1]?.length ?? 0;
  return Math.min(20, Math.max(0, frac - (exp === undefined ? 0 : Number(exp))));
}

/**
 * @param lo, hi the data's extent (already starting at zero for bars, padded for dots)
 * @param count about how many ticks fit
 */
export function valueAxis(lo: number, hi: number, opts: AxisOptions, count: number): ValueAxis {
  return opts.scale === 'log10' ? logAxis(lo, hi, opts) : linearAxis(lo, hi, opts, count);
}

function linearAxis(lo: number, hi: number, opts: AxisOptions, count: number): ValueAxis {
  const notes: string[] = [];
  const fixedRange = opts.min !== undefined || opts.max !== undefined;
  if (opts.min !== undefined) lo = opts.min;
  if (opts.max !== undefined) hi = opts.max;
  if (!(hi - lo >= 1e-300)) {
    // A range the user set upside down, or a span of nothing (a few subnormal
    // steps asks d3 for billions of ticks): keep something drawable.
    const mid = Number.isFinite(lo) ? lo : 0;
    lo = mid - 1;
    hi = mid + 1;
  }
  let step = opts.step;
  if (step !== undefined && !(step > 0 && (hi - lo) / step <= MAX_TICKS)) {
    notes.push('The tick interval would give too many ticks for this range, so it was ignored.');
    step = undefined;
  }
  let d0 = lo;
  let d1 = hi;
  let values: number[];
  let auto: (v: number) => string;
  if (step !== undefined) {
    if (!fixedRange) {
      d0 = Math.floor(lo / step + 1e-9) * step;
      d1 = Math.ceil(hi / step - 1e-9) * step;
      if (!(d1 > d0)) d1 = d0 + step;
    }
    values = [];
    const first = Math.ceil(d0 / step - 1e-9);
    for (let i = first; i * step <= d1 + step * 1e-9; i += 1) values.push(i * step);
    const decimals = stepDecimals(step);
    auto = (v) => fixed(v, decimals);
  } else {
    const scale = scaleLinear().domain([lo, hi]);
    if (!fixedRange) scale.nice(count);
    [d0, d1] = scale.domain() as [number, number];
    values = scale.ticks(count);
    const f = scale.tickFormat(count);
    auto = (v) => minus(f(v));
  }
  const text = (v: number) =>
    opts.decimals !== undefined ? fixed(v, Math.max(0, Math.min(10, opts.decimals))) : auto(v);
  const span = d1 - d0;
  return {
    scale: 'linear',
    domain: [d0, d1],
    ticks: values.map((v) => ({ v, text: text(v) })),
    minor: [],
    frac: (v) => (v - d0) / span,
    notes,
  };
}

function logAxis(lo: number, hi: number, opts: AxisOptions): ValueAxis {
  const notes: string[] = [];
  let a = lo > 0 ? Math.floor(Math.log10(lo) + 1e-9) : 0;
  let b = hi > 0 ? Math.ceil(Math.log10(hi) - 1e-9) : a + 1;
  if (opts.min !== undefined) {
    if (opts.min > 0) a = Math.log10(opts.min);
    else notes.push('A log axis can’t start at zero or below, so its minimum is automatic.');
  }
  if (opts.max !== undefined && opts.max > 0) b = Math.log10(opts.max);
  if (!(b > a)) b = a + 1;
  const first = Math.ceil(a - 1e-9);
  const last = Math.floor(b + 1e-9);
  const decades = last - first;
  const every = Math.max(1, Math.ceil(decades / 10));
  const ticks: { v: number; text: string }[] = [];
  const minor: number[] = [];
  for (let k = first; k <= last; k += 1) {
    if ((k - first) % every === 0) ticks.push({ v: 10 ** k, text: powerLabel(k) });
    if (decades <= 6 && every === 1)
      for (let m = 2; m <= 9; m += 1) {
        const e = k + Math.log10(m);
        if (e > a - 1e-9 && e < b + 1e-9) minor.push(m * 10 ** k);
      }
  }
  // Minor ticks below the first power shown, down to the axis's start.
  if (decades <= 6 && every === 1)
    for (let m = 2; m <= 9; m += 1) {
      const e = first - 1 + Math.log10(m);
      if (e > a - 1e-9) minor.push(m * 10 ** (first - 1));
    }
  minor.sort((x, y) => x - y);
  return {
    scale: 'log10',
    domain: [10 ** a, 10 ** b],
    ticks,
    minor,
    frac: (v) => (v > 0 ? (Math.log10(v) - a) / (b - a) : null),
    notes,
  };
}
