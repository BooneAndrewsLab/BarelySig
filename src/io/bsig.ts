/**
 * The `.bsig` project file (item 02): versioned plain JSON.
 *
 *   { "format": "barelysig", "schemaVersion": 1, "app": "0.2.0",
 *     "engine": { "webr", "r", "packages" } | null,
 *     "project": { id, name, tables: [...], analyses: [...], graphs: [...],
 *                  layouts: [...], exports: [...] },
 *     "results": { "<analysis id>": { inputHash, ok, value | error } } }
 *
 * Each section is an array in navigator order, so the file cannot hold an
 * order that disagrees with its contents. Excluded cells are sorted
 * arrays of cell keys; cells are numbers or null (the model never holds
 * NaN or Inf, so JSON carries every cell exactly).
 *
 * Reading runs the file through the migration chain to the current
 * schema, decodes it field by field, and checks every model invariant, so
 * a damaged file fails with a message instead of half-loading. A file
 * from a newer app refuses to open rather than guessing.
 */
import type { Id } from '@/model/ids';
import { asId } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { Json } from '@/model/json';
import type { Cell } from '@/model/missing';
import {
  type Analysis,
  type AnalysisInput,
  type AnalysisSpec,
  type Comparisons,
  EQUAL_SD_ALL,
  EQUAL_SD_CONTROL,
  type KruskalWallisOptions,
  type OneWayOptions,
  WELCH_ALL,
  WELCH_CONTROL,
  type ExportRecord,
  type ColumnPlot,
  type Graph,
  type GraphFormat,
  type GraphSource,
  type Layout,
  POINT_SYMBOLS,
  type PointSymbol,
  type Project,
  type RankTestOptions,
  STYLE_NUMBERS,
  type StyleOverrides,
  TWO_WAY_FAMILIES,
  type TTestOptions,
  type TwoWayOptions,
  WHISKERS,
} from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import {
  type CellKey,
  type DataSet,
  type EntryFormat,
  type Row,
  SUMMARY_STATS,
  type SummaryStats,
  type Table,
} from '@/model/table';
import { validateProject } from '@/model/validate';

export const FORMAT = 'barelysig';
export const EXTENSION = '.bsig';

type JsonObject = Readonly<Record<string, Json>>;

/** One function per schema step: `MIGRATIONS[i]` turns version i + 1 into version i + 2. */
export type Migration = (doc: JsonObject) => JsonObject;

export const MIGRATIONS: readonly Migration[] = [];

export const SCHEMA_VERSION = MIGRATIONS.length + 1;

export interface SavedProject {
  readonly project: Project;
  /** Results by analysis id, each with the input hash it was computed from. */
  readonly results: ReadonlyMap<Id, ResultEntry>;
  /** The engine the results came from; null when there are none. */
  readonly engine: EngineInfo | null;
  /** App version that wrote the file. */
  readonly app: string;
}

/** A file that cannot be opened; the message is for the user. */
export class BsigError extends Error {
  override readonly name = 'BsigError';
}

/** An analysis's result, or a graph's summary statistics (`<graph id>/summary`, note 05). */
function keepsResult(p: Project, id: Id): boolean {
  if (p.analyses.has(id)) return true;
  return id.endsWith('/summary') && p.graphs.has(asId(id.slice(0, -'/summary'.length)));
}

// --- writing ------------------------------------------------------------------

const optional = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

function tableJson(t: Table): Json {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    format: t.format,
    rows: t.rows.map((r) => ({ id: r.id, title: r.title })),
    dataSets: t.dataSets.map((d) => ({
      id: d.id,
      title: d.title,
      subcolumns: d.subcolumns,
      excluded: [...d.excluded].sort(),
      ...optional('color', d.color),
      ...optional('decimals', d.decimals),
    })),
    ...optional('valueTitle', t.valueTitle),
    ...optional('unit', t.unit),
    ...optional('notes', t.notes),
  };
}

