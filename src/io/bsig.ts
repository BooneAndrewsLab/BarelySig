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
import type {
  Analysis,
  AnalysisInput,
  AnalysisSpec,
  ExportRecord,
  Graph,
  GraphSource,
  Layout,
  Project,
  TTestOptions,
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
  return { id: a.id, title: a.title, kind: a.kind, options: { ...a.options }, input };
}

function graphJson(g: Graph): Json {
  const source: Json =
    g.source.kind === 'table'
      ? { kind: 'table', table: g.source.table }
      : { kind: 'analysis', analysis: g.source.analysis };
  return { id: g.id, title: g.title, source, analyses: g.analyses };
}

const inOrder = <T>(ids: readonly Id[], map: ReadonlyMap<Id, T>): T[] =>
  ids.map((id) => map.get(id)).filter((x): x is T => x !== undefined);

export function writeBsig(saved: SavedProject): string {
  const { project: p } = saved;
  const results: Record<string, Json> = {};
  saved.results.forEach((r, id) => {
    if (p.analyses.has(id)) results[id] = r;
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
    default:
      return p.key('kind').fail(`is an analysis this version does not know ("${kind}")`);
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

function graph(v: Json, p: Path): Graph {
  const o = obj(v, p);
  return {
    id: id(o['id'], p.key('id')),
    title: str(o['title'], p.key('title')),
    source: graphSource(o['source'], p.key('source')),
    analyses: list(o['analyses'], p.key('analyses'), id),
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
  return {
    id: id(o['id'], p.key('id')),
    graph: id(o['graph'], p.key('graph')),
    exportedAt: str(o['exportedAt'], p.key('exportedAt')),
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
    if (project.analyses.has(asId(k))) results.set(asId(k), result(v, root.key('results').key(k)));
  }
  return {
    project,
    results,
    engine: engine(doc['engine'], root.key('engine')),
    app: str(doc['app'], root.key('app')),
  };
}
