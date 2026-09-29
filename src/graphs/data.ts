/**
 * From project to layout input (note 05): which data sets a graph plots,
 * their colours and values, the summary statistics behind its bars and
 * error bars (a virtual descriptive analysis run by R), and the brackets
 * of the comparisons it draws.
 */
import type {
  LinearRegressionResult,
  RegressionBand,
  RegressionOutcome,
} from '@/analyses/linear-regression/types';
import type { NonlinearRegressionResult } from '@/analyses/nonlinear-regression/types';
import type { GrowthCurveResult } from '@/analyses/growth-curve/types';
import type { GraphSummaryResult } from '@/analyses/graphsummary/types';
import { cellId, comparisons, gives, pairsOf } from '@/analyses/pairwise';
import { type Id, asId } from '@/model/ids';
import type { Analysis, AnalysisKind, Graph, GraphSummaryOptions, Project } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import {
  type GroupData,
  columnGroup,
  groupedCells,
  nestedGroups,
  xySeries,
  xyErrorBand,
  xyTraces,
} from '@/model/selectors';
import type { DataSet, Table } from '@/model/table';

import { pPhrase, stars } from '@/ui/results/format';
import { doseResponseWhy, growthCurveWhy } from '@/ui/results/reading';

import type { BracketInput, GroupInput } from './layout';
import { paletteColor } from './palette';
import type { RenderInput } from './renderInput';
import { graphTheme } from './themes';
import type { XyGraphInput, XySeriesInput } from './xy';

/** The id of a graph's summary statistics, run like an analysis (note 05). */
export const summaryId = (graph: Id): Id => asId(`${graph}/summary`);

/** A summary id's graph, or null for an ordinary analysis id. */
export function graphOfSummary(id: Id): Id | null {
  return id.endsWith('/summary') ? asId(id.slice(0, -'/summary'.length)) : null;
}

export function graphTable(project: Project, graph: Graph): Table | null {
  if (graph.source.kind !== 'table') return null;
  return project.tables.get(graph.source.table) ?? null;
}

/** The data sets plotted, in order, with each one's position in its table (for its default colour). */
export function plotted(
  table: Table,
  graph: Graph,
): { readonly ds: DataSet; readonly index: number }[] {
  const all = table.dataSets.map((ds, index) => ({ ds, index }));
  if (graph.dataSets === null) {
    // An XY table's first data set is the shared X column, never a Y series (item 31, #87).
    return table.type === 'xy' ? all.slice(1) : all;
  }
  return graph.dataSets.flatMap((id) => all.filter((x) => x.ds.id === id));
}

/** The statistics a graph's plot needs from R (note 07). */
export function summaryOptions(graph: Graph): GraphSummaryOptions {
  const p = graph.plot;
  return {
    whiskers: p.kind === 'box' ? p.whiskers : null,
    kde: p.kind === 'violin' ? { adjust: p.smoothing, log: graph.format.yScale === 'log10' } : null,
  };
}

