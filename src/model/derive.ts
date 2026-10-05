/**
 * Calculated tables (item 43): a table made from another by a formula,
 * today Prism's Normalize. The result is an ordinary `Table` carrying
 * `derived`, recomputed from its source after every edit (`syncDerived`),
 * so analyses, graphs, results hashing and `.bsig` need no special cases.
 *
 * One formula covers every option: `y' = (y - zero) / (full - zero) * k`,
 * with k = 1 (fraction) or 100 (percent). A fold of a control has a `zero`
 * of 0 and the control as `full`.
 */
import { type Id, asId } from './ids';
import type { Project } from './project';
import {
  type Cell,
  type CellKey,
  type DataSet,
  type Derivation,
  type NormalizeOptions,
  type NormalizeRef,
  type Table,
  cellKey,
  isXyX,
  parseCellKey,
  summarySubcolumns,
} from './table';

/** The table types that can be normalised: not counts, not nested replicates. */
export const NORMALIZABLE: readonly Table['type'][] = ['column', 'grouped', 'xy'];

export const canNormalize = (table: Table): boolean => NORMALIZABLE.includes(table.type);

/** Stops the calculation with a message for the user. */
class Refuse extends Error {}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** One number per row: the mean of the replicates, or the mean of summary data. Null when none. */
function rowMeans(table: Table, d: DataSet): (number | null)[] {
  const subs = table.format.kind === 'summary' ? [0] : d.subcolumns.map((_, s) => s);
  return table.rows.map((row, r) => {
    const xs: number[] = [];
    for (const s of subs) {
      const v = d.subcolumns[s]?.[r] ?? null;
      if (v !== null && !d.excluded.has(cellKey(s, row.id))) xs.push(v);
    }
    return xs.length === 0 ? null : mean(xs);
  });
}

const present = (xs: readonly (number | null)[]): number[] =>
  xs.filter((x): x is number => x !== null);

const nameOf = (d: DataSet): string => `"${d.title}"`;

function scalar(
  table: Table,
  options: NormalizeOptions,
  ref: NormalizeRef,
  target: DataSet,
  row: number | null,
): number | null {
  if (ref.kind === 'value') return ref.value;
  if (ref.kind === 'dataSet') {
    const control = table.dataSets.find((d) => d.id === ref.dataSet);
    if (!control || isXyX(table, control.id))
      throw new Refuse('The control data set is no longer in the table.');
    const means = rowMeans(table, control);
    if (options.by === 'row') return means[row ?? 0] ?? null;
    const xs = present(means);
    if (xs.length === 0) throw new Refuse(`${nameOf(control)} has no values to use as a control.`);
    return mean(xs);
  }
  if (options.by === 'row')
    throw new Refuse('Each row against its own control needs a control data set or a value.');
  const means = rowMeans(table, target);
  const xs = present(means);
  if (xs.length === 0) throw new Refuse(`${nameOf(target)} has no values to use as a reference.`);
  switch (ref.kind) {
    case 'min':
      return Math.min(...xs);
    case 'max':
      return Math.max(...xs);
    case 'sum':
      return xs.reduce((a, b) => a + b, 0);
    case 'first':
    case 'last': {
      const v = ref.kind === 'first' ? means[0] : means[means.length - 1];
      if (v === null || v === undefined)
        throw new Refuse(
          `The ${ref.kind} row of ${nameOf(target)} is empty, so it can't be the reference.`,
        );
      return v;
    }
  }
}

function checkScale(zero: number, full: number, target: DataSet, where: string): number {
  const scale = full - zero;
  if (scale === 0 || !Number.isFinite(scale)) {
    throw new Refuse(
      zero === 0
        ? `The reference for ${nameOf(target)}${where} is ${String(full)}, so values can't be expressed relative to it.`
        : `For ${nameOf(target)}${where} the 100% reference equals the 0% reference (${String(full)}), so there is nothing to divide by.`,
    );
  }
  return scale;
}

const noNegZero = (x: number): number => (x === 0 ? 0 : x);

export interface Calculated {
  /** Subcolumns per data set of the source, same order and shape. */
  readonly cells: readonly (readonly (readonly Cell[])[])[];
  readonly problem: string | null;
}

