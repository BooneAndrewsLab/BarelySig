/** Reading R's answer (after `fromR`) into typed results, shared by the analysis modules. */
import type { Plain } from '@/engine/convert';

export type PlainObject = Readonly<Record<string, Plain>>;

export function object(v: Plain, what: string): PlainObject {
  if (v === null || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`${what}: expected a list from R`);
  return v;
}

/** A number, or null for NA, NaN and ±Inf (not available; JSON has none of them). */
export function num(v: Plain | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** A number that must be there. */
export function need(v: Plain | undefined, what: string): number {
  const n = num(v);
  if (n === null) throw new Error(`${what}: expected a number from R`);
  return n;
}

/** R code for a string literal. */
export const rString = (s: string): string => JSON.stringify(s);