/** The analysis behind a graph's bars, error bars, boxes and violins. */
export function summaryAnalysis(project: Project, graph: Graph): Analysis | null {
  const table = graphTable(project, graph);
  if (!table) return null;
  return {
    id: summaryId(graph.id),
    title: `Summary of ${graph.title}`,
    kind: 'graph-summary',
    options: summaryOptions(graph),
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

export function valueTitle(table: Table, graph: Graph): string {
  if (graph.format.yTitle !== undefined) return graph.format.yTitle;
  const title = table.valueTitle ?? '';
  return table.unit ? `${title || 'Value'} (${table.unit})` : title;
}

export type GraphInput =
  | { readonly ok: true; readonly input: RenderInput; readonly summaryReady: boolean }
  | { readonly ok: false; readonly reason: string };

/** The last input made for each graph, with what it was made from. */
const inputs = new WeakMap<
  Graph,
  { readonly from: readonly unknown[]; readonly input: GraphInput }
>();

/**
 * Everything the layout needs, from the project and the current results.
 * The same object comes back while nothing it is made from has changed,
 * so what is drawn from it can be kept (`cache.ts`).
 */
export function graphInput(
  project: Project,
  graph: Graph,
  result: (id: Id) => ResultEntry | undefined,
): GraphInput {
  const from = [
    graphTable(project, graph),
    result(summaryId(graph.id)),
    ...graph.analyses.flatMap((id) => [project.analyses.get(id), result(id)]),
  ];
  const last = inputs.get(graph);
  if (last?.from.length === from.length && last.from.every((x, i) => x === from[i])) {
    return last.input;
  }
  const input = makeGraphInput(project, graph, result);
  inputs.set(graph, { from, input });
  return input;
}

function makeGraphInput(
  project: Project,
  graph: Graph,
  result: (id: Id) => ResultEntry | undefined,
): GraphInput {
  const table = graphTable(project, graph);
  if (!table) return { ok: false, reason: 'The table this graph plots no longer exists.' };
  if (graph.plot.kind === 'xy-scatter') {
    if (table.type !== 'xy') return { ok: false, reason: 'This plot is for XY tables.' };
    return {
      ok: true,
      summaryReady: true,
      input: {
        kind: 'xy',
        input: xyGraphInput(
          table,
          graph,
          result,
          graph.analyses[0] === undefined
            ? undefined
            : project.analyses.get(graph.analyses[0])?.kind,
        ),
      },
    };
  }
  const sets = plotted(table, graph);
  const summaryEntry = result(summaryId(graph.id));
  const summary = summaryEntry?.ok ? (summaryEntry.value as unknown as GraphSummaryResult) : null;
  const grouped = table.type === 'grouped' && graph.plot.kind === 'grouped-bars';
  const separated = graph.plot.kind === 'grouped-bars' && graph.plot.arrangement === 'separated';
  /** The groups drawn: data sets, or a Grouped table's cells in cluster order. */
  const cells: {
    readonly id: string;
    readonly title: string;
    readonly ds: DataSet;
    readonly index: number;
    readonly data: GroupData;
    /** A Nested table's SuperPlot: parallel to `data.values`, and each replicate's own mean. */
    readonly replicateOf?: readonly number[];
    readonly replicateMeans?: readonly (number | null)[];
  }[] = [];
  const clusters: { title: string; size: number }[] = [];
  if (table.type === 'grouped' && grouped) {
    const g = groupedCells(
      table,
      sets.map((x) => x.ds.id),
    );
    const rowTitle = (r: number) => g.rows[r]?.title ?? `Row ${String(r + 1)}`;
    if (separated) {
      sets.forEach((x, d) => {
        clusters.push({ title: x.ds.title, size: g.rows.length });
        g.rows.forEach((row, r) => {
          const data = g.cells[r]?.[d];
          if (data) cells.push({ id: cellId(row.id, x.ds.id), title: rowTitle(r), ...x, data });
        });
      });
    } else {
      g.rows.forEach((row, r) => {
        clusters.push({ title: rowTitle(r), size: sets.length });
        sets.forEach((x, d) => {
          const data = g.cells[r]?.[d];
          if (data) cells.push({ id: cellId(row.id, x.ds.id), title: x.ds.title, ...x, data });
        });
      });
    }
  } else if (table.type === 'column') {
    for (const x of sets)
      cells.push({ id: x.ds.id, title: x.ds.title, ...x, data: columnGroup(table, x.ds.id) });
  } else if (table.type === 'nested') {
    const ng = nestedGroups(
      table,
      sets.map((x) => x.ds.id),
    );
    sets.forEach((x, i) => {
      const g = ng[i];
      if (!g) return;
      const values: number[] = [];
      const replicateOf: number[] = [];
      // By subcolumn, so replicate 3 keeps its colour and shape when replicate 2 is empty.
      const replicateMeans = g.replicates.map((r, replicate) => {
        for (const v of r.values) {
          values.push(v);
          replicateOf.push(replicate);
        }
        return r.values.length ? r.values.reduce((a, b) => a + b, 0) / r.values.length : null;
      });
      cells.push({
        id: x.ds.id,
        title: x.ds.title,
        ...x,
        data: { kind: 'raw', values, dropped: { empty: 0, excluded: 0 } },
        replicateOf,
        replicateMeans,
      });
    });
  } else {
    return { ok: false, reason: 'This plot is for Column tables; choose grouped bars.' };
  }
  const groups: GroupInput[] = cells.map(
    ({ id, title, ds, index, data, replicateOf, replicateMeans }) => {
      const s = summary?.cells.find((c) => c.id === id);
      return {
        id,
        series: ds.id,
        title,
        color: ds.color ?? paletteColor(index),
        symbol: graph.format.symbols?.[ds.id],
        values: data.kind === 'raw' ? data.values : [],
        replicateOf,
        replicateMeans,
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
              q1: s.q1,
              q3: s.q3,
              whiskers: s.whiskers,
              kde: s.kde,
            }
          : null,
      };
    },
  );
  const brackets: BracketInput[] = [];
  for (const id of graph.analyses) {
    const a = project.analyses.get(id);
    const r = result(id);
    if (!a || !gives(a) || a.input.kind !== 'table' || graph.format.hiddenBrackets.includes(id))
      continue;
    if (!r?.ok) continue;
    for (const c of comparisons(a, r.value)) {
      if (c.key !== id && graph.format.hiddenBrackets.includes(c.key)) continue;
      const from = cells.findIndex((x) => x.id === c.a);
      const to = cells.findIndex((x) => x.id === c.b);
      if (from < 0 || to < 0) continue;
      const scheme = graph.format.starScheme ?? 'prism';
      // Hides a non-significant bracket whichever way it is labelled.
      if (!graph.format.showNs && stars(c.p, scheme) === 'ns') continue;
      const label = graph.format.bracketLabels === 'exact' ? pPhrase(c.p) : stars(c.p, scheme);
      brackets.push({ id: c.key, from, to, label, offset: graph.format.bracketOffsets?.[c.key] });
    }
  }
  return {
    ok: true,
    summaryReady: summary !== null,
    input: {
      kind: 'column',
      input: {
        // Grouped bars are drawn as bars in clusters.
        plot:
          graph.plot.kind === 'grouped-bars'
            ? { kind: 'bars', error: graph.plot.error, points: graph.plot.points }
            : graph.plot,
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
        ...(grouped
          ? {
              clusters,
              barLabels: separated,
              legend:
                separated || graph.format.legend === 'none'
                  ? undefined
                  : {
                      at: graph.format.legend === 'top' ? ('top' as const) : ('right' as const),
                      entries: sets.map((x) => ({
                        id: x.ds.id,
                        title: x.ds.title,
                        color: x.ds.color ?? paletteColor(x.index),
                      })),
                    },
            }
          : {}),
      },
    },
  };
}

/** Plain English for a series' fit that couldn't run, matching the results view's own wording. */
function regressionWhy(outcome: Extract<RegressionOutcome, { ran: false }>): string {
  if (outcome.why === 'constant-x') return 'every X is the same value, so there is no line to fit.';
  if (outcome.why === 'constant-y')
    return 'Y never varies, so there is nothing for a line to explain.';
  return `it has too few points to fit a line (needs at least ${String(outcome.minimum ?? 3)}).`;
}

/** One series' fit behind a graph's fitted line: its curve and bands, or why there is none. */
type SeriesFit =
  | { readonly ran: true; readonly band: RegressionBand }
  | { readonly ran: false; readonly why: string };

/**
 * Each series' fit from the analysis behind a graph's fitted line — a
 * linear regression (note 31), a dose-response curve (note 32) or a
 * growth curve (note 33), all carrying the same band — or null while it
 * isn't ready.
 */
function fitsOf(
  id: Id,
  kind: AnalysisKind | undefined,
  result: (id: Id) => ResultEntry | undefined,
): ((series: Id) => SeriesFit | undefined) | null {
  const r = result(id);
  if (!r?.ok) return null;
  if (kind === 'linear-regression') {
    const v = r.value as unknown as LinearRegressionResult;
    return (series) => {
      const o = v.series.find((s) => s.id === series)?.outcome;
      if (!o) return undefined;
      return o.ran ? { ran: true, band: o.band } : { ran: false, why: regressionWhy(o) };
    };
  }
  if (kind === 'nonlinear-regression') {
    const v = r.value as unknown as NonlinearRegressionResult;
    return (series) => {
      const o = v.series.find((s) => s.id === series)?.outcome;
      if (!o) return undefined;
      return o.ran ? { ran: true, band: o.band } : { ran: false, why: `${doseResponseWhy(o)}.` };
    };
  }
  if (kind === 'growth-curve') {
    const v = r.value as unknown as GrowthCurveResult;
    return (series) => {
      const o = v.series.find((s) => s.id === series)?.outcome;
      if (!o) return undefined;
      return o.ran ? { ran: true, band: o.band } : { ran: false, why: `${growthCurveWhy(o)}.` };
    };
  }
  return null;
}

/** An XY table's x-axis title; unset = the X data set's own title. */
function xTitleOf(table: Table, graph: Graph): string {
  if (graph.format.xTitle !== undefined) return graph.format.xTitle;
  return table.dataSets[0]?.title ?? 'X';
}

/** The mean Y at each distinct X, in X order: the line the `lines` and `traces` styles join. */
function meanByX(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const s = sums.get(p.x);
    if (s) {
      s.sum += p.y;
      s.n += 1;
    } else sums.set(p.x, { sum: p.y, n: 1 });
  }
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([x, s]) => ({ x, y: s.sum / s.n }));
}

