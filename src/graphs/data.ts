/**
 * From project to layout input (note 05): which data sets a graph plots,
 * their colours and values, the summary statistics behind its bars and
 * error bars (a virtual descriptive analysis run by R), and the brackets
 * of the comparisons it draws.
 */
import type { DescriptiveResult } from '@/analyses/descriptive/types';
import { comparisons, gives, pairsOf } from '@/analyses/pairwise';
import { type Id, asId } from '@/model/ids';
import type { Analysis, Graph, Project } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import { columnGroup } from '@/model/selectors';
import type { ColumnTable, DataSet } from '@/model/table';

import { pPhrase, stars } from '@/ui/results/format';

import type { BracketInput, GroupInput, LayoutInput } from './layout';
import { paletteColor } from './palette';
import { graphTheme } from './themes';

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
      symbol: graph.format.symbols?.[ds.id],
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
    if (!a || !gives(a) || a.input.kind !== 'table' || graph.format.hiddenBrackets.includes(id))
      continue;
    if (!r?.ok) continue;
    for (const c of comparisons(a, r.value)) {
      if (c.key !== id && graph.format.hiddenBrackets.includes(c.key)) continue;
      const from = sets.findIndex((x) => x.ds.id === c.a);
      const to = sets.findIndex((x) => x.ds.id === c.b);
      if (from < 0 || to < 0) continue;
      const label =
        graph.format.bracketLabels === 'exact'
          ? pPhrase(c.p)
          : stars(c.p, graph.format.starScheme ?? 'prism');
      if (label === 'ns' && !graph.format.showNs) continue;
      brackets.push({ id: c.key, from, to, label, offset: graph.format.bracketOffsets?.[c.key] });
    }
  }
  return {
    ok: true,
    summaryReady: summary !== null,
    input: {
      plot: graph.plot,
      size: graph.size,
      theme: graphTheme(graph.theme, graph.format.style),
      yTitle: valueTitle(table, graph),
      yMin: graph.format.yMin,
      yMax: graph.format.yMax,
      axis: {
        scale: graph.format.yScale,
        step: graph.format.yStep,
        decimals: graph.format.yDecimals,
      },
      xAngle: graph.format.xAngle,
      title: graph.format.showTitle ? graph.title : undefined,
      groups,
      brackets,
    },
  };
}

export interface BracketChoice {
  readonly id: Id;
  readonly title: string;
  readonly shown: boolean;
  /** Each comparison of a post-hoc test, which can be hidden on its own; empty for a single comparison. */
  readonly pairs: readonly {
    readonly key: string;
    readonly label: string;
    readonly shown: boolean;
  }[];
}

/** The analyses of a graph's table that give brackets, whether the graph draws them or could (note 05, "offers its brackets"). */
export function bracketChoices(project: Project, graph: Graph): BracketChoice[] {
  const table = graphTable(project, graph);
  if (!table) return [];
  const titleOf = (id: string) => table.dataSets.find((d) => d.id === id)?.title ?? '?';
  return project.order.analyses.flatMap((id) => {
    const a = project.analyses.get(id);
    if (!a || !gives(a) || a.input.kind !== 'table' || a.input.table !== table.id) return [];
    const shown = graph.analyses.includes(id) && !graph.format.hiddenBrackets.includes(id);
    const pairs = pairsOf(a).filter((x) => x.key !== id);
    return [
      {
        id,
        title: a.title,
        shown,
        pairs: pairs.map((x) => ({
          key: x.key,
          label: `${titleOf(x.a)} vs. ${titleOf(x.b)}`,
          shown: shown && !graph.format.hiddenBrackets.includes(x.key),
        })),
      },
    ];
  });
}

/** The graph with one comparison's bracket (by key) shown or hidden, its analysis staying on. */
export function withPair(graph: Graph, key: string, show: boolean): Graph {
  const hidden = graph.format.hiddenBrackets.filter((x) => x !== key);
  return {
    ...graph,
    format: { ...graph.format, hiddenBrackets: show ? hidden : [...hidden, key] },
  };
}

/** The graph with an analysis's brackets shown or hidden. */
export function withBracket(graph: Graph, id: Id, show: boolean): Graph {
  const analyses = show && !graph.analyses.includes(id) ? [...graph.analyses, id] : graph.analyses;
  const hidden = graph.format.hiddenBrackets.filter((x) => x !== id);
  return {
    ...graph,
    analyses,
    format: { ...graph.format, hiddenBrackets: show ? hidden : [...hidden, id] },
  };
}