function analysisJson(a: Analysis): Json {
  const input: Json =
    a.input.kind === 'table'
      ? { kind: 'table', table: a.input.table, dataSets: a.input.dataSets }
      : { kind: 'analysis', analysis: a.input.analysis };
  return { id: a.id, title: a.title, kind: a.kind, options: optionsJson(a), input };
}

/** Each kind's options, field by field in a fixed order (never spread: key order would leak in). */
function optionsJson(a: AnalysisSpec): Json {
  switch (a.kind) {
    case 'descriptive':
    case 'normality':
      return {};
    case 'graph-summary':
      // Never in a project: graphs' summaries are made from the graph (note 07).
      return { whiskers: a.options.whiskers, kde: a.options.kde && { ...a.options.kde } };
    case 't-test':
      return { paired: a.options.paired, welch: a.options.welch, tails: a.options.tails };
    case 'rank-test':
      return { paired: a.options.paired, tails: a.options.tails, zeros: a.options.zeros };
    case 'one-way-anova':
      return { welch: a.options.welch, comparisons: comparisonsJson(a.options.comparisons) };
    case 'two-way-anova':
      return { family: a.options.family, comparisons: comparisonsJson(a.options.comparisons) };
    case 'kruskal-wallis': {
      const c = a.options.comparisons;
      return {
        comparisons: c.kind === 'control' ? { kind: c.kind, control: c.control } : { kind: c.kind },
        corrected: a.options.corrected,
      };
    }
  }
}

function comparisonsJson(c: Comparisons): Json {
  switch (c.kind) {
    case 'none':
      return { kind: 'none' };
    case 'all':
      return { kind: 'all', test: c.test };
    case 'control':
      return { kind: 'control', control: c.control, test: c.test };
  }
}

/** Style overrides in `STYLE_NUMBERS` order, then the two choices. */
function styleJson(st: StyleOverrides): Json {
  const out: Record<string, Json> = {};
  for (const k of STYLE_NUMBERS) {
    const v = st[k];
    if (v !== undefined) out[k] = v;
  }
  if (st.ticks !== undefined) out['ticks'] = st.ticks;
  if (st.spines !== undefined) out['spines'] = st.spines;
  return out;
}

