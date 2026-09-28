/**
 * Changing a graph's formatting (note 07): each helper returns a new
 * graph for one `setGraph` edit. Clearing a value (undefined) removes the
 * override, so the theme's value shows again.
 */
import { pairsOf } from '@/analyses/pairwise';
import { graphTable, pairLabel } from '@/graphs/data';
import type { ElementId } from '@/graphs/hit';
import {
  type ColumnPlot,
  type GraphPlot,
  hasErrorBars,
  type Graph,
  type GraphFormat,
  type PointSymbol,
  type Project,
  type StyleNumber,
  type StyleOverrides,
} from '@/model/project';

type Patch<T> = { readonly [K in keyof T]?: T[K] | undefined };

/** Drops keys set to undefined, so an override that was cleared isn't written. */
function compact<T extends object>(o: Patch<T>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

export function withFormat(graph: Graph, patch: Patch<GraphFormat>): Graph {
  return { ...graph, format: compact<GraphFormat>({ ...graph.format, ...patch }) };
}

type StyleKey = StyleNumber | 'ticks' | 'spines';

export function withStyleValue<K extends StyleKey>(
  graph: Graph,
  key: K,
  value: StyleOverrides[K] | undefined,
): Graph {
  const style = compact<StyleOverrides>({ ...graph.format.style, [key]: value });
  return withFormat(graph, { style: Object.keys(style).length ? style : undefined });
}

function withoutStyle(graph: Graph, keys: readonly StyleKey[]): Graph {
  const style = Object.fromEntries(
    Object.entries(graph.format.style ?? {}).filter(
      ([k]) => !(keys as readonly string[]).includes(k),
    ),
  ) as StyleOverrides;
  return withFormat(graph, { style: Object.keys(style).length ? style : undefined });
}

function withoutKey<V>(
  r: Readonly<Record<string, V>> | undefined,
  key: string,
): Readonly<Record<string, V>> | undefined {
  if (!r || !(key in r)) return r;
  const out = Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
  return Object.keys(out).length ? out : undefined;
}

export function withSymbol(graph: Graph, dataSet: string, symbol: PointSymbol | undefined): Graph {
  const rest = withoutKey(graph.format.symbols, dataSet);
  return withFormat(graph, {
    symbols: symbol === undefined || symbol === 'circle' ? rest : { ...rest, [dataSet]: symbol },
  });
}

/** A bracket's offset in points, never below zero (its automatic place). */
export function withOffset(graph: Graph, key: string, offset: number): Graph {
  const rest = withoutKey(graph.format.bracketOffsets, key);
  const v = Math.round(Math.max(0, offset) * 10) / 10;
  return withFormat(graph, { bracketOffsets: v === 0 ? rest : { ...rest, [key]: v } });
}

export const offsetOf = (graph: Graph, key: string): number =>
  graph.format.bracketOffsets?.[key] ?? 0;

/** Style values each kind of element owns, for "Reset". */
const ELEMENT_STYLE: Readonly<Record<string, readonly StyleKey[]>> = {
  'y-axis': ['font.tick', 'lines.axis', 'lines.tick', 'lines.tickLength', 'ticks', 'spines'],
  'x-axis': ['font.tick', 'lines.axis'],
  'y-title': ['font.axisTitle'],
  'x-title': ['font.axisTitle'],
  title: ['font.title'],
  legend: ['font.legend'],
  'error-bars': ['lines.error', 'capWidth'],
  series: [
    'barWidth',
    'barLighten',
    'lines.barEdge',
    'pointSize',
    'pointOpacity',
    'lines.pointEdge',
  ],
  bracket: ['font.bracket', 'lines.bracket'],
  'fit-line': ['lines.fit'],
  band: ['bandOpacity'],
};

const kindOf = (element: ElementId): string => element.split(':')[0] ?? element;

/** The graph with the selected element's overrides removed. */
export function resetElement(graph: Graph, element: ElementId): Graph {
  const kind = kindOf(element);
  let g = withoutStyle(graph, ELEMENT_STYLE[kind] ?? []);
  if (kind === 'y-axis')
    g = withFormat(g, {
      yMin: undefined,
      yMax: undefined,
      yScale: undefined,
      yStep: undefined,
      yDecimals: undefined,
    });
  if (kind === 'x-axis')
    g = withFormat(g, {
      xAngle: undefined,
      xMin: undefined,
      xMax: undefined,
      xScale: undefined,
      xStep: undefined,
      xDecimals: undefined,
    });
  if (kind === 'y-title') g = withFormat(g, { yTitle: undefined });
  if (kind === 'x-title') g = withFormat(g, { xTitle: undefined });
  if (kind === 'series') g = withSymbol(g, element.slice('series:'.length), undefined);
  if (kind === 'bracket') g = withOffset(g, element.slice('bracket:'.length), 0);
  return g;
}

/** Whether the element has anything to reset. */
export const isFormatted = (graph: Graph, element: ElementId): boolean =>
  JSON.stringify(resetElement(graph, element)) !== JSON.stringify(graph);

/** The graph with every formatting override removed (brackets chosen and their labels stay). */
export function resetAll(graph: Graph): Graph {
  return withFormat(graph, {
    yTitle: undefined,
    yMin: undefined,
    yMax: undefined,
    yScale: undefined,
    yStep: undefined,
    yDecimals: undefined,
    xAngle: undefined,
    xTitle: undefined,
    xMin: undefined,
    xMax: undefined,
    xScale: undefined,
    xStep: undefined,
    xDecimals: undefined,
    showTitle: undefined,
    style: undefined,
    symbols: undefined,
    bracketOffsets: undefined,
  });
}

export const hasFormatting = (graph: Graph): boolean =>
  JSON.stringify(resetAll(graph)) !== JSON.stringify(graph);

/** What the inspector calls an element: "Y axis", "Data set: WT", "Bracket: WT vs. KO". */
export function elementLabel(element: ElementId, project: Project, graph: Graph): string {
  const table = graphTable(project, graph);
  const title = (id: string) => table?.dataSets.find((d) => d.id === id)?.title ?? '?';
  switch (kindOf(element)) {
    case 'y-axis':
      return 'Y axis';
    case 'x-axis':
      return graph.plot.kind === 'xy-scatter' ? 'X axis' : 'X axis and group labels';
    case 'y-title':
      return 'Y axis title';
    case 'x-title':
      return 'X axis title';
    case 'title':
      return 'Title';
    case 'legend':
      return 'Legend';
    case 'error-bars':
      return 'Error bars';
    case 'series':
      return `Data set: ${title(element.slice('series:'.length))}`;
    case 'fit-line':
      return `Fitted line: ${title(element.slice('fit-line:'.length))}`;
    case 'band':
      return `Band: ${title(element.slice('band:'.length))}`;
    case 'bracket': {
      const key = element.slice('bracket:'.length);
      for (const id of graph.analyses) {
        const a = project.analyses.get(id);
        const pair = a ? pairsOf(a, project).find((x) => x.key === key) : undefined;
        if (pair && table) return `Bracket: ${pairLabel(table, pair.a, pair.b)}`;
      }
      return 'Bracket';
    }
    default:
      return element;
  }
}

/** A new plot kind, keeping what carries over (the error bars between bars and dots). */
export function switchPlot(plot: GraphPlot, kind: ColumnPlot['kind']): ColumnPlot {
  const error = hasErrorBars(plot) ? plot.error : 'sd';
  switch (kind) {
    case 'bars':
      return { kind, error, points: true };
    case 'dots':
      return { kind, error, center: 'mean' };
    case 'box':
      return { kind, whiskers: 'min-max', points: 'all' };
    case 'violin':
      return { kind, inner: 'quartiles', smoothing: 1 };
  }
}
