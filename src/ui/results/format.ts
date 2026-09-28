/**
 * How results are written (item 04, "Results sheets"): P values as Prism
 * shows them, asterisks by Prism's thresholds with the scheme stated, and
 * other numbers to four significant digits.
 */

/** Prism's default asterisks (CLAUDE.md): ns >= 0.05, * < 0.05, ** < 0.01, *** < 0.001, **** < 0.0001. */
export const STAR_SCHEME = 'ns P ≥ 0.05, * P < 0.05, ** P < 0.01, *** P < 0.001, **** P < 0.0001';

/** The APA style: three levels. */
export const APA_SCHEME = 'ns P ≥ 0.05, * P < 0.05, ** P < 0.01, *** P < 0.001';

export type StarScheme = 'prism' | 'apa';

export const schemeText = (s: StarScheme): string => (s === 'apa' ? APA_SCHEME : STAR_SCHEME);

export function stars(p: number, scheme: StarScheme = 'prism'): string {
  if (p < 0.0001 && scheme === 'prism') return '****';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
}

/** A P value as Prism shows it: four decimals, "< 0.0001" below that, never 0, and "> 0.9999" for 1. */
export function pValue(p: number): string {
  if (!(p >= 0)) return '—';
  if (p < 0.0001) return '< 0.0001';
  if (p >= 0.99995) return '> 0.9999';
  const s = p.toFixed(4);
  // Rounding must not carry a P across a threshold it is below: 0.04996
  // would show as "0.0500" next to a "*". Such a P is cut instead ("0.0499").
  const shown = Number(s);
  if (THRESHOLDS.some((t) => p < t && shown >= t))
    return (Math.floor(p * 10000) / 10000).toFixed(4);
  return s;
}

const THRESHOLDS = [0.05, 0.01, 0.001];

/** "P = 0.0021" or "P < 0.0001", for sentences. */
export function pPhrase(p: number): string {
  const v = pValue(p);
  return v.startsWith('<') || v.startsWith('>') ? `P ${v}` : `P = ${v}`;
}

/** A number to four significant digits, as Prism's results; "—" when not available. */
export function sig(x: number | null, digits = 4): string {
  if (x === null || !Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  // toPrecision only accepts 1-100: a count (n) asks for 0 decimals, not
  // 0 significant digits, so round it as a plain integer instead.
  if (digits <= 0) return String(Math.round(x));
  const abs = Math.abs(x);
  if (abs >= 1e6 || abs < 1e-4) return x.toExponential(digits - 1).replace('e+', 'e');
  return String(Number(x.toPrecision(digits)));
}

/** Degrees of freedom: whole when whole (Student), otherwise four significant digits (Welch). */
export const dfText = (df: number): string => (Number.isInteger(df) ? String(df) : sig(df));

/** "95% CI 1.2 to 3.4" */
export const interval = (lo: number | null, hi: number | null): string =>
  `${sig(lo)} to ${sig(hi)}`;

/** How often, in words, with its noun: "about 23% of experiments", "fewer than 1 in 10,000 experiments". */
export function howOften(p: number): string {
  if (p < 0.0001) return 'fewer than 1 in 10,000 experiments';
  const pct = p * 100;
  if (pct < 0.1) return `about ${String(Math.round(p * 10000))} in 10,000 experiments`;
  if (pct < 1) return `about ${sig(pct, 1)}% of experiments`;
  return `about ${String(Math.round(pct))}% of experiments`;
}

/** A confidence level as a percentage, as Prism labels rank-test intervals: "96.83%". */
export const levelText = (level: number): string => `${(level * 100).toFixed(2)}%`;
