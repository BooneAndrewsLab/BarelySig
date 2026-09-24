/**
 * Validation fixtures written by the R oracle (scripts/oracle/generate.R):
 * `src/analyses/<id>/fixtures/<case>.json`. See CLAUDE.md, Correctness.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Plain } from '@/engine/convert';

export interface Fixture {
  /** `<analysis-id>/<case>`. */
  readonly id: string;
  /** Named columns; `null` is an empty cell. */
  readonly input: Readonly<Record<string, readonly (number | null)[]>>;
  readonly expected: Plain;
  readonly reference: {
    readonly r: string;
    readonly packages: Readonly<Record<string, string>>;
    /** Helper definitions evaluated before `call`, if any. */
    readonly setup?: string;
    readonly call: string;
  };
  /** The analysis options this case uses (item 04), as the oracle wrote them. */
  readonly options?: Readonly<Record<string, Plain>>;
  /** Relative tolerance for numbers. */
  readonly tolerance: number;
  readonly note?: string;
}

const ANALYSES = join(import.meta.dirname, '../analyses');

/** JSON has no NaN or Inf; the oracle writes them as strings. */
function decode(v: Plain): Plain {
  if (v === 'NaN') return Number.NaN;
  if (v === 'Inf') return Number.POSITIVE_INFINITY;
  if (v === '-Inf') return Number.NEGATIVE_INFINITY;
  if (Array.isArray(v)) return v.map(decode);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

/** Every fixture, or those of one analysis. */
export function loadFixtures(analysis?: string): Fixture[] {
  const ids = analysis === undefined ? readdirSync(ANALYSES) : [analysis];
  return ids.flatMap((id) => {
    const dir = join(ANALYSES, id, 'fixtures');
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    return files.sort().map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Omit<Fixture, 'id'>;
      return { ...raw, id: `${id}/${f.slice(0, -5)}`, expected: decode(raw.expected) };
    });
  });
}

/**
 * Where `actual` departs from `expected`: numbers within `tolerance`
 * relative to the expected value (absolute when it is 0), everything else
 * exactly. Relative comparison is what keeps very small p-values honest:
 * 1e-18 against 0 is a 100 % error, not a 1e-18 one. `expected`'s keys must
 * all be present; `actual` may carry more.
 */
export function mismatches(
  actual: Plain,
  expected: Plain,
  tolerance: number,
  path = '$',
): string[] {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number') return [`${path}: expected ${expected}, got ${show(actual)}`];
    if (Number.isNaN(expected) || !Number.isFinite(expected)) {
      return Object.is(actual, expected) ? [] : [`${path}: expected ${expected}, got ${actual}`];
    }
    const scale = expected === 0 ? 1 : Math.abs(expected);
    const err = Math.abs(actual - expected) / scale;
    return err <= tolerance
      ? []
      : [`${path}: expected ${expected}, got ${actual} (relative error ${err.toExponential(2)})`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [`${path}: expected ${expected.length} values, got ${show(actual)}`];
    }
    return expected.flatMap((e, i) => mismatches(actual[i] ?? null, e, tolerance, `${path}[${i}]`));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      return [`${path}: expected an object, got ${show(actual)}`];
    }
    return Object.entries(expected).flatMap(([k, e]) =>
      k in actual
        ? mismatches(actual[k] ?? null, e, tolerance, `${path}.${k}`)
        : [`${path}.${k}: missing`],
    );
  }
  return actual === expected ? [] : [`${path}: expected ${show(expected)}, got ${show(actual)}`];
}

/** JSON would print NaN and Inf as null, which is exactly what must not be confused. */
function show(v: Plain): string {
  return typeof v === 'number' ? String(v) : JSON.stringify(v);
}