/** A record keyed by ids, written in key order so the text doesn't depend on edit order. */
function sortedRecord<V extends Json>(r: Readonly<Record<string, V>>): Json {
  const out: Record<string, Json> = {};
  for (const k of Object.keys(r).sort()) {
    const v = r[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function plotJson(plot: ColumnPlot): Json {
  switch (plot.kind) {
    case 'bars':
      return { kind: 'bars', error: plot.error, points: plot.points };
    case 'dots':
      return { kind: 'dots', center: plot.center, error: plot.error };
    case 'box':
      return { kind: 'box', whiskers: plot.whiskers, points: plot.points };
    case 'violin':
      return { kind: 'violin', inner: plot.inner, smoothing: plot.smoothing };
  }
}

function graphJson(g: Graph): Json {
  const source: Json =
    g.source.kind === 'table'
      ? { kind: 'table', table: g.source.table }
      : { kind: 'analysis', analysis: g.source.analysis };
  const f = g.format;
  const format: Json = {
    bracketLabels: f.bracketLabels,
    showNs: f.showNs,
    hiddenBrackets: f.hiddenBrackets,
    ...optional('starScheme', f.starScheme),
    ...optional('yTitle', f.yTitle),
    ...optional('yMin', f.yMin),
    ...optional('yMax', f.yMax),
    ...optional('yScale', f.yScale),
    ...optional('yStep', f.yStep),
    ...optional('yDecimals', f.yDecimals),
    ...optional('xAngle', f.xAngle),
    ...optional('showTitle', f.showTitle),
    ...optional('style', f.style && styleJson(f.style)),
    ...optional('symbols', f.symbols && sortedRecord(f.symbols)),
    ...optional('bracketOffsets', f.bracketOffsets && sortedRecord(f.bracketOffsets)),
  };
  return {
    id: g.id,
    title: g.title,
    source,
    dataSets: g.dataSets,
    analyses: g.analyses,
    plot: plotJson(g.plot),
    size: { width: g.size.width, height: g.size.height },
    theme:
      g.theme.kind === 'named'
        ? { kind: 'named', name: g.theme.name }
        : { kind: 'fixed', theme: g.theme.theme },
    format,
  };
}

const inOrder = <T>(ids: readonly Id[], map: ReadonlyMap<Id, T>): T[] =>
  ids.map((id) => map.get(id)).filter((x): x is T => x !== undefined);

export function writeBsig(saved: SavedProject): string {
  const { project: p } = saved;
  const results: Record<string, Json> = {};
  saved.results.forEach((r, id) => {
    if (keepsResult(p, id)) results[id] = r;
  });
  const doc: JsonObject = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    app: saved.app,
    engine: saved.engine as unknown as Json,
    project: {
      id: p.id,
      name: p.name,
      tables: inOrder(p.order.tables, p.tables).map(tableJson),
      analyses: inOrder(p.order.analyses, p.analyses).map(analysisJson),
      graphs: inOrder(p.order.graphs, p.graphs).map(graphJson),
      layouts: inOrder(p.order.layouts, p.layouts).map((l) => ({
        id: l.id,
        title: l.title,
        graphs: l.graphs,
      })),
      exports: p.exports.map((x) => ({
        id: x.id,
        graph: x.graph,
        exportedAt: x.exportedAt,
        fileName: x.fileName,
        format: x.format,
        dpi: x.dpi,
        size: { width: x.size.width, height: x.size.height },
        recipe: x.recipe,
      })),
    },
    results,
  };
  return JSON.stringify(doc);
}

// --- reading ------------------------------------------------------------------

/** Where in the file a problem is, for the error message. */
class Path {
  constructor(readonly at: string) {}
  key(k: string): Path {
    return new Path(`${this.at}.${k}`);
  }
  index(i: number): Path {
    return new Path(`${this.at}[${String(i)}]`);
  }
  fail(what: string): never {
    throw new BsigError(`This file is damaged: ${this.at} ${what}.`);
  }
}

function obj(v: Json | undefined, p: Path): JsonObject {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) p.fail('should be an object');
  return v as JsonObject;
}
function arr(v: Json | undefined, p: Path): readonly Json[] {
  if (!Array.isArray(v)) p.fail('should be a list');
  return v as readonly Json[];
}
function str(v: Json | undefined, p: Path): string {
  if (typeof v !== 'string') p.fail('should be text');
  return v;
}
function num(v: Json | undefined, p: Path): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) p.fail('should be a number');
  return v;
}
function bool(v: Json | undefined, p: Path): boolean {
  if (typeof v !== 'boolean') p.fail('should be true or false');
  return v;
}
const id = (v: Json | undefined, p: Path): Id => asId(str(v, p));
const optStr = (o: JsonObject, k: string, p: Path): string | undefined =>
  o[k] === undefined ? undefined : str(o[k], p.key(k));
const nullableStr = (v: Json | undefined, p: Path): string | null =>
  v === null ? null : str(v, p);
const list = <T>(v: Json | undefined, p: Path, f: (x: Json, p: Path) => T): T[] =>
  arr(v, p).map((x, i) => f(x, p.index(i)));

function withOptional<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) out[k] = v;
  return out as T;
}

function format(v: Json | undefined, p: Path): EntryFormat {
  const o = obj(v, p);
  const kind = str(o['kind'], p.key('kind'));
  if (kind === 'replicates') return { kind, count: num(o['count'], p.key('count')) };
  if (kind === 'summary') {
    const at: Path = p.key('stats');
    const stats = str(o['stats'], at);
    if (!(SUMMARY_STATS as readonly string[]).includes(stats))
      at.fail(`is an unknown summary format "${stats}"`);
    return { kind, stats: stats as SummaryStats };
  }
  return p.key('kind').fail(`is an unknown data format "${kind}"`);
}

function cell(v: Json, p: Path): Cell {
  return v === null ? null : num(v, p);
}

