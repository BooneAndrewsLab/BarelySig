/**
 * Every change to a project is a named edit (item 02), applied by
 * `applyEdit`, which returns a new project and leaves the old one as it
 * was. Undo keeps past projects; the edit's `op` names what it undoes and
 * is what analytics may count, never the contents.
 *
 * An edit that would break an invariant (an unknown id, a cell that is not
 * a finite number, a reference cycle) throws `EditError` and changes
 * nothing, so the grid and dialogs can say why.
 */
import { wouldCycle } from './deps';
import { type Id, newId } from './ids';
import type { Cell } from './missing';
import type { Analysis, ExportRecord, Graph, Project } from './project';
import {
  type CellKey,
  type DataSet,
  type EntryFormat,
  type Row,
  type Table,
  cellKey,
  emptyColumn,
  parseCellKey,
  subcolumnCount,
  summarySubcolumns,
} from './table';
import { validateTable } from './validate';

export interface CellWrite {
  readonly dataSet: Id;
  readonly subcolumn: number;
  readonly row: Id;
  readonly value: Cell;
}

export interface CellRef {
  readonly subcolumn: number;
  readonly row: Id;
}

export type Edit =
  | { readonly op: 'renameProject'; readonly name: string }
  | { readonly op: 'addTable'; readonly table: Table; readonly at?: number }
  | { readonly op: 'removeTable'; readonly table: Id }
  | { readonly op: 'moveTable'; readonly table: Id; readonly to: number }
  | {
      readonly op: 'setTableInfo';
      readonly table: Id;
      readonly title?: string;
      /** null clears. */
      readonly valueTitle?: string | null;
      readonly unit?: string | null;
      readonly notes?: string | null;
    }
  | { readonly op: 'setCells'; readonly table: Id; readonly cells: readonly CellWrite[] }
  | {
      readonly op: 'insertRows';
      readonly table: Id;
      readonly at: number;
      readonly rows: readonly Row[];
    }
  | { readonly op: 'deleteRows'; readonly table: Id; readonly rows: readonly Id[] }
  | {
      readonly op: 'setRowTitle';
      readonly table: Id;
      readonly row: Id;
      readonly title: string | null;
    }
  | {
      readonly op: 'addDataSet';
      readonly table: Id;
      readonly at: number;
      readonly id: Id;
      readonly title: string;
    }
  | { readonly op: 'removeDataSet'; readonly table: Id; readonly dataSet: Id }
  | { readonly op: 'moveDataSet'; readonly table: Id; readonly dataSet: Id; readonly to: number }
  | {
      readonly op: 'setDataSet';
      readonly table: Id;
      readonly dataSet: Id;
      readonly title?: string;
      /** null clears: back to the theme's palette / default display. */
      readonly color?: string | null;
      readonly decimals?: number | null;
    }
  | {
      readonly op: 'setExcluded';
      readonly table: Id;
      readonly dataSet: Id;
      readonly cells: readonly CellRef[];
      readonly excluded: boolean;
    }
  | { readonly op: 'setFormat'; readonly table: Id; readonly format: EntryFormat }
  | { readonly op: 'addAnalysis'; readonly analysis: Analysis }
  | { readonly op: 'setAnalysis'; readonly analysis: Analysis }
  | { readonly op: 'removeAnalysis'; readonly analysis: Id }
  | { readonly op: 'addGraph'; readonly graph: Graph }
  | { readonly op: 'setGraph'; readonly graph: Graph }
  | { readonly op: 'removeGraph'; readonly graph: Id }
  | { readonly op: 'addExport'; readonly record: ExportRecord }
  /** Several edits as one undo step, e.g. a paste that also adds rows. All or nothing. */
  | { readonly op: 'batch'; readonly label: string; readonly edits: readonly Edit[] };

export type EditOp = Edit['op'];

export class EditError extends Error {
  override readonly name = 'EditError';
}

/** Plain-language name of an edit, for "Undo …". */
export function describeEdit(edit: Edit): string {
  if (edit.op === 'batch') return edit.label;
  return LABELS[edit.op];
}