/** The normalised cells of every data set of `source`, or all empty with the reason. */
export function calculateNormalize(source: Table, options: NormalizeOptions): Calculated {
  const blank = source.dataSets.map((d) => d.subcolumns.map((c) => c.map(() => null)));
  try {
    if (!canNormalize(source))
      throw new Refuse('Only Column, Grouped and XY tables can be normalised.');
    const summary = source.format.kind === 'summary' ? source.format.stats : null;
    if (summary !== null) {
      if (options.by === 'row')
        throw new Refuse(
          'Summary data (mean, SD) can be normalised as a whole, not row by row: a row-wise control has an error of its own that is not in the table.',
        );
      if (summary === 'mean-cv-n' || summary === 'mean-cv')
        throw new Refuse(
          'Change the data to mean with SD first: a CV cannot be normalised directly.',
        );
    }
    const k = options.unit === 'percent' ? 100 : 1;
    const cells = source.dataSets.map((d) => {
      if (isXyX(source, d.id)) return d.subcolumns;
      const whole = options.by === 'whole';
      const refs = whole
        ? (() => {
            const zero = scalar(source, options, options.zero, d, null);
            const full = scalar(source, options, options.full, d, null);
            if (zero === null || full === null) throw new Refuse('No reference value.');
            return { zero, full, scale: checkScale(zero, full, d, '') };
          })()
        : null;
      if (refs !== null && summary !== null && refs.scale < 0)
        throw new Refuse(
          `The 100% reference for ${nameOf(d)} is below the 0% reference, which would flip the SD; swap them.`,
        );
      const subKinds = summary === null ? null : summarySubcolumns(summary);
      // Per-row references, looked up once per row.
      const perRow = whole
        ? null
        : source.rows.map((row, r) => {
            const zero = scalar(source, options, options.zero, d, r);
            const full = scalar(source, options, options.full, d, r);
            if (zero === null || full === null) return null;
            return {
              zero,
              full,
              scale: checkScale(zero, full, d, ` in row ${row.title ?? String(r + 1)}`),
            };
          });
      return d.subcolumns.map((col, s) =>
        col.map((v, r): Cell => {
          const ref = refs ?? perRow?.[r] ?? null;
          if (
            v === null ||
            ref === null ||
            d.excluded.has(cellKey(s, source.rows[r]?.id ?? asId('')))
          ) {
            return null;
          }
          const kind = subKinds?.[s] ?? 'mean';
          if (kind === 'n') return v;
          if (kind === 'sd' || kind === 'sem') return noNegZero((v * k) / ref.scale);
          return noNegZero(((v - ref.zero) / ref.scale) * k);
        }),
      );
    });
    return { cells, problem: null };
  } catch (e) {
    if (e instanceof Refuse) return { cells: blank, problem: e.message };
    throw e;
  }
}

// --- the table ---------------------------------------------------------------

const mapId = (prefix: 'r' | 'ds', table: Id, source: Id): Id =>
  asId(`${prefix}_${table}.${source}`);

/** Default axis title of a normalised table, so graphs state it. */
export function normalizedTitle(options: NormalizeOptions): string {
  const pct = options.unit === 'percent';
  const zeroIsNothing = options.zero.kind === 'value' && options.zero.value === 0;
  if (zeroIsNothing)
    return options.full.kind === 'dataSet'
      ? pct
        ? '% of control'
        : 'Fold of control'
      : pct
        ? 'Normalized (% of reference)'
        : 'Normalized (fraction of reference)';
  return pct ? 'Normalized (% of range)' : 'Normalized (fraction of range)';
}

function describeRef(source: Table, ref: NormalizeRef): string {
  switch (ref.kind) {
    case 'value':
      return String(ref.value);
    case 'dataSet':
      return `the mean of "${source.dataSets.find((d) => d.id === ref.dataSet)?.title ?? '?'}"`;
    case 'min':
      return 'the smallest value of each data set';
    case 'max':
      return 'the largest value of each data set';
    case 'sum':
      return 'the sum of each data set';
    case 'first':
      return 'the first row of each data set';
    case 'last':
      return 'the last row of each data set';
  }
}

/** One plain sentence saying what was done, for the table page, results and the file. */
export function normalizeNote(source: Table | undefined, d: Derivation): string {
  const o = d.options;
  const name = source?.title ?? 'the original table';
  const unit = o.unit === 'percent' ? 'percent' : 'fractions';
  const how = o.by === 'row' ? 'each row against its own control' : 'each data set as a whole';
  if (!source) return `Normalized from ${name} (${unit}).`;
  const zero = o.zero.kind === 'value' && o.zero.value === 0;
  const body = zero
    ? `divided by ${describeRef(source, o.full)}`
    : `0 = ${describeRef(source, o.zero)}, 100% = ${describeRef(source, o.full)}`;
  return `Normalized from "${name}": ${body}, as ${unit}; ${how}.`;
}