function dataSet(v: Json, p: Path): DataSet {
  const o = obj(v, p);
  const base: DataSet = {
    id: id(o['id'], p.key('id')),
    title: str(o['title'], p.key('title')),
    subcolumns: list(o['subcolumns'], p.key('subcolumns'), (c, q) => list(c, q, cell)),
    excluded: new Set(
      list(o['excluded'], p.key('excluded'), (k, q) => {
        const s = str(k, q);
        if (!/^\d+:.+$/.test(s)) q.fail('is not a cell reference');
        return s as CellKey;
      }),
    ),
  };
  return withOptional(base, {
    color: optStr(o, 'color', p),
    decimals: o['decimals'] === undefined ? undefined : num(o['decimals'], p.key('decimals')),
  });
}

function row(v: Json, p: Path): Row {
  const o = obj(v, p);
  return { id: id(o['id'], p.key('id')), title: nullableStr(o['title'], p.key('title')) };
}

function table(v: Json, p: Path): Table {
  const o = obj(v, p);
  const typePath: Path = p.key('type');
  const type = str(o['type'], typePath);
  if (type !== 'column' && type !== 'grouped') {
    typePath.fail(`is a table type this version does not know ("${type}")`);
  }
  const base: Table = {
    id: id(o['id'], p.key('id')),
    type,
    title: str(o['title'], p.key('title')),
    format: format(o['format'], p.key('format')),
    rows: list(o['rows'], p.key('rows'), row),
    dataSets: list(o['dataSets'], p.key('dataSets'), dataSet),
  };
  return withOptional(base, {
    valueTitle: optStr(o, 'valueTitle', p),
    unit: optStr(o, 'unit', p),
    notes: optStr(o, 'notes', p),
  });
}

function spec(o: JsonObject, p: Path): AnalysisSpec {
  const kind = str(o['kind'], p.key('kind'));
  const q = p.key('options');
  const opts = obj(o['options'], q);
  switch (kind) {
    case 'descriptive':
    case 'normality':
      return { kind, options: {} };
    case 't-test': {
      const tailsPath: Path = q.key('tails');
      const tails = str(opts['tails'], tailsPath);
      if (tails !== 'one' && tails !== 'two') tailsPath.fail('should be "one" or "two"');
      const options: TTestOptions = {
        paired: bool(opts['paired'], q.key('paired')),
        welch: bool(opts['welch'], q.key('welch')),
        tails,
      };
      return { kind, options };
    }
    case 'one-way-anova': {
      const options: OneWayOptions = {
        welch: bool(opts['welch'], q.key('welch')),
        comparisons: comparisons(opts['comparisons'], q.key('comparisons')),
      };
      return { kind, options };
    }
    case 'two-way-anova': {
      const options: TwoWayOptions = {
        family: oneOf(opts['family'], q.key('family'), TWO_WAY_FAMILIES),
        comparisons: comparisons(opts['comparisons'], q.key('comparisons')),
      };
      return { kind, options };
    }
    case 'kruskal-wallis': {
      const cp = q.key('comparisons');
      const c = obj(opts['comparisons'], cp);
      const ck = oneOf(c['kind'], cp.key('kind'), ['none', 'all', 'control'] as const);
      const options: KruskalWallisOptions = {
        comparisons:
          ck === 'control'
            ? { kind: ck, control: id(c['control'], cp.key('control')) }
            : { kind: ck },
        corrected: bool(opts['corrected'], q.key('corrected')),
      };
      return { kind, options };
    }
    case 'rank-test': {
      const options: RankTestOptions = {
        paired: bool(opts['paired'], q.key('paired')),
        tails: oneOf(opts['tails'], q.key('tails'), ['two', 'one'] as const),
        zeros: oneOf(opts['zeros'], q.key('zeros'), ['wilcoxon', 'pratt'] as const),
      };
      return { kind, options };
    }
    default:
      return p.key('kind').fail(`is an analysis this version does not know ("${kind}")`);
  }
}