const LABELS: Readonly<Record<Exclude<EditOp, 'batch'>, string>> = {
  renameProject: 'Rename project',
  addTable: 'New table',
  removeTable: 'Delete table',
  moveTable: 'Move table',
  setTableInfo: 'Edit table info',
  setCells: 'Edit cells',
  insertRows: 'Insert rows',
  deleteRows: 'Delete rows',
  setRowTitle: 'Edit row title',
  addDataSet: 'Add data set',
  removeDataSet: 'Delete data set',
  moveDataSet: 'Move data set',
  setDataSet: 'Edit data set',
  setExcluded: 'Exclude values',
  setFormat: 'Change data format',
  addAnalysis: 'New analysis',
  setAnalysis: 'Change analysis',
  removeAnalysis: 'Delete analysis',
  addGraph: 'New graph',
  setGraph: 'Change graph',
  removeGraph: 'Delete graph',
  addExport: 'Export',
};

export function applyEdit(project: Project, edit: Edit): Project {
  switch (edit.op) {
    case 'renameProject':
      return { ...project, name: edit.name };
    case 'addTable':
      return addTable(project, edit.table, edit.at);
    case 'removeTable':
      return removeTable(project, edit.table);
    case 'moveTable':
      requireTable(project, edit.table);
      return {
        ...project,
        order: { ...project.order, tables: move(project.order.tables, edit.table, edit.to) },
      };
    case 'setTableInfo':
      return updateTable(project, edit.table, (t) => {
        let out: Table = edit.title === undefined ? t : { ...t, title: edit.title };
        out = patchOptional(out, 'valueTitle', edit.valueTitle);
        out = patchOptional(out, 'unit', edit.unit);
        return patchOptional(out, 'notes', edit.notes);
      });
    case 'setCells':
      return updateTable(project, edit.table, (t) => setCells(t, edit.cells));
    case 'insertRows':
      return insertRows(project, edit.table, edit.at, edit.rows);
    case 'deleteRows':
      return updateTable(project, edit.table, (t) => deleteRows(t, edit.rows));
    case 'setRowTitle':
      return updateTable(project, edit.table, (t) => {
        requireRow(t, edit.row);
        return {
          ...t,
          rows: t.rows.map((r) => (r.id === edit.row ? { ...r, title: edit.title } : r)),
        };
      });
    case 'addDataSet':
      return addDataSet(project, edit.table, edit.at, edit.id, edit.title);
    case 'removeDataSet':
      return removeDataSet(project, edit.table, edit.dataSet);
    case 'moveDataSet':
      return updateTable(project, edit.table, (t) => {
        const ds = requireDataSet(t, edit.dataSet);
        const ids = move(
          t.dataSets.map((d) => d.id),
          ds.id,
          edit.to,
        );
        return { ...t, dataSets: ids.map((id) => requireDataSet(t, id)) };
      });
    case 'setDataSet':
      return updateDataSet(project, edit.table, edit.dataSet, (d) => {
        let out: DataSet = edit.title === undefined ? d : { ...d, title: edit.title };
        if (edit.decimals !== undefined && edit.decimals !== null) {
          if (!Number.isInteger(edit.decimals) || edit.decimals < 0 || edit.decimals > 15) {
            throw new EditError(
              `Decimals must be a whole number from 0 to 15, not ${String(edit.decimals)}.`,
            );
          }
        }
        out = patchOptional(out, 'color', edit.color);
        return patchOptional(out, 'decimals', edit.decimals);
      });
    case 'setExcluded':
      return updateTable(project, edit.table, (t) =>
        setExcluded(t, edit.dataSet, edit.cells, edit.excluded),
      );
    case 'setFormat':
      return updateTable(project, edit.table, (t) => setFormat(t, edit.format));
    case 'addAnalysis':
      if (project.analyses.has(edit.analysis.id))
        throw new EditError(`Analysis ${edit.analysis.id} already exists.`);
      requireFreshId(project, edit.analysis.id);
      checkAnalysis(project, edit.analysis);
      return {
        ...project,
        analyses: withEntry(project.analyses, edit.analysis),
        order: { ...project.order, analyses: [...project.order.analyses, edit.analysis.id] },
      };
    case 'setAnalysis':
      if (!project.analyses.has(edit.analysis.id))
        throw new EditError(`No analysis ${edit.analysis.id}.`);
      checkAnalysis(project, edit.analysis);
      return { ...project, analyses: withEntry(project.analyses, edit.analysis) };
    case 'removeAnalysis':
      if (!project.analyses.has(edit.analysis))
        throw new EditError(`No analysis ${edit.analysis}.`);
      return removeNodes(project, edit.analysis);
    case 'addGraph':
      if (project.graphs.has(edit.graph.id))
        throw new EditError(`Graph ${edit.graph.id} already exists.`);
      requireFreshId(project, edit.graph.id);
      checkGraph(project, edit.graph);
      return {
        ...project,
        graphs: withEntry(project.graphs, edit.graph),
        order: { ...project.order, graphs: [...project.order.graphs, edit.graph.id] },
      };
    case 'setGraph':
      if (!project.graphs.has(edit.graph.id)) throw new EditError(`No graph ${edit.graph.id}.`);
      checkGraph(project, edit.graph);
      return { ...project, graphs: withEntry(project.graphs, edit.graph) };
    case 'removeGraph':
      if (!project.graphs.has(edit.graph)) throw new EditError(`No graph ${edit.graph}.`);
      return removeNodes(project, edit.graph);
    case 'addExport':
      requireFreshId(project, edit.record.id);
      return { ...project, exports: [...project.exports, edit.record] };
    case 'batch':
      return edit.edits.reduce(applyEdit, project);
  }
}

