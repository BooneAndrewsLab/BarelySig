/**
 * Whether a reopened figure's numbers changed under a newer engine (#46,
 * note 07). A figure recipe keeps the results it was drawn from; when an
 * app with a different engine reopens it, they are recomputed, and these
 * pure functions compare the new values with the old, number by number,
 * to the fixtures' tolerance.
 */
import type { EngineInfo } from '@/model/inputs';
import type { Json } from '@/model/json';

export interface NumberChange {
  /** What the number is, in words: "WT: mean", "P". */
  readonly what: string;
  readonly old: number | null;
  readonly now: number | null;
}

/** Relative tolerance, absolute at 0: the validation fixtures' (CLAUDE.md, Correctness). */
export const TOLERANCE = 1e-6;

const WORDS: Readonly<Record<string, string>> = {
  p: 'P',
  pUnadjusted: 'unadjusted P',
  h: 'H',
  t: 't',
  f: 'F',
  u: 'U',
  w: 'W',
  z: 'z',
  q: 'q',
  df: 'DF',
  mean: 'mean',
  median: 'median',
  sd: 'SD',
  sem: 'SEM',
  ciLower: 'lower 95% CI',
  ciUpper: 'upper 95% CI',
  diff: 'difference',
  ss: 'SS',
  ms: 'MS',
  r: 'r',
  bw: 'bandwidth',
  kde: 'violin',
  density: 'density',
  whiskers: 'box',
  q1: '25th percentile',
  q3: '75th percentile',
  low: 'lower whisker',
  high: 'upper whisker',
};

const isObject = (v: Json | undefined): v is Readonly<Record<string, Json>> =>
  v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);

/** How an element of a list is named: its title, "A vs. B", or its position. */
function itemName(v: Json | undefined, i: number): string {
  if (isObject(v)) {
    if (typeof v['title'] === 'string') return v['title'];
    const a = v['a'];
    const b = v['b'];
    if (
      isObject(a) &&
      isObject(b) &&
      typeof a['title'] === 'string' &&
      typeof b['title'] === 'string'
    )
      return `${a['title']} vs. ${b['title']}`;
  }
  return `#${String(i + 1)}`;
}

function differs(a: number, b: number, tolerance: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return !(Number.isNaN(a) && Number.isNaN(b));
  const scale = a === 0 ? 1 : Math.abs(a);
  return Math.abs(a - b) / scale > tolerance;
}

/**
 * Every number that changed between two results of the same analysis,
 * with a name for it. Text (warnings, titles) is not compared; a number
 * that appeared or went away counts as changed.
 */
export function changedNumbers(old: Json, now: Json, tolerance = TOLERANCE): NumberChange[] {
  const out: NumberChange[] = [];
  const walk = (a: Json | undefined, b: Json | undefined, path: readonly string[]) => {
    const what = path.join(': ') || 'value';
    const na = typeof a === 'number' ? a : null;
    const nb = typeof b === 'number' ? b : null;
    if (na !== null || nb !== null) {
      if (na === null || nb === null || differs(na, nb, tolerance))
        out.push({ what, old: na, now: nb });
      return;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      const xs: readonly Json[] = Array.isArray(a) ? (a as readonly Json[]) : [];
      const ys: readonly Json[] = Array.isArray(b) ? (b as readonly Json[]) : [];
      // Long numeric vectors (a violin's density) are one value to a reader.
      const numeric = [...xs, ...ys].every((x) => typeof x === 'number');
      if (numeric && Math.max(xs.length, ys.length) > 8) {
        const changed =
          xs.length !== ys.length ||
          xs.some((x, i) => differs(x as number, ys[i] as number, tolerance));
        if (changed) out.push({ what, old: null, now: null });
        return;
      }
      for (let i = 0; i < Math.max(xs.length, ys.length); i += 1)
        walk(xs[i], ys[i], [...path, itemName(ys[i] ?? xs[i], i)]);
      return;
    }
    if (isObject(a) || isObject(b)) {
      const ao = isObject(a) ? a : {};
      const bo = isObject(b) ? b : {};
      for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
        const word = WORDS[k];
        walk(ao[k], bo[k], word === undefined ? path : [...path, word]);
      }
    }
  };
  walk(old, now, []);
  return out;
}

const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x: unknown) =>
    x !== null && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );

/** Whether results from `a` would be recomputed by `b`. */
export const engineDiffers = (a: EngineInfo, b: EngineInfo): boolean => stable(a) !== stable(b);

/** "WebR 0.6.0, R 4.6.0". */
export const engineName = (e: EngineInfo): string => `WebR ${e.webr}, R ${e.r}`;

/** A number as the notice shows it: enough digits to see a small change. */
export function shown(v: number | null): string {
  if (v === null) return 'none';
  if (Number.isNaN(v)) return 'not defined';
  return Math.abs(v) >= 1e-4 && Math.abs(v) < 1e7
    ? String(Number(v.toPrecision(7)))
    : v.toExponential(6);
}