function comparisons(v: Json | undefined, p: Path): Comparisons {
  const o = obj(v, p);
  const kind = oneOf(o['kind'], p.key('kind'), ['none', 'all', 'control'] as const);
  switch (kind) {
    case 'none':
      return { kind };
    case 'all':
      return {
        kind,
        test: oneOf(o['test'], p.key('test'), [...EQUAL_SD_ALL, ...WELCH_ALL]),
      };
    case 'control':
      return {
        kind,
        control: id(o['control'], p.key('control')),
        test: oneOf(o['test'], p.key('test'), [...EQUAL_SD_CONTROL, ...WELCH_CONTROL]),
      };
  }
}

function analysisInput(v: Json | undefined, p: Path): AnalysisInput {
  const o = obj(v, p);
  const kind = str(o['kind'], p.key('kind'));
  if (kind === 'table') {
    return {
      kind,
      table: id(o['table'], p.key('table')),
      dataSets: list(o['dataSets'], p.key('dataSets'), id),
    };
  }
  if (kind === 'analysis') return { kind, analysis: id(o['analysis'], p.key('analysis')) };
  return p.key('kind').fail(`is an unknown input "${kind}"`);
}

function analysis(v: Json, p: Path): Analysis {
  const o = obj(v, p);
  return {
    ...spec(o, p),
    id: id(o['id'], p.key('id')),
    title: str(o['title'], p.key('title')),
    input: analysisInput(o['input'], p.key('input')),
  };
}

function graphSource(v: Json | undefined, p: Path): GraphSource {
  const o = obj(v, p);
  const kind = str(o['kind'], p.key('kind'));
  if (kind === 'table') return { kind, table: id(o['table'], p.key('table')) };
  if (kind === 'analysis') return { kind, analysis: id(o['analysis'], p.key('analysis')) };
  return p.key('kind').fail(`is an unknown graph source "${kind}"`);
}

const ERROR_BARS = ['sd', 'sem', 'ci95', 'range', 'none'] as const;

function oneOf<T extends string>(v: Json | undefined, p: Path, options: readonly T[]): T {
  const s = str(v, p);
  if (!(options as readonly string[]).includes(s)) p.fail(`should be one of ${options.join(', ')}`);
  return s as T;
}

function plot(v: Json | undefined, p: Path): ColumnPlot {
  const o = obj(v, p);
  const kind = oneOf(o['kind'], p.key('kind'), ['bars', 'dots', 'box', 'violin'] as const);
  switch (kind) {
    case 'bars':
      return {
        kind,
        error: oneOf(o['error'], p.key('error'), ERROR_BARS),
        points: bool(o['points'], p.key('points')),
      };
    case 'dots':
      return {
        kind,
        error: oneOf(o['error'], p.key('error'), ERROR_BARS),
        center: oneOf(o['center'], p.key('center'), ['mean', 'median'] as const),
      };
    case 'box':
      return {
        kind,
        whiskers: oneOf(o['whiskers'], p.key('whiskers'), WHISKERS),
        points: oneOf(o['points'], p.key('points'), ['none', 'outliers', 'all'] as const),
      };
    case 'violin': {
      const smoothing = num(o['smoothing'], p.key('smoothing'));
      if (!(smoothing > 0)) p.key('smoothing').fail('should be above 0');
      return {
        kind,
        inner: oneOf(o['inner'], p.key('inner'), ['quartiles', 'box', 'points', 'none'] as const),
        smoothing,
      };
    }
  }
}

function angle(v: Json | undefined, p: Path): 45 | 90 {
  const a = num(v, p);
  if (a !== 45 && a !== 90) p.fail('should be 45 or 90');
  return a;
}

function style(v: Json | undefined, p: Path): StyleOverrides {
  const o = obj(v, p);
  const out: Record<string, unknown> = {};
  for (const k of STYLE_NUMBERS) if (o[k] !== undefined) out[k] = num(o[k], p.key(k));
  if (o['ticks'] !== undefined)
    out['ticks'] = oneOf(o['ticks'], p.key('ticks'), ['in', 'out'] as const);
  if (o['spines'] !== undefined)
    out['spines'] = oneOf(o['spines'], p.key('spines'), ['left-bottom', 'box'] as const);
  return out;
}