// --- helpers ------------------------------------------------------------------

function withEntry<T extends { readonly id: Id }>(map: ReadonlyMap<Id, T>, value: T): Map<Id, T> {
  const out = new Map(map);
  out.set(value.id, value);
  return out;
}

/** Sets an optional field; `null` removes it, `undefined` leaves it as is. */
function patchOptional<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | null | undefined,
): T {
  if (value === undefined) return obj;
  if (value === null) {
    const { [key]: _removed, ...rest } = obj;
    return rest as T;
  }
  return { ...obj, [key]: value };
}

function move(ids: readonly Id[], id: Id, to: number): Id[] {
  if (!Number.isInteger(to) || to < 0 || to >= ids.length)
    throw new EditError(`Position ${String(to)} is out of range.`);
  const rest = ids.filter((x) => x !== id);
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

function requireTable(project: Project, id: Id): Table {
  const t = project.tables.get(id);
  if (!t) throw new EditError(`No table ${id}.`);
  return t;
}

function requireDataSet(table: Table, id: Id): DataSet {
  const d = table.dataSets.find((x) => x.id === id);
  if (!d) throw new EditError(`No data set ${id} in table "${table.title}".`);
  return d;
}

function requireRow(table: Table, id: Id): number {
  const i = table.rows.findIndex((r) => r.id === id);
  if (i < 0) throw new EditError(`No row ${id} in table "${table.title}".`);
  return i;
}

function allIds(project: Project): Set<Id> {
  const ids = new Set<Id>([project.id]);
  project.tables.forEach((t) => {
    ids.add(t.id);
    t.rows.forEach((r) => ids.add(r.id));
    t.dataSets.forEach((d) => ids.add(d.id));
  });
  project.analyses.forEach((a) => ids.add(a.id));
  project.graphs.forEach((g) => ids.add(g.id));
  project.layouts.forEach((l) => ids.add(l.id));
  project.exports.forEach((x) => ids.add(x.id));
  return ids;
}

function requireFreshId(project: Project, ...ids: readonly Id[]): void {
  const used = allIds(project);
  const mine = new Set<Id>();
  for (const id of ids) {
    if (used.has(id) || mine.has(id)) throw new EditError(`Id ${id} is already in use.`);
    mine.add(id);
  }
}

function updateTable(project: Project, id: Id, fn: (t: Table) => Table): Project {
  const next = fn(requireTable(project, id));
  return { ...project, tables: withEntry(project.tables, next) };
}

function updateDataSet(project: Project, table: Id, id: Id, fn: (d: DataSet) => DataSet): Project {
  return updateTable(project, table, (t) => {
    requireDataSet(t, id);
    return { ...t, dataSets: t.dataSets.map((d) => (d.id === id ? fn(d) : d)) };
  });
}

// --- tables -----------------------------------------------------------------

function addTable(project: Project, table: Table, at?: number): Project {
  const problems = validateTable(table);
  if (problems.length > 0) throw new EditError(`Not a valid table: ${problems.join('; ')}`);
  requireFreshId(
    project,
    table.id,
    ...table.rows.map((r) => r.id),
    ...table.dataSets.map((d) => d.id),
  );
  const pos = at ?? project.order.tables.length;
  if (!Number.isInteger(pos) || pos < 0 || pos > project.order.tables.length) {
    throw new EditError(`Position ${String(pos)} is out of range.`);
  }
  const tables = [...project.order.tables];
  tables.splice(pos, 0, table.id);
  return {
    ...project,
    tables: withEntry(project.tables, table),
    order: { ...project.order, tables },
  };
}

/**
 * Removes nodes and everything downstream of them: analyses and graphs
 * that read them. A graph that only draws a removed analysis (brackets)
 * loses that analysis instead of going; a layout loses removed graphs.
 */
function removeNodes(project: Project, id: Id): Project {
  const drop = new Set<Id>([id]);
  // Graphs draw analyses without depending on them for their data, so
  // follow data dependencies only: analyses reading analyses, and sources.
  const visit = (node: Id): void => {
    project.analyses.forEach((a) => {
      const src = a.input.kind === 'table' ? a.input.table : a.input.analysis;
      if (src === node && !drop.has(a.id)) {
        drop.add(a.id);
        visit(a.id);
      }
    });
  };
  visit(id);
  project.graphs.forEach((g) => {
    const src = g.source.kind === 'table' ? g.source.table : g.source.analysis;
    if (drop.has(src)) drop.add(g.id);
  });

  const tables = new Map(project.tables);
  const analyses = new Map(project.analyses);
  const graphs = new Map<Id, Graph>();
  drop.forEach((d) => {
    tables.delete(d);
    analyses.delete(d);
  });
  project.graphs.forEach((g) => {
    if (drop.has(g.id)) return;
    const kept = g.analyses.filter((a) => !drop.has(a));
    graphs.set(g.id, kept.length === g.analyses.length ? g : { ...g, analyses: kept });
  });
  const layouts = new Map(project.layouts);
  layouts.forEach((l) => {
    const kept = l.graphs.filter((g) => !drop.has(g));
    if (kept.length !== l.graphs.length) layouts.set(l.id, { ...l, graphs: kept });
  });
  const keep = (ids: readonly Id[]): Id[] => ids.filter((x) => !drop.has(x));
  return {
    ...project,
    tables,
    analyses,
    graphs,
    layouts,
    order: {
      tables: keep(project.order.tables),
      analyses: keep(project.order.analyses),
      graphs: keep(project.order.graphs),
      layouts: project.order.layouts,
    },
  };
}

function removeTable(project: Project, id: Id): Project {
  requireTable(project, id);
  return removeNodes(project, id);
}

function setCells(table: Table, writes: readonly CellWrite[]): Table {
  if (writes.length === 0) return table;
  const rowAt = new Map(table.rows.map((r, i) => [r.id, i]));
  const byDataSet = new Map<Id, CellWrite[]>();
  for (const w of writes) {
    if (w.value !== null && !(typeof w.value === 'number' && Number.isFinite(w.value))) {
      throw new EditError(`A cell holds a number or is empty; ${String(w.value)} is neither.`);
    }
    const list = byDataSet.get(w.dataSet) ?? [];
    list.push(w);
    byDataSet.set(w.dataSet, list);
  }
  const dataSets = table.dataSets.map((d) => {
    const list = byDataSet.get(d.id);
    if (!list) return d;
    const cols = d.subcolumns.map((c) => c.slice());
    let excluded: Set<CellKey> | null = null;
    for (const w of list) {
      const r = rowAt.get(w.row);
      const col = cols[w.subcolumn];
      if (r === undefined) throw new EditError(`No row ${w.row} in table "${table.title}".`);
      if (col === undefined)
        throw new EditError(`No subcolumn ${String(w.subcolumn)} in data set "${d.title}".`);
      // -0 is 0 to the user, and JSON cannot tell them apart.
      col[r] = w.value === 0 ? 0 : w.value;
      const key = cellKey(w.subcolumn, w.row);
      // A new value is new data: it is not excluded.
      if (d.excluded.has(key)) {
        excluded ??= new Set(d.excluded);
        excluded.delete(key);
      }
    }
    return { ...d, subcolumns: cols, excluded: excluded ?? d.excluded };
  });
  for (const id of byDataSet.keys()) requireDataSet(table, id);
  return { ...table, dataSets };
}

function insertRows(project: Project, id: Id, at: number, rows: readonly Row[]): Project {
  const t = requireTable(project, id);
  if (t.type === 'column' && t.format.kind === 'summary') {
    throw new EditError('A Column table of summary data has exactly one row.');
  }
  if (!Number.isInteger(at) || at < 0 || at > t.rows.length)
    throw new EditError(`Row position ${String(at)} is out of range.`);
  requireFreshId(project, ...rows.map((r) => r.id));
  const blanks = rows.map(() => null);
  const table: Table = {
    ...t,
    rows: [...t.rows.slice(0, at), ...rows, ...t.rows.slice(at)],
    dataSets: t.dataSets.map((d) => ({
      ...d,
      subcolumns: d.subcolumns.map((c) => [...c.slice(0, at), ...blanks, ...c.slice(at)]),
    })),
  };
  return { ...project, tables: withEntry(project.tables, table) };
}

function deleteRows(table: Table, ids: readonly Id[]): Table {
  if (ids.length === 0) return table;
  const gone = new Set(ids);
  ids.forEach((r) => requireRow(table, r));
  if (table.type === 'column' && table.format.kind === 'summary') {
    throw new EditError('A Column table of summary data has exactly one row.');
  }
  const keep = table.rows.map((r) => !gone.has(r.id));
  return {
    ...table,
    rows: table.rows.filter((_, i) => keep[i]),
    dataSets: table.dataSets.map((d) => ({
      ...d,
      subcolumns: d.subcolumns.map((c) => c.filter((_, i) => keep[i])),
      excluded: pruneExcluded(d.excluded, (k) => !gone.has(parseCellKey(k).row)),
    })),
  };
}

function pruneExcluded(
  excluded: ReadonlySet<CellKey>,
  keep: (k: CellKey) => boolean,
): ReadonlySet<CellKey> {
  const out = new Set([...excluded].filter(keep));
  return out.size === excluded.size ? excluded : out;
}

function addDataSet(project: Project, tableId: Id, at: number, id: Id, title: string): Project {
  const t = requireTable(project, tableId);
  if (!Number.isInteger(at) || at < 0 || at > t.dataSets.length)
    throw new EditError(`Position ${String(at)} is out of range.`);
  requireFreshId(project, id);
  const ds: DataSet = {
    id,
    title,
    subcolumns: Array.from({ length: subcolumnCount(t.format) }, () => emptyColumn(t.rows.length)),
    excluded: new Set(),
  };
  const table: Table = {
    ...t,
    dataSets: [...t.dataSets.slice(0, at), ds, ...t.dataSets.slice(at)],
  };
  return { ...project, tables: withEntry(project.tables, table) };
}

/** Removes a data set; analyses that read it stop reading it (they may then have too few to run). */
function removeDataSet(project: Project, tableId: Id, id: Id): Project {
  const t = requireTable(project, tableId);
  requireDataSet(t, id);
  const analyses = new Map(project.analyses);
  analyses.forEach((a) => {
    if (a.input.kind === 'table' && a.input.table === tableId && a.input.dataSets.includes(id)) {
      analyses.set(a.id, {
        ...a,
        input: { ...a.input, dataSets: a.input.dataSets.filter((x) => x !== id) },
      });
    }
  });
  const graphs = new Map(project.graphs);
  graphs.forEach((g) => {
    if (g.source.kind === 'table' && g.source.table === tableId && g.dataSets?.includes(id)) {
      graphs.set(g.id, { ...g, dataSets: g.dataSets.filter((x) => x !== id) });
    }
  });
  const table: Table = { ...t, dataSets: t.dataSets.filter((d) => d.id !== id) };
  return { ...project, tables: withEntry(project.tables, table), analyses, graphs };
}

function setExcluded(table: Table, id: Id, cells: readonly CellRef[], excluded: boolean): Table {
  const d = requireDataSet(table, id);
  const set = new Set(d.excluded);
  for (const c of cells) {
    const r = requireRow(table, c.row);
    const col = d.subcolumns[c.subcolumn];
    if (col === undefined)
      throw new EditError(`No subcolumn ${String(c.subcolumn)} in data set "${d.title}".`);
    const key = cellKey(c.subcolumn, c.row);
    // Empty cells have nothing to exclude; skip them so a selection can span blanks.
    if (excluded && col[r] !== null) set.add(key);
    else set.delete(key);
  }
  return {
    ...table,
    dataSets: table.dataSets.map((x) => (x.id === id ? { ...x, excluded: set } : x)),
  };
}

/**
 * Changes what the subcolumns hold. Values carry over where they mean
 * the same thing under both formats: replicates when only their count
 * changes; mean, n, and a matching SD/SEM/CV between summary formats.
 * Everything else starts empty (the user can undo). A Column table going
 * to summary data keeps only its first row.
 */
function setFormat(table: Table, format: EntryFormat): Table {
  if (format.kind === 'replicates' && (!Number.isInteger(format.count) || format.count < 1)) {
    throw new EditError('The number of replicates must be a whole number of at least 1.');
  }
  if (table.type === 'column' && format.kind === 'replicates' && format.count !== 1) {
    throw new EditError('A Column table has its replicates down the rows, in one subcolumn.');
  }
  if (table.type === 'nested' && format.kind === 'summary') {
    throw new EditError('A Nested table needs individual values, not summary data.');
  }
  let rows = table.rows;
  if (table.type === 'column' && format.kind === 'summary') {
    rows = rows.length > 0 ? rows.slice(0, 1) : [{ id: newId('r'), title: null }];
  }
  const n = rows.length;
  const from = table.format;
  // For each new subcolumn, which old one it takes its values from (or none).
  const source: (number | null)[] = Array.from({ length: subcolumnCount(format) }, (_, s) => {
    if (from.kind === 'replicates' && format.kind === 'replicates')
      return s < from.count ? s : null;
    if (from.kind === 'summary' && format.kind === 'summary') {
      const old = summarySubcolumns(from.stats);
      const i = old.indexOf(summarySubcolumns(format.stats)[s] ?? 'mean');
      return i < 0 ? null : i;
    }
    return null;
  });
  const dataSets = table.dataSets.map((d) => {
    const excluded = new Set<CellKey>();
    const subcolumns = source.map((src, s) => {
      if (src === null) return emptyColumn(n);
      for (const r of rows) if (d.excluded.has(cellKey(src, r.id))) excluded.add(cellKey(s, r.id));
      return (d.subcolumns[src] ?? emptyColumn(n)).slice(0, n);
    });
    return { ...d, subcolumns, excluded };
  });
  if (table.type === 'nested' && table.replicateTitles) {
    const replicateTitles = source.map((src) =>
      src === null ? null : (table.replicateTitles?.[src] ?? null),
    );
    return { ...table, format, rows, dataSets, replicateTitles };
  }
  return { ...table, format, rows, dataSets };
}

// --- analyses and graphs ------------------------------------------------------

function checkAnalysis(project: Project, a: Analysis): void {
  if (a.input.kind === 'table') {
    const t = requireTable(project, a.input.table);
    if (new Set(a.input.dataSets).size !== a.input.dataSets.length)
      throw new EditError('A data set is listed twice.');
    a.input.dataSets.forEach((d) => requireDataSet(t, d));
    return;
  }
  if (!project.analyses.has(a.input.analysis))
    throw new EditError(`No analysis ${a.input.analysis}.`);
  if (wouldCycle(project, a.id, a.input)) {
    throw new EditError(
      'An analysis cannot read its own results, directly or through other analyses.',
    );
  }
}

function checkGraph(project: Project, g: Graph): void {
  if (g.source.kind === 'table') {
    const t = requireTable(project, g.source.table);
    g.dataSets?.forEach((d) => requireDataSet(t, d));
  } else if (!project.analyses.has(g.source.analysis)) {
    throw new EditError(`No analysis ${g.source.analysis}.`);
  }
  for (const a of g.analyses)
    if (!project.analyses.has(a)) throw new EditError(`No analysis ${a}.`);
  if (!(g.size.width > 0 && g.size.height > 0 && g.size.width <= 1000 && g.size.height <= 1000)) {
    throw new EditError('A graph’s width and height must be between 0 and 1000 mm.');
  }
}