/** An XY graph's points, and its fitted line and band when the plot asks for them (item 31, #87). */
function xyGraphInput(
  table: Table,
  graph: Graph,
  result: (id: Id) => ResultEntry | undefined,
  fitKind: AnalysisKind | undefined,
): XyGraphInput {
  const plot = graph.plot;
  if (table.type !== 'xy' || plot.kind !== 'xy-scatter') {
    throw new Error('xyGraphInput: not an XY table plotted as an xy-scatter');
  }
  const sets = plotted(table, graph);
  const dataPoints = xySeries(
    table,
    sets.map((x) => x.ds.id),
  );
  const traces =
    plot.style === 'traces'
      ? xyTraces(
          table,
          sets.map((x) => x.ds.id),
        )
      : undefined;
  const analysisId = graph.analyses[0];
  const fits = plot.fit && analysisId !== undefined ? fitsOf(analysisId, fitKind, result) : null;
  const series: XySeriesInput[] = sets.map((x) => {
    const points = (dataPoints.find((d) => d.id === x.ds.id)?.points ?? []).map((p) => ({
      x: p.x,
      y: p.y,
    }));
    const color = x.ds.color ?? paletteColor(x.index);
    const drawn =
      plot.style === 'scatter'
        ? {}
        : {
            connect: meanByX(points),
            ...(traces ? { traces: traces.get(x.ds.id) } : {}),
            ...(plot.style === 'traces' && plot.error !== 'none'
              ? { errorBand: xyErrorBand(table, x.ds.id, plot.error) }
              : {}),
          };
    const outcome = fits?.(x.ds.id);
    if (!plot.fit || !outcome) return { id: x.ds.id, title: x.ds.title, color, points, ...drawn };
    if (!outcome.ran) {
      return {
        id: x.ds.id,
        title: x.ds.title,
        color,
        points,
        ...drawn,
        note: `${x.ds.title}: no fitted line — ${outcome.why}`,
      };
    }
    const { band: b } = outcome;
    const fit = b.x.map((v, j) => ({ x: v, y: b.fit[j] ?? 0 }));
    const band =
      plot.band === 'none'
        ? undefined
        : b.x.map((v, j) => ({
            x: v,
            y0: (plot.band === 'confidence' ? b.confidenceLower[j] : b.predictionLower[j]) ?? 0,
            y1: (plot.band === 'confidence' ? b.confidenceUpper[j] : b.predictionUpper[j]) ?? 0,
          }));
    return { id: x.ds.id, title: x.ds.title, color, points, ...drawn, fit, band };
  });
  return {
    plot,
    size: graph.size,
    theme: graphTheme(graph.theme, graph.format.style),
    xTitle: xTitleOf(table, graph),
    yTitle: valueTitle(table, graph),
    xMin: graph.format.xMin,
    xMax: graph.format.xMax,
    yMin: graph.format.yMin,
    yMax: graph.format.yMax,
    xAxis: {
      scale: graph.format.xScale,
      step: graph.format.xStep,
      decimals: graph.format.xDecimals,
    },
    yAxis: {
      scale: graph.format.yScale,
      step: graph.format.yStep,
      decimals: graph.format.yDecimals,
    },
    title: graph.format.showTitle ? graph.title : undefined,
    series,
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
  /** Why an analysis the graph could draw gives no brackets (two-way main effects). */
  readonly note?: string;
}

/** The analyses of a graph's table that give brackets, whether the graph draws them or could (note 05, "offers its brackets"). */
export function bracketChoices(project: Project, graph: Graph): BracketChoice[] {
  const table = graphTable(project, graph);
  if (!table) return [];
  return project.order.analyses.flatMap((id) => {
    const a = project.analyses.get(id);
    if (!a || !gives(a) || a.input.kind !== 'table' || a.input.table !== table.id) return [];
    const shown = graph.analyses.includes(id) && !graph.format.hiddenBrackets.includes(id);
    const pairs = pairsOf(a, project).filter((x) => x.key !== id);
    const mainEffects =
      a.kind === 'two-way-anova' &&
      (a.options.family === 'main-columns' || a.options.family === 'main-rows');
    return [
      {
        id,
        title: a.title,
        shown,
        pairs: pairs.map((x) => ({
          key: x.key,
          label: pairLabel(table, x.a, x.b),
          shown: shown && !graph.format.hiddenBrackets.includes(x.key),
        })),
        ...(mainEffects
          ? {
              note: 'Its comparisons are of row or column means, which no bar shows, so it gives no brackets.',
            }
          : {}),
      },
    ];
  });
}

/** A data set's or a Grouped table cell's name: "KO", or "Day 1: KO". */
export function groupName(table: Table, id: string): string {
  const ds = (d: string) => table.dataSets.find((x) => x.id === d)?.title ?? '?';
  const at = id.indexOf('/');
  if (at < 0) return ds(id);
  const r = table.rows.findIndex((x) => x.id === id.slice(0, at));
  const row = table.rows[r]?.title ?? `Row ${String(r + 1)}`;
  return `${row}: ${ds(id.slice(at + 1))}`;
}

/** "WT vs. KO"; two cells of one row: "Day 1: WT vs. KO". */
export function pairLabel(table: Table, a: string, b: string): string {
  const [ra, da] = a.split('/');
  const [rb, db] = b.split('/');
  if (da !== undefined && db !== undefined && ra === rb)
    return `${groupName(table, a)} vs. ${groupName(table, db)}`;
  return `${groupName(table, a)} vs. ${groupName(table, b)}`;
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