function record<V>(
  v: Json | undefined,
  p: Path,
  item: (x: Json | undefined, q: Path) => V,
): Readonly<Record<string, V>> {
  const out: Record<string, V> = {};
  for (const [k, x] of Object.entries(obj(v, p))) out[k] = item(x, p.key(k));
  return out;
}

function graph(v: Json, p: Path): Graph {
  const o = obj(v, p);
  const size = obj(o['size'], p.key('size'));
  const theme = obj(o['theme'], p.key('theme'));
  const tp: Path = p.key('theme');
  const themeKind = oneOf(theme['kind'], tp.key('kind'), ['named', 'fixed'] as const);
  const f = obj(o['format'], p.key('format'));
  const fp: Path = p.key('format');
  const format: GraphFormat = withOptional(
    {
      bracketLabels: oneOf(f['bracketLabels'], fp.key('bracketLabels'), [
        'stars',
        'exact',
      ] as const),
      showNs: bool(f['showNs'], fp.key('showNs')),
      hiddenBrackets: list(f['hiddenBrackets'], fp.key('hiddenBrackets'), id),
    },
    {
      starScheme:
        f['starScheme'] === undefined
          ? undefined
          : oneOf(f['starScheme'], fp.key('starScheme'), ['apa'] as const),
      yTitle: optStr(f, 'yTitle', fp),
      yMin: f['yMin'] === undefined ? undefined : num(f['yMin'], fp.key('yMin')),
      yMax: f['yMax'] === undefined ? undefined : num(f['yMax'], fp.key('yMax')),
      yScale:
        f['yScale'] === undefined
          ? undefined
          : oneOf(f['yScale'], fp.key('yScale'), ['log10'] as const),
      yStep: f['yStep'] === undefined ? undefined : num(f['yStep'], fp.key('yStep')),
      yDecimals:
        f['yDecimals'] === undefined ? undefined : num(f['yDecimals'], fp.key('yDecimals')),
      xAngle: f['xAngle'] === undefined ? undefined : angle(f['xAngle'], fp.key('xAngle')),
      showTitle:
        f['showTitle'] === undefined ? undefined : bool(f['showTitle'], fp.key('showTitle')),
      style: f['style'] === undefined ? undefined : style(f['style'], fp.key('style')),
      symbols:
        f['symbols'] === undefined
          ? undefined
          : record(f['symbols'], fp.key('symbols'), (v, q): PointSymbol =>
              oneOf(v, q, POINT_SYMBOLS),
            ),
      bracketOffsets:
        f['bracketOffsets'] === undefined
          ? undefined
          : record(f['bracketOffsets'], fp.key('bracketOffsets'), num),
    },
  );
  return {
    id: id(o['id'], p.key('id')),
    title: str(o['title'], p.key('title')),
    source: graphSource(o['source'], p.key('source')),
    dataSets: o['dataSets'] === null ? null : list(o['dataSets'], p.key('dataSets'), id),
    analyses: list(o['analyses'], p.key('analyses'), id),
    plot: plot(o['plot'], p.key('plot')),
    size: {
      width: num(size['width'], p.key('size').key('width')),
      height: num(size['height'], p.key('size').key('height')),
    },
    theme:
      themeKind === 'named'
        ? {
            kind: 'named',
            name: oneOf(theme['name'], tp.key('name'), ['modern', 'classic'] as const),
          }
        : { kind: 'fixed', theme: obj(theme['theme'], tp.key('theme')) },
    format,
  };
}

function layout(v: Json, p: Path): Layout {
  const o = obj(v, p);
  return {
    id: id(o['id'], p.key('id')),
    title: str(o['title'], p.key('title')),
    graphs: list(o['graphs'], p.key('graphs'), id),
  };
}

function exportRecord(v: Json, p: Path): ExportRecord {
  const o = obj(v, p);
  const size = obj(o['size'], p.key('size'));
  return {
    id: id(o['id'], p.key('id')),
    graph: id(o['graph'], p.key('graph')),
    exportedAt: str(o['exportedAt'], p.key('exportedAt')),
    fileName: str(o['fileName'], p.key('fileName')),
    format: oneOf(o['format'], p.key('format'), ['svg', 'png'] as const),
    dpi: o['dpi'] === null ? null : num(o['dpi'], p.key('dpi')),
    size: {
      width: num(size['width'], p.key('size').key('width')),
      height: num(size['height'], p.key('size').key('height')),
    },
    recipe: o['recipe'] ?? null,
  };
}

