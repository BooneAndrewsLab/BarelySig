/**
 * Normality of a Nested table's replicate means (item 26, #77): the same
 * D'Agostino-Pearson and Shapiro-Wilk tests as `normality`
 * (`src/analyses/normality`), run once per group on its replicate means
 * (`nestedReplicateMeans`, note 26) rather than on the individual values
 * -- what the matched nested t test, matched nested one-way ANOVA and
 * nested-descriptive's group summary actually assume.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { nestedGroups, nestedReplicateMeans } from '@/model/selectors';

import { normality } from '../normality';
import type { TestOutcome } from '../normality/types';
import type { AnalysisModule, Prepared } from '../module';
import { need, num, object, type PlainObject } from '../values';
import code from './analysis.R?raw';
import type { NestedNormalityRequest, NestedNormalityResult } from './types';

const fullCode = `${normality.code}\n${code}`;

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

function outcome<T>(o: PlainObject, ran: (o: PlainObject) => T): TestOutcome<T> {
  const why = o['why'];
  if (why === 'few' || why === 'many' || why === 'same') {
    return { ran: false, why, limit: num(o['minimum']) ?? num(o['maximum']) };
  }
  return { ran: true, ...ran(o) };
}

export const nestedNormality: AnalysisModule<
  'nested-normality',
  NestedNormalityRequest,
  NestedNormalityResult
> = {
  kind: 'nested-normality',
  version: 1,
  code: fullCode,

  prepare(analysis, project): Prepared<NestedNormalityRequest> {
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'A normality check looks at the groups of a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this analysis reads no longer exists.' };
    if (table.type !== 'nested') {
      return {
        ok: false,
        reason: 'This normality check looks at the replicate means of a Nested table.',
      };
    }
    if (analysis.input.dataSets.length === 0)
      return { ok: false, reason: 'Choose a group to test.' };

    const raw = nestedGroups(table, analysis.input.dataSets);
    const groups = raw.map((g) => {
      const means = nestedReplicateMeans(g);
      return {
        id: g.id,
        title: g.title,
        replicateMeans: means.values,
        droppedReplicates: means.dropped.empty,
      };
    });
    if (!groups.some((g) => g.replicateMeans.length > 0))
      return { ok: false, reason: 'There are no replicate means to test yet.' };
    return { ok: true, request: { groups } };
  },

  job(request): EngineJob {
    return {
      code: `${fullCode}\nbs_nested_normality(y, g, k)`,
      inputs: {
        y: request.groups.flatMap((g) => g.replicateMeans),
        g: request.groups.flatMap((g, i) => g.replicateMeans.map(() => i + 1)),
        k: request.groups.length,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): NestedNormalityResult {
    const r = object(value, 'nested normality');
    return {
      groups: list(r['groups']).map((v, i) => {
        const g = object(v, 'group');
        const named = request.groups[i];
        if (!named) throw new Error('nested-normality: more groups than asked for');
        return {
          id: named.id,
          title: named.title,
          n: need(g['n'], 'n'),
          droppedReplicates: named.droppedReplicates,
          shapiroWilk: outcome(object(g['shapiro_wilk'] ?? null, 'Shapiro-Wilk'), (o) => ({
            w: need(o['w'], 'W'),
            p: need(o['p'], 'P'),
          })),
          dagostino: outcome(object(g['dagostino'] ?? null, "D'Agostino"), (o) => ({
            k2: need(o['k2'], 'K2'),
            p: need(o['p'], 'P'),
            zSkewness: need(o['z_skewness'], 'skewness'),
            zKurtosis: need(o['z_kurtosis'], 'kurtosis'),
          })),
        };
      }),
      warnings: [...warnings],
    };
  },
};
