/**
 * From project to layout input (note 05): which data sets a graph plots,
 * their colours and values, the summary statistics behind its bars and
 * error bars (a virtual descriptive analysis run by R), and the brackets
 * of the t tests it draws.
 */
import type { DescriptiveResult } from '@/analyses/descriptive/types';
import type { TTestResult } from '@/analyses/ttest/types';
import { type Id, asId } from '@/model/ids';
import type { Analysis, Graph, Project } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import { columnGroup } from '@/model/selectors';
import type { ColumnTable, DataSet } from '@/model/table';

import { pPhrase, stars } from '@/ui/results/format';

import type { BracketInput, GroupInput, LayoutInput } from './layout';
import { paletteColor } from './palette';
import { resolveTheme } from './themes';

/** The id of a graph's summary statistics, run like an analysis (note 05). */
export const summaryId = (graph: Id): Id => asId(`${graph}/summary`);

/** A summary id's graph, or null for an ordinary analysis id. */
export function graphOfSummary(id: Id): Id | null {
  return id.endsWith('/summary') ? asId(id.slice(0, -'/summary'.length)) : null;
}

export function graphTable(project: Project, graph: Graph): ColumnTable | null {
  if (graph.source.kind !== 'table') return null;
  const t = project.tables.get(graph.source.table);
  return t?.type === 'column' ? t : null;
}

/** The data sets plotted, in order, with each one's position in its table (for its default colour). */
export function plotted(
  table: ColumnTable,
  graph: Graph,
): { readonly ds: DataSet; readonly index: number }[] {
  const all = table.dataSets.map((ds, index) => ({ ds, index }));
  if (graph.dataSets === null) return all;
  return graph.dataSets.flatMap((id) => all.filter((x) => x.ds.id === id));
}

/** The descriptive analysis behind a graph's bars and error bars. */
export function summaryAnalysis(project: Project, graph: Graph): Analysis | null {
  const table = graphTable(project, graph);
  if (!table) return null;
  return {
    id: summaryId(graph.id),
    title: `Summary of ${graph.title}`,
    kind: 'descriptive',
    options: {},
    input: { kind: 'table', table: table.id, dataSets: plotted(table, graph).map((x) => x.ds.id) },
  };
}

/** The project as `Recompute` sees it: every graph's summary added as an analysis. */
export function withGraphSummaries(project: Project): Project {
  if (project.graphs.size === 0) return project;
  const analyses = new Map(project.analyses);
  const order = [...project.order.analyses];
  project.graphs.forEach((g) => {
    const a = summaryAnalysis(project, g);
    if (a) {
      analyses.set(a.id, a);
      order.push(a.id);
    }
  });
  return { ...project, analyses, order: { ...project.order, analyses: order } };
}

export function valueTitle(table: ColumnTable, graph: Graph): string {
  if (graph.format.yTitle !== undefined) return graph.format.yTitle;
  const title = table.valueTitle ?? '';
  return table.unit ? `${title || 'Value'} (${table.unit})` : title;
}

export type GraphInput =
  | { readonly ok: true; readonly input: LayoutInput; readonly summaryReady: boolean }
  | { readonly ok: false; readonly reason: string };

/** Everything the layout needs, from the project and the current results. */
export function graphInput(
  project: Project,
  graph: Graph,
  result: (id: Id) => ResultEntry | undefined,
): GraphInput {
  const table = graphTable(project, graph);
  if (!table)
    return {
      ok: false,
      reason: 'Graphs of this kind of table are not available yet; use a Column table.',
    };
  const sets = plotted(table, graph);
  const summaryEntry = result(summaryId(graph.id));
  const summary = summaryEntry?.ok ? (summaryEntry.value as unknown as DescriptiveResult) : null;
  const groups: GroupInput[] = sets.map(({ ds, index }) => {
    const data = columnGroup(table, ds.id);
    const s = summary?.groups.find((g) => g.id === ds.id);
    return {
      id: ds.id,
      title: ds.title,
      color: ds.color ?? paletteColor(index),
      values: data.kind === 'raw' ? data.values : [],
      summary: s
        ? {
            n: s.n,
            mean: s.mean,
            median: s.median,
            sd: s.sd,
            sem: s.sem,
            ciLower: s.ciLower,
            ciUpper: s.ciUpper,
            min: s.min,
            max: s.max,
          }
        : null,
    };
  });
  const brackets: BracketInput[] = [];
  for (const id of graph.analyses) {
    const a = project.analyses.get(id);
    const r = result(id);
    if (
      a?.kind !== 't-test' ||
      a.input.kind !== 'table' ||
      graph.format.hiddenBrackets.includes(id) ||
      !r?.ok
    )
      continue;
    const t = r.value as unknown as TTestResult;
    const from = sets.findIndex((x) => x.ds.id === t.a.id);
    const to = sets.findIndex((x) => x.ds.id === t.b.id);
    if (from < 0 || to < 0) continue;
    const label = graph.format.bracketLabels === 'exact' ? pPhrase(t.p) : stars(t.p);
    if (label === 'ns' && !graph.format.showNs) continue;
    brackets.push({ id, from, to, label });
  }
  return {
    ok: true,
    summaryReady: summary !== null,
    input: {
      plot: graph.plot,
      size: graph.size,
      theme: resolveTheme(graph.theme),
      yTitle: valueTitle(table, graph),
      yMin: graph.format.yMin,
      yMax: graph.format.yMax,
      groups,
      brackets,
    },
  };
}