function engine(v: Json | undefined, p: Path): EngineInfo | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, p);
  const packages: Record<string, string> = {};
  const q = p.key('packages');
  for (const [k, x] of Object.entries(obj(o['packages'], q))) packages[k] = str(x, q.key(k));
  const base = { webr: str(o['webr'], p.key('webr')), r: str(o['r'], p.key('r')), packages };
  if (o['code'] === undefined) return base;
  const code: Record<string, string> = {};
  const c = p.key('code');
  for (const [k, x] of Object.entries(obj(o['code'], c))) code[k] = str(x, c.key(k));
  return { ...base, code };
}

function result(v: Json, p: Path): ResultEntry {
  const o = obj(v, p);
  const inputHash = str(o['inputHash'], p.key('inputHash'));
  return bool(o['ok'], p.key('ok'))
    ? { inputHash, ok: true, value: o['value'] ?? null }
    : { inputHash, ok: false, error: str(o['error'], p.key('error')) };
}

function byId<T extends { readonly id: Id }>(items: readonly T[]): Map<Id, T> {
  return new Map(items.map((x) => [x.id, x]));
}

/** Runs a document through the migration chain up to the current schema. */
export function migrate(
  doc: JsonObject,
  migrations: readonly Migration[] = MIGRATIONS,
): JsonObject {
  const current = migrations.length + 1;
  const v = doc['schemaVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new BsigError('This file is damaged: it has no valid schema version.');
  }
  if (v > current) {
    throw new BsigError(
      `This project was saved by a newer version of BarelySig (file format ${String(v)}; ` +
        `this version opens up to ${String(current)}). Reload the page to update the app, then open it again.`,
    );
  }
  let out = doc;
  for (let i = v - 1; i < migrations.length; i += 1) {
    const step = migrations[i];
    if (step) out = { ...step(out), schemaVersion: i + 2 };
  }
  return out;
}

export function readBsig(text: string): SavedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BsigError('This is not a BarelySig project file (it is not valid JSON).');
  }
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    (raw as JsonObject)['format'] !== FORMAT
  ) {
    throw new BsigError('This is not a BarelySig project file.');
  }
  const doc = migrate(raw as JsonObject);
  const root = new Path('file');
  const po = obj(doc['project'], root.key('project'));
  const pp = root.key('project');
  const tables = list(po['tables'], pp.key('tables'), table);
  const analyses = list(po['analyses'], pp.key('analyses'), analysis);
  const graphs = list(po['graphs'], pp.key('graphs'), graph);
  const layouts = list(po['layouts'], pp.key('layouts'), layout);
  const project: Project = {
    id: id(po['id'], pp.key('id')),
    name: str(po['name'], pp.key('name')),
    tables: byId(tables),
    analyses: byId(analyses),
    graphs: byId(graphs),
    layouts: byId(layouts),
    order: {
      tables: tables.map((x) => x.id),
      analyses: analyses.map((x) => x.id),
      graphs: graphs.map((x) => x.id),
      layouts: layouts.map((x) => x.id),
    },
    exports: list(po['exports'], pp.key('exports'), exportRecord),
  };
  const problems = validateProject(project);
  if (problems.length > 0)
    throw new BsigError(`This file is damaged: ${problems.slice(0, 3).join('; ')}.`);

  const results = new Map<Id, ResultEntry>();
  const ro = doc['results'] === undefined ? {} : obj(doc['results'], root.key('results'));
  for (const [k, v] of Object.entries(ro)) {
    // Results of analyses the file no longer has are ignored, not an error.
    if (keepsResult(project, asId(k))) results.set(asId(k), result(v, root.key('results').key(k)));
  }
  return {
    project,
    results,
    engine: engine(doc['engine'], root.key('engine')),
    app: str(doc['app'], root.key('app')),
  };
}
