/**
 * Engine parity: every fixture's recorded R code, run in the app's WebR,
 * gives what desktop R gave the oracle. Catches drift between WebR and
 * desktop R (a different build, a package version out of step with
 * `lock.json`) for every analysis, before any app code is involved. Each
 * analysis's own tests then check the app's code against the same fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RObject, WebR } from 'webr';

import { fromR, type RJs } from '@/engine/convert';

import { loadFixtures, mismatches } from './fixtures';
import { startNodeWebR } from './webrNode';

const fixtures = loadFixtures();

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
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s', async (_id, f) => {
    const packages = Object.keys(f.reference.packages).filter((p) => p !== 'stats');
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
      const actual = fromR((await result.toJs()) as RJs);
      expect(mismatches(actual, f.expected, f.tolerance)).toEqual([]);
    } finally {
      await shelter.purge();
    }
  });
});
