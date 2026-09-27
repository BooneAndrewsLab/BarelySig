/**
 * Descriptive statistics (item 04, #16): Prism's column statistics for
 * each selected group of a Column table, from its values or from summary
 * data. Item 18 (#54) extends the same statistics to a Grouped table:
 * one set per row × data-set cell, plus (from raw replicates only) one
 * per data set pooled over every row.
 */
import type { EngineInput, EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import { columnGroups, groupedCells, type GroupData, type RawGroupData } from '@/model/selectors';

import type { AnalysisModule } from '../module';
import { num, object, type PlainObject } from '../values';
import code from './analysis.R?raw';
import type {
  DescribedGroup,
  DescriptiveGroupedRequest,
  DescriptiveRequest,
  DescriptiveResult,
} from './types';

const NONE = {
  min: null,
  q1: null,
  median: null,
  q3: null,
  max: null,
  range: null,
  geomean: null,
  sum: null,
};

const hasData = (g: GroupData): boolean =>
  g.kind === 'raw' ? g.values.length > 0 : g.mean !== null;

/** One data set's raw values pooled over every row of a Grouped table. */
function poolColumn(cells: readonly (readonly GroupData[])[], c: number): RawGroupData {
  const values: number[] = [];
  let empty = 0;
  let excluded = 0;
  for (const row of cells) {
    const d = row[c];
    if (d?.kind === 'raw') {
      values.push(...d.values);
      empty += d.dropped.empty;
      excluded += d.dropped.excluded;
    }
  }
  return { kind: 'raw', values, dropped: { empty, excluded } };
}

function describeGroup(id: string, title: string, data: GroupData, r: PlainObject): DescribedGroup {
  const common = {
    id,
    title,
    n: num(r['n']),
    mean: num(r['mean']),
    sd: num(r['sd']),
    sem: num(r['sem']),
    ciLower: num(r['ci_lower']),
    ciUpper: num(r['ci_upper']),
    cv: num(r['cv']),
  };
  if (data.kind === 'summary') return { ...common, ...NONE, from: 'summary', dropped: null };
  return {
    ...common,
    from: 'values',
    dropped: data.dropped,
    min: num(r['min']),
    q1: num(r['q1']),
    median: num(r['median']),
    q3: num(r['q3']),
    max: num(r['max']),
    range: num(r['range']),
    geomean: num(r['geomean']),
    sum: num(r['sum']),
  };
}

function call(key: string, data: GroupData, inputs: Record<string, EngineInput>): string {
  if (data.kind === 'raw') {
    inputs[key] = data.values;
    return `${key} = bs_describe(${key})`;
  }
  inputs[`${key}_mean`] = [data.mean];
  inputs[`${key}_sd`] = [data.sd];
  inputs[`${key}_n`] = [data.n];
  return `${key} = bs_describe_summary(${key}_mean, ${key}_sd, ${key}_n)`;
}

const cellKey = (r: number, c: number): string => `r${String(r)}c${String(c)}`;
const pooledKey = (c: number): string => `p${String(c)}`;

export const descriptive: AnalysisModule<'descriptive', DescriptiveRequest, DescriptiveResult> = {
  kind: 'descriptive',
  version: 2,
  code,

  prepare(analysis, project) {
    if (analysis.input.kind !== 'table')
      return { ok: false, reason: 'Descriptive statistics describe a data table.' };
    const table = project.tables.get(analysis.input.table);
    if (!table) return { ok: false, reason: 'The table this analysis describes no longer exists.' };
    if (table.type !== 'column' && table.type !== 'grouped') {
      return {
        ok: false,
        reason: 'Descriptive statistics describe a Column or Grouped table.',
      };
    }
    if (analysis.input.dataSets.length === 0)
      return { ok: false, reason: 'Choose at least one group to describe.' };

    if (table.type === 'column') {
      const groups = columnGroups(table, analysis.input.dataSets);
      if (!groups.some((g) => hasData(g.data)))
        return { ok: false, reason: 'There are no values to describe yet.' };
      return { ok: true, request: { kind: 'column', groups } };
    }

    const grid = groupedCells(table, analysis.input.dataSets);
    if (!grid.cells.some((row) => row.some(hasData)))
      return { ok: false, reason: 'There are no values to describe yet.' };
    const rows = grid.rows.map((row, i) => ({
      id: row.id,
      title: row.title !== null && row.title !== '' ? row.title : `Row ${String(i + 1)}`,
    }));
    const columns = grid.dataSets.map((d) => ({ id: d.id, title: d.title }));
    const pooled =
      table.format.kind === 'summary' ? null : columns.map((_, c) => poolColumn(grid.cells, c));
    const request: DescriptiveGroupedRequest = {
      kind: 'grouped',
      rows,
      columns,
      cells: grid.cells,
      pooled,
    };
    return { ok: true, request };
  },

  job(request): EngineJob {
    const inputs: Record<string, EngineInput> = {};
    const calls: string[] = [];
    if (request.kind === 'column') {
      request.groups.forEach((g, i) => {
        calls.push(call(`g${String(i + 1)}`, g.data, inputs));
      });
    } else {
      request.cells.forEach((row, r) => {
        row.forEach((d, c) => {
          calls.push(call(cellKey(r, c), d, inputs));
        });
      });
      request.pooled?.forEach((d, c) => {
        calls.push(call(pooledKey(c), d, inputs));
      });
    }
    return { code: `${code}\nlist(${calls.join(', ')})`, inputs, packages: [] };
  },

  parse(value: Plain, request, warnings) {
    const all = object(value, 'descriptive statistics');
    if (request.kind === 'column') {
      const groups = request.groups.map((g, i): DescribedGroup => {
        const r = object(all[`g${String(i + 1)}`] ?? null, 'group');
        return describeGroup(g.id, g.title, g.data, r);
      });
      return { kind: 'column', groups, warnings: [...warnings] };
    }
    const cells = request.cells.map((row, r) =>
      row.map((d, c): DescribedGroup => {
        const key = cellKey(r, c);
        const rr = object(all[key] ?? null, 'cell');
        const rowInfo = request.rows[r];
        const colInfo = request.columns[c];
        const id = `${rowInfo?.id ?? String(r)}/${colInfo?.id ?? String(c)}`;
        return describeGroup(id, colInfo?.title ?? '', d, rr);
      }),
    );
    const pooled =
      request.pooled === null
        ? null
        : request.pooled.map((d, c): DescribedGroup => {
            const rr = object(all[pooledKey(c)] ?? null, 'pooled group');
            const col = request.columns[c];
            return describeGroup(col?.id ?? String(c), col?.title ?? '', d, rr);
          });
    return {
      kind: 'grouped',
      rows: request.rows,
      columns: request.columns,
      cells,
      pooled,
      warnings: [...warnings],
    };
  },
};
