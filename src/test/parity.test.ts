/**
 * Engine parity: every fixture's recorded R code, run in the app's WebR,
 * gives what desktop R gave the oracle. Catches drift between WebR and
 * desktop R (a different build, a package version out of step with
 * `lock.json`) for every analysis, before any app code is involved. Each
 * analysis's own tests then check the app's code against the same fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RObject, WebR } from 'webr';

import { type Plain, fromR, type RJs } from '@/engine/convert';
import { ENGINE } from '@/engine/engineInfo';

import { type Fixture, loadFixtures, mismatches } from './fixtures';
import { startNodeWebR } from './webrNode';

const fixtures = loadFixtures();

/**
 * A fixture whose reference call needs a package WebR doesn't ship (an
 * oracle-only reference such as coin) can't run here; its analysis's own
 * test still checks the app against it (item 06).
 */
const referencePackages = (f: Fixture) =>
  Object.keys(f.reference.packages).filter((p) => p !== 'stats');
const inWebR = (f: Fixture) => referencePackages(f).every((p) => p in ENGINE.packages);
const runnable = fixtures.filter(inWebR);

/**
 * WebR's conversion unboxes every vector of one element; jsonlite keeps
 * one the oracle marked `I()` (a list that happens to hold one value) as
 * a list. Where the fixture has a list, a lone number becomes a list of it.
 */
function asListed(actual: Plain, expected: Plain): Plain {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return actual === null ? actual : [actual];
    return actual.map((x, i) => asListed(x, expected[i] ?? null));
  }
  if (
    expected !== null &&
    typeof expected === 'object' &&
    actual !== null &&
    typeof actual === 'object' &&
    !Array.isArray(actual)
  )
    return Object.fromEntries(
      Object.entries(actual).map(([k, v]) => [k, asListed(v, expected[k] ?? null)]),
    );
  return actual;
}

describe('engine parity with desktop R', () => {
  let webR: WebR;
  beforeAll(async () => {
    webR = await startNodeWebR();
  }, 60_000);
  afterAll(() => {
    webR.close();
  });

  it('has fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('runs the R version the oracle ran', async () => {
    const version = await webR.evalRString('R.version.string');
    const oracle = new Set(fixtures.map((f) => f.reference.r));
    expect([...oracle]).toEqual([version]);
    expect(version).toContain(`R version ${ENGINE.r} `);
  });

  it('runs most fixtures (the rest use reference-only packages)', () => {
    expect(runnable.length).toBeGreaterThan(fixtures.length / 2);
  });

  it.each(runnable.map((f) => [f.id, f] as const))(
    '%s',
    async (_id, f) => {
      const packages = referencePackages(f);
      if (packages.length > 0) await webR.installPackages(packages, { quiet: true });
      const shelter = await new webR.Shelter();
      try {
        const inputs: Record<string, RObject> = Object.fromEntries(
          await Promise.all(
            Object.entries(f.input).map(async ([k, v]): Promise<[string, RObject]> => [
              k,
              await new shelter.RDouble([...v]),
            ]),
          ),
        );
        const env = await new shelter.REnvironment(inputs);
        for (const p of packages) await shelter.evalR(`library(${p})`, { env });
        if (f.reference.setup !== undefined) await shelter.evalR(f.reference.setup, { env });
        const result = await shelter.evalR(f.reference.call, { env });
        const actual = asListed(fromR((await result.toJs()) as RJs), f.expected);
        expect(mismatches(actual, f.expected, f.tolerance)).toEqual([]);
      } finally {
        await shelter.purge();
      }
    },
    60_000,
  );
});