/** Said under every analysis of a normalised table. */
export const NORMALIZE_CAVEAT =
  'The data set used as the reference becomes constant (SD 0), so it cannot be tested against itself. To compare it, test the original, un-normalized data.';

function sameCells(a: Table, b: Table): boolean {
  if (a.dataSets.length !== b.dataSets.length || a.rows.length !== b.rows.length) return false;
  const sameRows = a.rows.every((r, i) => {
    const q = b.rows[i];
    return r.id === q?.id && r.title === q.title;
  });
  if (!sameRows) return false;
  return a.dataSets.every((d, i) => {
    const e = b.dataSets[i];
    if (e === undefined) return false;
    return (
      d.id === e.id &&
      d.title === e.title &&
      d.color === e.color &&
      d.decimals === e.decimals &&
      d.subcolumns.length === e.subcolumns.length &&
      d.subcolumns.every((c, s) => c.every((v, r) => v === e.subcolumns[s]?.[r])) &&
      d.excluded.size === e.excluded.size
    );
  });
}

/**
 * The calculated table for `derived` over `source`; `existing` supplies what
 * the user may edit (title, notes, colours, decimals) and the id.
 */
export function buildDerived(
  source: Table,
  derived: Derivation,
  id: Id,
  existing: Table | undefined,
): Table {
  const { cells, problem } = calculateNormalize(source, derived.options);
  const dataSets = source.dataSets.map((d, i): DataSet => {
    const kept = existing?.dataSets.find((x) => x.id === mapId('ds', id, d.id));
    const x = isXyX(source, d.id);
    const excluded = x
      ? new Set<CellKey>(
          [...d.excluded].map((key) => {
            const p = parseCellKey(key);
            return cellKey(p.subcolumn, mapId('r', id, p.row));
          }),
        )
      : new Set<CellKey>();
    const base: DataSet = {
      id: mapId('ds', id, d.id),
      title: d.title,
      subcolumns: cells[i] ?? [],
      excluded,
    };
    const from = kept ?? d;
    return {
      ...base,
      ...(from.color === undefined ? {} : { color: from.color }),
      ...(from.decimals === undefined ? {} : { decimals: from.decimals }),
    };
  });
  const { derived: _d, valueTitle: _v, unit: _u, notes: _n, ...rest } = source;
  const optional = existing ?? { valueTitle: normalizedTitle(derived.options) };
  return {
    ...rest,
    id,
    title: existing?.title ?? `${source.title} (normalized)`,
    rows: source.rows.map((r) => ({ ...r, id: mapId('r', id, r.id) })),
    dataSets,
    derived: { ...derived, problem },
    ...(optional.valueTitle === undefined ? {} : { valueTitle: optional.valueTitle }),
    ...(existing?.unit === undefined ? {} : { unit: existing.unit }),
    ...(existing?.notes === undefined ? {} : { notes: existing.notes }),
  };
}

/** A new calculated table, to hand to the `addTable` edit. */
export function createNormalized(
  source: Table,
  options: NormalizeOptions,
  id: Id,
  title: string,
): Table {
  const built = buildDerived(
    source,
    { kind: 'normalize', source: source.id, options, problem: null },
    id,
    undefined,
  );
  return { ...built, title };
}

const memo = new WeakMap<Table, WeakMap<Table, Table>>();

/**
 * Brings every calculated table up to date with its source. Returns the
 * same project when nothing changed, and keeps a table's identity when its
 * numbers did not (graphs are cached per table object).
 */
export function syncDerived(project: Project): Project {
  const ids = [...project.tables.values()].filter((t) => t.derived !== undefined).map((t) => t.id);
  if (ids.length === 0) return project;
  let tables = project.tables;
  // A calculated table may read another: repeat until nothing moves.
  for (let pass = 0; pass <= ids.length; pass += 1) {
    let moved = false;
    for (const id of ids) {
      const t = tables.get(id);
      const d = t?.derived;
      const source = d && tables.get(d.source);
      if (!t || !d || !source) continue;
      let byExisting = memo.get(source);
      if (!byExisting) {
        byExisting = new WeakMap();
        memo.set(source, byExisting);
      }
      let next = byExisting.get(t);
      if (!next) {
        const built = buildDerived(source, d, id, t);
        next = sameCells(built, t) && built.derived?.problem === d.problem ? t : built;
        byExisting.set(t, next);
        byExisting.set(next, next);
      }
      if (next !== t) {
        if (tables === project.tables) tables = new Map(tables);
        (tables as Map<Id, Table>).set(id, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return tables === project.tables ? project : { ...project, tables };
}
