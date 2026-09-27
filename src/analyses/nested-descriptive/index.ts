/**
 * Descriptive statistics of a Nested table (item 25, #75): a Nested
 * table's own version of `descriptive`, at the replicate level and the
 * group level (from the replicate means — reusing `nestedReplicateMeans`,
 * note 07's graph statistic, so the results table and a SuperPlot's error
 * bar can never disagree on what a "replicate mean" is), plus a pooled,
 * for-reference-only summary over every individual value.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { nestedGroups, nestedReplicateMeans } from '@/model/selectors';

import { descriptive } from '../descriptive';
import type { AnalysisModule, Prepared } from '../module';
import code from './analysis.R?raw';
import { need, num, object } from '../values';
import type {
  DescribedReplicate,
  NestedDescribedGroup,
  NestedDescriptiveGroupRequest,
  NestedDescriptiveRequest,
  NestedDescriptiveResult,
} from './types';

const fullCode = `${descriptive.code}\n${code}`;

const list = (v: Plain | undefined): readonly Plain[] => (Array.isArray(v) ? v : []);

export const nestedDescriptive: AnalysisModule<
  'nested-descriptive',
  NestedDescriptiveRequest,
  NestedDescriptiveResult
> = {
  kind: 'nested-descriptive',
  version: 1,
  code: fullCode,

  prepare(analysis, project): Prepared<NestedDescriptiveRequest> {
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Descriptive statistics describe a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this analysis describes no longer exists.' };
    if (table.type !== 'nested') {
      return {
        ok: false,
        reason: 'This descriptive statistics analysis describes a Nested table.',
      };
    }
    if (analysis.input.dataSets.length === 0)
      return { ok: false, reason: 'Choose at least one group to describe.' };

    const raw = nestedGroups(table, analysis.input.dataSets);
    const groups: NestedDescriptiveGroupRequest[] = raw.map((g) => {
      const kept: { readonly values: readonly number[]; readonly title: string }[] = [];
      g.replicates.forEach((r, s) => {
        if (r.values.length === 0) return;
        kept.push({
          values: r.values,
          title: table.replicateTitles?.[s] ?? `Replicate ${String(s + 1)}`,
        });
      });
      return {
        id: g.id,
        title: g.title,
        replicates: kept.map((k) => k.values),
        replicateTitles: kept.map((k) => k.title),
        replicateMeans: nestedReplicateMeans(g).values,
        droppedReplicates: g.replicates.length - kept.length,
      };
    });
    if (!groups.some((g) => g.replicates.length > 0))
      return { ok: false, reason: 'There are no values to describe yet.' };
    return { ok: true, request: { groups } };
  },

  job(request): EngineJob {
    const groupIdx = request.groups.flatMap((g, i) =>
      g.replicates.flatMap((r) => r.map(() => i + 1)),
    );
    const replicateIdx = request.groups.flatMap((g) =>
      g.replicates.flatMap((r, s) => r.map(() => s + 1)),
    );
    const meanGroupIdx = request.groups.flatMap((g, i) => g.replicateMeans.map(() => i + 1));
    return {
      code: `${fullCode}\nbs_nested_descriptive(value, group_idx, replicate_idx, mean_value, mean_group_idx, k)`,
      inputs: {
        value: request.groups.flatMap((g) => g.replicates.flat()),
        group_idx: groupIdx,
        replicate_idx: replicateIdx,
        mean_value: request.groups.flatMap((g) => g.replicateMeans),
        mean_group_idx: meanGroupIdx,
        k: request.groups.length,
      },
      packages: [],
    };
  },

  parse(value: Plain, request, warnings): NestedDescriptiveResult {
    const r = object(value, 'nested descriptive statistics');
    const groupsOut = list(r['groups']);
    const groups: NestedDescribedGroup[] = request.groups.map((g, i) => {
      const go = object(groupsOut[i] ?? null, 'group');
      const repsOut = list(go['replicates']);
      const replicates: DescribedReplicate[] = repsOut.map((ro, j): DescribedReplicate => {
        const rr = object(ro, 'replicate');
        return {
          title: g.replicateTitles[j] ?? `Replicate ${String(j + 1)}`,
          n: need(rr['n'], 'n'),
          mean: num(rr['mean']),
          sd: num(rr['sd']),
          sem: num(rr['sem']),
        };
      });
      const gg = object(go['group'] ?? null, 'group summary');
      const pp = object(go['pooled'] ?? null, 'pooled summary');
      return {
        id: g.id,
        title: g.title,
        droppedReplicates: g.droppedReplicates,
        replicates,
        group: {
          n: need(gg['n'], 'replicates'),
          mean: num(gg['mean']),
          sd: num(gg['sd']),
          sem: num(gg['sem']),
          ciLower: num(gg['ci_lower']),
          ciUpper: num(gg['ci_upper']),
        },
        pooled: {
          n: need(pp['n'], 'values'),
          mean: num(pp['mean']),
          sd: num(pp['sd']),
        },
      };
    });
    return { groups, warnings: [...warnings] };
  },
};
