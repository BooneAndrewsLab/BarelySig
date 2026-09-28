/**
 * From a sheet of cells to a table (item 10, decisions 7–11): guess how
 * the sheet is laid out, and build the table a layout makes, with notes
 * on everything that was left out or reinterpreted. Pure: the dialog runs
 * `guessLayout` when a sheet is chosen and `buildTable` on every change.
 *
 * Cells are read with the paste parser (note 03), so a file and the same
 * block pasted agree. A cell that isn't a number is left empty and
 * marked, never read as 0.
 */
import { newId } from '@/model/ids';
import type { Cell } from '@/model/missing';
import {
  type DataSet,
  type EntryFormat,
  type SummaryStats,
  type SummarySubcolumn,
  type Table,
  newRows,
  summarySubcolumns,
} from '@/model/table';
import { detectDecimal } from '@/ui/grid/clipboard';
import { defaultTitle, letters } from '@/ui/grid/layout';
import { type DecimalSeparator, type Parsed, parseCell } from '@/ui/grid/numbers';

import type { SourceCell, SourceSheet } from './sheets';

export type LayoutKind = 'columns' | 'grouped' | 'nested' | 'summary' | 'long';

export const LAYOUTS: readonly LayoutKind[] = ['columns', 'grouped', 'nested', 'summary', 'long'];

/** Everything the dialog can change; a guess fills it in. */
export interface ImportChoice {
  readonly layout: LayoutKind;
  /** Rows ignored at the top of the sheet (a title, an instrument's preamble). */
  readonly skip: number;
  readonly decimal: DecimalSeparator;
  /** Columns and two-factor layouts: whether the first row holds titles. */
  readonly header: boolean;
  /** Long data: the columns (sheet indices) with the groups, the second factor and the values. */
  readonly groupColumn: number;
  readonly factorColumn: number | null;
  readonly valueColumn: number;
  /** Two factors: swap which one goes across (the data sets) and which down (the rows). */
  readonly swap: boolean;
}

/** A column of the sheet, for the long-data pickers. */
export interface SheetColumn {
  /** Index in the sheet. */
  readonly index: number;
  /** Its header, or "Column C". */
  readonly name: string;
  readonly numeric: boolean;
}

export interface Guess {
  readonly choice: ImportChoice;
  /** Layouts that make a table from this sheet, the guess first. */
  readonly possible: readonly LayoutKind[];
  readonly columns: readonly SheetColumn[];
}

export interface ImportNotes {
  readonly values: number;
  /** Missing markers (`NA`, `#DIV/0!`, …) read as empty, by marker. */
  readonly missing: ReadonlyMap<string, number>;
  /** Other text where a number was expected (up to three examples). */
  readonly text: { readonly count: number; readonly examples: readonly string[] };
  readonly percent: number;
  readonly decimal: DecimalSeparator;
  readonly skipped: number;
  /** Rows under the skipped ones the layout read as titles (0–2). */
  readonly titleRows: number;
  /** Columns left out, by name: not numbers, or not used by the layout. */
  readonly leftOut: readonly string[];
  /** Long data turned into a table. */
  readonly reshaped: boolean;
  /** Long data: rows without a group, left out. */
  readonly unlabelled: number;
  /** Long data with two factors, or summary rows: repeated combinations beyond the first, left out. */
  readonly repeats: number;
  /** A unit moved from the titles to the table's unit. */
  readonly unit: string | null;
  /** Summary data: statistics present in the file but not in the format used (SEM beside SD). */
  readonly unusedStats: readonly string[];
  readonly truncated: boolean;
}

export interface ImportResult {
  readonly table: Table;
  readonly notes: ImportNotes;
  /** Source text of cells that aren't numbers, by `markKey`, for the preview. */
  readonly marks: ReadonlyMap<string, string>;
}

/** Names a cell of the result: data set, subcolumn, row. */
export const markKey = (dataSet: number, subcolumn: number, row: number): string =>
  `${String(dataSet)}:${String(subcolumn)}:${String(row)}`;

// ---------------------------------------------------------------------------
// Cells

function parseSource(c: SourceCell | undefined, dec: DecimalSeparator): Parsed {
  if (c === undefined) return { kind: 'empty' };
  if (typeof c === 'number') return { kind: 'number', value: c, percent: false };
  if (typeof c === 'object') return { kind: 'number', value: c.percent, percent: true };
  return parseCell(c, dec);
}

/** A cell as a title: text trimmed, a number as written. */
function textOf(c: SourceCell | undefined): string {
  if (c === undefined) return '';
  if (typeof c === 'number') return String(c);
  if (typeof c === 'object') return `${String(c.percent)}%`;
  return c.trim();
}

const isBlank = (c: SourceCell | undefined): boolean => textOf(c) === '';

/** Text that isn't a number or a missing marker: a title or label. */
const isLabel = (p: Parsed): boolean => p.kind === 'text';

// ---------------------------------------------------------------------------
// The block of the sheet the layouts read

interface Block {
  /** Sheet rows from `skip`, trailing empty rows dropped. */
  readonly rows: readonly (readonly SourceCell[])[];
  readonly parsed: readonly (readonly Parsed[])[];
  /** Sheet column indices that hold anything. */
  readonly cols: readonly number[];
  readonly decimal: DecimalSeparator;
}

function makeBlock(sheet: SourceSheet, skip: number, dec: DecimalSeparator): Block {
  const rows = sheet.cells.slice(skip);
  let end = rows.length;
  while (end > 0 && (rows[end - 1] ?? []).every(isBlank)) end -= 1;
  const kept = rows.slice(0, end);
  const width = Math.max(0, ...kept.map((r) => r.length));
  const cols: number[] = [];
  for (let c = 0; c < width; c += 1) if (kept.some((r) => !isBlank(r[c]))) cols.push(c);
  return {
    rows: kept,
    parsed: kept.map((r) => cols.map((c) => parseSource(r[c], dec))),
    cols,
    decimal: dec,
  };
}

/** Parsed cell at block row r, block column j. */
const at = (b: Block, r: number, j: number): Parsed => b.parsed[r]?.[j] ?? { kind: 'empty' };
const rawAt = (b: Block, r: number, j: number): SourceCell | undefined => {
  const c = b.cols[j];
  return c === undefined ? undefined : b.rows[r]?.[c];
};

function columnName(b: Block, j: number, header: boolean): string {
  const t = header ? textOf(rawAt(b, 0, j)) : '';
  return t === '' ? `Column ${letters(b.cols[j] ?? j)}` : t;
}

/** Numbers among the filled cells of a block column, from row `from`. */
function numericShare(b: Block, j: number, from: number): { numbers: number; filled: number } {
  let numbers = 0;
  let filled = 0;
  for (let r = from; r < b.rows.length; r += 1) {
    const p = at(b, r, j);
    if (p.kind === 'empty') continue;
    filled += 1;
    if (p.kind === 'number') numbers += 1;
  }
  return { numbers, filled };
}

const hasNumbers = (b: Block, j: number, from: number) => numericShare(b, j, from).numbers > 0;

/** A header row: its filled cells (from column `from`) are all titles, and numbers follow. */
function isHeaderRow(b: Block, r: number, from = 0): boolean {
  const cells = (b.parsed[r] ?? []).slice(from).filter((p) => p.kind !== 'empty');
  if (cells.length === 0 || !cells.every(isLabel)) return false;
  return b.parsed.slice(r + 1).some((row) => row.slice(from).some((p) => p.kind === 'number'));
}

const INDEX_HEADER =
  /^(#|no\.?|n°|nr\.?|number|rep(licate)?s?\.?|row|index|id|sample|mouse|animal|well|obs(ervation)?)$/i;

/** A first column counting 1, 2, 3… (or from 0) under an index-like or empty header. */
function isIndexColumn(b: Block, j: number, header: boolean): boolean {
  const title = header ? textOf(rawAt(b, 0, j)) : '';
  if (title !== '' && !INDEX_HEADER.test(title)) return false;
  const vals: number[] = [];
  for (let r = header ? 1 : 0; r < b.rows.length; r += 1) {
    const p = at(b, r, j);
    if (p.kind === 'empty') continue;
    if (p.kind !== 'number') return false;
    vals.push(p.value);
  }
  if (vals.length < 2) return false;
  const start = vals[0];
  return (start === 0 || start === 1) && vals.every((v, i) => v === start + i);
}

/** A unit in brackets at the end of a title: `Weight (g)` → Weight, g. Not `(n=5)`. */
export function splitUnit(title: string): { readonly name: string; readonly unit: string | null } {
  const m = /^(.*?)\s*[([]\s*([^()[\]]{1,15}?)\s*[)\]]\s*$/.exec(title);
  if (!m?.[1] || !m[2] || /^n\s*=|^\d+$|=/i.test(m[2])) return { name: title, unit: null };
  return { name: m[1], unit: m[2] };
}

/** Titles with a unit they all share moved out: WT (mg), KO (mg) → WT, KO and mg. */
function commonUnit(titles: readonly string[]): { titles: string[]; unit: string | null } {
  const split = titles.map(splitUnit);
  const unit = split[0]?.unit ?? null;
  if (unit === null || titles.length === 0 || !split.every((s) => s.unit === unit)) {
    return { titles: [...titles], unit: null };
  }
  return { titles: split.map((s) => s.name), unit };
}

// ---------------------------------------------------------------------------
// Summary statistics in headers

const STAT_WORDS: readonly (readonly [SummarySubcolumn, string])[] = [
  ['mean', 'mean|means|average|avg|ave'],
  ['sd', 'sd|s\\.d\\.?|stdev|stdev\\.?s|std|std\\.? ?dev\\.?|st\\.? ?dev\\.?|standard deviation'],
  [
    'sem',
    'sem|s\\.e\\.m\\.?|se|s\\.e\\.?|std\\.? ?err(?:or)?|standard error(?: of(?: the)? mean)?',
  ],
  ['cv', '%? ?cv|cv ?%|cv \\(%\\)|coefficient of variation'],
  ['n', 'n|count|size|sample size|no\\.? of (?:values|samples|replicates)'],
  ['lower', 'lower|low|lcl|lower limit|lower ci|ci lower|lower 95% ci|lower bound'],
  ['upper', 'upper|high|ucl|upper limit|upper ci|ci upper|upper 95% ci|upper bound'],
];

const WHOLE = STAT_WORDS.map(([s, w]) => [s, new RegExp(`^(?:${w})$`, 'i')] as const);
const SUFFIX = STAT_WORDS.map(
  ([s, w]) => [s, new RegExp(`^(.+?)[\\s_:,/|(\\[-]+(?:${w})[)\\]]?$`, 'i')] as const,
);
const PREFIX = STAT_WORDS.map(
  ([s, w]) =>
    [s, new RegExp(`^(?:${w})[\\s_:,/|)\\]-]+(?:of )?[(\\[]?(.+?)[)\\]]?$`, 'i')] as const,
);

/** The statistic a whole title names ("SD", "Mean"), or null. */
export function statOf(title: string): SummarySubcolumn | null {
  const t = title.trim();
  return WHOLE.find(([, re]) => re.test(t))?.[0] ?? null;
}

/** A title naming a group and a statistic, "WT mean", "SD (KO)", or a statistic alone. */
export function splitStat(
  title: string,
): { readonly group: string; readonly stat: SummarySubcolumn } | null {
  const t = title.trim();
  const whole = statOf(t);
  if (whole) return { group: '', stat: whole };
  for (const [stat, re] of SUFFIX) {
    const m = re.exec(t);
    if (m?.[1]) return { group: m[1].trim(), stat };
  }
  for (const [stat, re] of PREFIX) {
    const m = re.exec(t);
    if (m?.[1]) return { group: m[1].trim(), stat };
  }
  return null;
}

const STAT_LABEL: Readonly<Record<SummarySubcolumn, string>> = {
  mean: 'mean',
  sd: 'SD',
  sem: 'SEM',
  cv: '%CV',
  n: 'n',
  lower: 'lower limit',
  upper: 'upper limit',
};

/** The summary format the statistics found make, and those it leaves unused. */
function formatFor(
  stats: ReadonlySet<SummarySubcolumn>,
): { stats: SummaryStats; unused: string[] } | null {
  if (!stats.has('mean')) return null;
  const n = stats.has('n');
  let kind: SummaryStats;
  if (stats.has('sd')) kind = n ? 'mean-sd-n' : 'mean-sd';
  else if (stats.has('sem')) kind = n ? 'mean-sem-n' : 'mean-sem';
  else if (stats.has('cv')) kind = n ? 'mean-cv-n' : 'mean-cv';
  else if (stats.has('lower') && stats.has('upper')) kind = 'mean-lower-upper';
  else return null;
  const used = new Set(summarySubcolumns(kind));
  const unused = [...stats].filter((s) => !used.has(s)).map((s) => STAT_LABEL[s]);
  return { stats: kind, unused };
}

// ---------------------------------------------------------------------------
// Building a table: every layout fills a "cube" of values, then one builder
// makes the table. Column tables: groups × one subcolumn × replicate rows.
// Grouped: groups (data sets) × subcolumns (replicates or statistics) × rows.

interface Slot {
  readonly value: Cell;
  /** The source text when the cell isn't a number. */
  readonly mark?: string;
}

interface Cube {
  readonly type: 'column' | 'grouped' | 'nested';
  readonly format: EntryFormat;
  readonly groups: readonly string[];
  /** Row titles (Grouped); a Column table's rows are untitled. */
  readonly rowTitles: readonly (string | null)[];
  /** `slots[g][k][i]`: data set g, subcolumn k, row i. */
  readonly slots: readonly (readonly (readonly Slot[])[])[];
  readonly unit: string | null;
  readonly valueTitle: string | null;
  /** Nested: subgroup names shared across every group (`replicateTitles`). */
  readonly subTitles?: readonly string[];
}

class Tally {
  values = 0;
  percent = 0;
  textCount = 0;
  readonly examples: string[] = [];
  readonly missing = new Map<string, number>();

  slot(p: Parsed): Slot {
    if (p.kind === 'number') {
      this.values += 1;
      if (p.percent) this.percent += 1;
      return { value: p.value };
    }
    if (p.kind === 'missing') {
      this.missing.set(p.marker, (this.missing.get(p.marker) ?? 0) + 1);
      return { value: null };
    }
    if (p.kind === 'text') {
      this.textCount += 1;
      if (this.examples.length < 3 && !this.examples.includes(p.text)) this.examples.push(p.text);
      return { value: null, mark: p.text };
    }
    return { value: null };
  }
}

const EMPTY: Slot = { value: null };

interface Extra {
  readonly leftOut: readonly string[];
  /** Rows under the skipped ones read as titles, not data. */
  readonly titleRows: number;
  readonly reshaped?: boolean;
  readonly unlabelled?: number;
  readonly repeats?: number;
  readonly unusedStats?: readonly string[];
}

function finish(
  cube: Cube,
  title: string,
  tally: Tally,
  extra: Extra,
  context: { skip: number; decimal: DecimalSeparator; truncated: boolean },
): ImportResult {
  const nRows =
    cube.type === 'column' && cube.format.kind === 'summary'
      ? 1
      : Math.max(cube.rowTitles.length, ...cube.slots.flatMap((g) => g.map((k) => k.length)));
  const rows = newRows(nRows, cube.type === 'grouped' ? cube.rowTitles : undefined);
  const marks = new Map<string, string>();
  const width = cube.format.kind === 'replicates' ? cube.format.count : 0;
  const dataSets: DataSet[] = cube.groups.map((g, gi) => {
    const subs = cube.slots[gi] ?? [];
    const count =
      cube.format.kind === 'replicates' ? width : summarySubcolumns(cube.format.stats).length;
    return {
      id: newId('ds'),
      title: g === '' ? defaultTitle(gi) : g,
      subcolumns: Array.from({ length: count }, (_, k) =>
        Array.from({ length: nRows }, (_, i) => {
          const s = subs[k]?.[i] ?? EMPTY;
          if (s.mark !== undefined) marks.set(markKey(gi, k, i), s.mark);
          return s.value;
        }),
      ),
      excluded: new Set(),
    };
  });
  const base = {
    id: newId('t'),
    title,
    format: cube.format,
    rows,
    dataSets,
    ...(cube.valueTitle ? { valueTitle: cube.valueTitle } : {}),
    ...(cube.unit ? { unit: cube.unit } : {}),
  };
  const table: Table =
    cube.type === 'nested'
      ? { ...base, type: 'nested', ...(cube.subTitles ? { replicateTitles: cube.subTitles } : {}) }
      : { ...base, type: cube.type };
  return {
    table,
    marks,
    notes: {
      values: tally.values,
      missing: tally.missing,
      text: { count: tally.textCount, examples: tally.examples },
      percent: tally.percent,
      decimal: context.decimal,
      skipped: context.skip,
      titleRows: extra.titleRows,
      leftOut: extra.leftOut,
      reshaped: extra.reshaped ?? false,
      unlabelled: extra.unlabelled ?? 0,
      repeats: extra.repeats ?? 0,
      unit: cube.unit,
      unusedStats: extra.unusedStats ?? [],
      truncated: context.truncated,
    },
  };
}

/** Swaps the two factors of a Grouped cube: data sets become rows and rows data sets. */
function swapped(cube: Cube): Cube {
  const k =
    cube.format.kind === 'replicates'
      ? cube.format.count
      : summarySubcolumns(cube.format.stats).length;
  const rows = Math.max(
    cube.rowTitles.length,
    ...cube.slots.flatMap((g) => g.map((s) => s.length)),
  );
  return {
    ...cube,
    groups: Array.from({ length: rows }, (_, i) => cube.rowTitles[i] ?? ''),
    rowTitles: cube.groups.map((g, gi) => (g === '' ? defaultTitle(gi) : g)),
    slots: Array.from({ length: rows }, (_, i) =>
      Array.from({ length: k }, (_, kk) => cube.slots.map((g) => g[kk]?.[i] ?? EMPTY)),
    ),
  };
}

// ---------------------------------------------------------------------------
// Layouts

type Built = { cube: Cube; extra: Extra; tally: Tally } | null;

/** Each column a group, replicates down the rows. */
function buildColumns(b: Block, choice: ImportChoice): Built {
  const header = choice.header && b.rows.length > 0;
  const from = header ? 1 : 0;
  const tally = new Tally();
  const leftOut: string[] = [];
  const kept: number[] = [];
  b.cols.forEach((_, j) => {
    if (j === 0 && b.cols.length > 1 && isIndexColumn(b, j, header)) {
      leftOut.push(columnName(b, j, header));
      return;
    }
    const { numbers, filled } = numericShare(b, j, from);
    if (numbers === 0 && filled > 0) {
      leftOut.push(columnName(b, j, header));
      return;
    }
    if (numbers === 0) {
      // A titled column with nothing under it is named in the notes, not made a group.
      if (header && !isBlank(rawAt(b, 0, j))) leftOut.push(columnName(b, j, header));
      return;
    }
    kept.push(j);
  });
  if (kept.length === 0) return null;
  const raw = kept.map((j) => (header ? textOf(rawAt(b, 0, j)) : ''));
  const { titles, unit } = commonUnit(raw);
  let last = from;
  for (let r = from; r < b.rows.length; r += 1) {
    if (kept.some((j) => at(b, r, j).kind !== 'empty')) last = r + 1;
  }
  const slots = kept.map((j) => {
    const col: Slot[] = [];
    for (let r = from; r < last; r += 1) col.push(tally.slot(at(b, r, j)));
    return [col];
  });
  return {
    cube: {
      type: 'column',
      format: { kind: 'replicates', count: 1 },
      groups: titles,
      rowTitles: [],
      slots,
      unit,
      valueTitle: null,
    },
    extra: { leftOut, titleRows: from },
    tally,
  };
}

/** Header rows of a two-factor sheet: 1 (group titles) or 2 (titles over replicate labels). */
function groupedHeaderRows(b: Block, header: boolean): number {
  if (!header) return 0;
  if (b.rows.length < 3 || !isBlank(rawAt(b, 1, 0))) return 1;
  const second = (b.parsed[1] ?? []).slice(1);
  const filled = second.filter((p) => p.kind !== 'empty');
  if (filled.length === 0) return 1;
  const labelsBelow = b.rows.slice(2).filter((_, i) => !isBlank(rawAt(b, i + 2, 0))).length;
  if (labelsBelow === 0) return 1;
  const small = (p: Parsed) =>
    p.kind === 'number' && Number.isInteger(p.value) && p.value >= 0 && p.value <= b.cols.length;
  return filled.every((p) => isLabel(p) || small(p)) ? 2 : 1;
}

/** Group titles of block columns 1…, a blank title continuing the one before (a merged title). */
function fillForward(b: Block, headerRows: number): string[] {
  const titles: string[] = [];
  let prev = '';
  for (let j = 1; j < b.cols.length; j += 1) {
    const t = headerRows > 0 ? textOf(rawAt(b, 0, j)) : '';
    if (t !== '') prev = t;
    titles.push(headerRows > 0 ? prev : '');
  }
  return titles;
}

/** Rows × columns: a first column of row titles; repeated or merged titles are replicates. */
function buildGrouped(b: Block, choice: ImportChoice): Built {
  if (b.cols.length < 2) return null;
  const headerRows = groupedHeaderRows(b, choice.header);
  const tally = new Tally();
  const leftOut: string[] = [];
  const titles = fillForward(b, headerRows);
  // Columns of text only (notes, IDs) are left out.
  const byGroup = new Map<string, number[]>();
  const order: string[] = [];
  titles.forEach((t, i) => {
    const j = i + 1;
    const { numbers, filled } = numericShare(b, j, headerRows);
    if (numbers === 0 && filled > 0) {
      leftOut.push(columnName(b, j, headerRows > 0));
      return;
    }
    const key = t === '' ? `\u0000${String(j)}` : t;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)?.push(j);
  });
  if (order.length === 0) return null;
  const reps = Math.max(...order.map((k) => byGroup.get(k)?.length ?? 0));
  const bodyRows: number[] = [];
  for (let r = headerRows; r < b.rows.length; r += 1) {
    const empty = b.cols.every((_, j) => at(b, r, j).kind === 'empty');
    if (!empty) bodyRows.push(r);
  }
  const { titles: groups, unit } = commonUnit(order.map((k) => (k.startsWith('\u0000') ? '' : k)));
  const slots = order.map((k) => {
    const cols = byGroup.get(k) ?? [];
    return Array.from({ length: reps }, (_, rep) => {
      const j = cols[rep];
      return bodyRows.map((r) => (j === undefined ? EMPTY : tally.slot(at(b, r, j))));
    });
  });
  const cube: Cube = {
    type: 'grouped',
    format: { kind: 'replicates', count: reps },
    groups,
    rowTitles: bodyRows.map((r) => textOf(rawAt(b, r, 0)) || null),
    slots,
    unit,
    valueTitle: null,
  };
  return {
    cube: choice.swap ? swapped(cube) : cube,
    extra: { leftOut, titleRows: headerRows },
    tally,
  };
}

/** What `nestedShape` finds, shared by the guess and the builder. */
interface NestedShape {
  readonly order: string[];
  readonly byGroup: ReadonlyMap<string, number[]>;
  readonly subTitles: string[];
}

/**
 * A group header (row 0, forward-filled from column 0, unlike Grouped's
 * which starts at column 1) over a row of subgroup labels repeated —
 * literally, or left blank to inherit the first group's — identically
 * under every group. Unlike `groupedHeaderRows`, a row of replicate
 * *numbers* doesn't count: that is Grouped's two-header-row shape, not
 * a shared subgroup name.
 */
function nestedShape(b: Block, header: boolean): NestedShape | null {
  if (!header || b.cols.length < 1 || b.rows.length < 3) return null;
  const groupOf: string[] = [];
  let prevGroup = '';
  b.cols.forEach((_, j) => {
    const t = textOf(rawAt(b, 0, j));
    if (t !== '') prevGroup = t;
    groupOf.push(prevGroup);
  });
  // A blank column 0 header is Grouped's row-title column (its header
  // left blank on purpose), not a merged group title left uncontinued:
  // Nested has no row-title column, so its first group starts at 0.
  if ((groupOf[0] ?? '') === '') return null;
  const row1 = b.parsed[1] ?? [];
  if (!row1.some((p) => p.kind !== 'empty')) return null;
  if (!row1.every((p) => p.kind === 'empty' || isLabel(p))) return null;
  const order: string[] = [];
  const byGroup = new Map<string, number[]>();
  groupOf.forEach((g, j) => {
    if (g === '') return;
    if (!byGroup.has(g)) {
      byGroup.set(g, []);
      order.push(g);
    }
    byGroup.get(g)?.push(j);
  });
  const firstGroup = order[0];
  if (firstGroup === undefined) return null;
  const labelsOf = (cols: number[]) => cols.map((j) => textOf(rawAt(b, 1, j)));
  const first = labelsOf(byGroup.get(firstGroup) ?? []);
  if (first.length < 2) return null;
  const ok = order.every((g) => {
    const cols = byGroup.get(g) ?? [];
    if (cols.length !== first.length) return false;
    return labelsOf(cols).every((l, i) => l === '' || l === first[i]);
  });
  if (!ok) return null;
  return { order, byGroup, subTitles: first };
}

/** Transposes a Nested cube: subgroups become the groups and vice versa. */
function swappedNested(cube: Cube): Cube {
  const subTitles = cube.subTitles ?? [];
  const k = subTitles.length;
  const g = cube.groups.length;
  return {
    ...cube,
    format: { kind: 'replicates', count: g },
    groups: subTitles.map((t, i) => (t === '' ? defaultTitle(i) : t)),
    subTitles: cube.groups,
    slots: Array.from({ length: k }, (_, kk) =>
      Array.from({ length: g }, (_, gg) => cube.slots[gg]?.[kk] ?? []),
    ),
  };
}

/**
 * A group header over shared subgroup names, no row-title column: raw,
 * ragged rows per subgroup (item 30, #88). Groups and subgroups swap
 * with `choice.swap`, since the file's shape alone doesn't say which
 * side is meant to be compared.
 */
function buildNested(b: Block, choice: ImportChoice): Built {
  const shape = nestedShape(b, choice.header);
  if (!shape) return null;
  const { order, byGroup, subTitles } = shape;
  const tally = new Tally();
  const leftOut: string[] = [];
  const grouped = new Set(order.flatMap((g) => byGroup.get(g) ?? []));
  b.cols.forEach((_, j) => {
    if (grouped.has(j)) return;
    if (numericShare(b, j, 2).filled > 0) leftOut.push(columnName(b, j, true));
  });
  const bodyRows: number[] = [];
  for (let r = 2; r < b.rows.length; r += 1) {
    if ([...grouped].some((j) => at(b, r, j).kind !== 'empty')) bodyRows.push(r);
  }
  const { titles, unit } = commonUnit(order);
  const slots = order.map((g) => {
    const cols = byGroup.get(g) ?? [];
    return cols.map((j) => bodyRows.map((r) => tally.slot(at(b, r, j))));
  });
  const cube: Cube = {
    type: 'nested',
    format: { kind: 'replicates', count: subTitles.length },
    groups: titles,
    rowTitles: [],
    slots,
    unit,
    valueTitle: null,
    subTitles,
  };
  return {
    cube: choice.swap ? swappedNested(cube) : cube,
    extra: { leftOut, titleRows: 2 },
    tally,
  };
}

/** Columns of text labels (not numbers) under a header, from row 1. */
function labelColumns(b: Block): number[] {
  const out: number[] = [];
  b.cols.forEach((_, j) => {
    const { numbers, filled } = numericShare(b, j, 1);
    if (filled > 0 && numbers * 2 < filled) out.push(j);
  });
  return out;
}

/** Summary statistics: per group in the header, or one row per group with a column per statistic. */
function buildSummary(b: Block, choice: ImportChoice): Built {
  return summaryAcross(b, choice) ?? summaryDown(b, choice);
}

/** Groups across: `WT mean, WT SD, KO mean, …`, or group titles over a row of statistics. */
function summaryAcross(b: Block, choice: ImportChoice): Built {
  if (b.rows.length < 2) return null;
  const labelled = at(b, 0, 0).kind === 'empty' || statOf(textOf(rawAt(b, 0, 0))) === null;
  const firstLabels =
    labelled &&
    b.cols.length > 1 &&
    numericShare(b, 0, 1).filled > 0 &&
    numericShare(b, 0, 1).numbers * 2 < numericShare(b, 0, 1).filled;
  const start = firstLabels ? 1 : 0;
  // Two header rows: titles (merged or blank-continued) over statistics.
  const second = b.cols.slice(start).map((_, i) => statOf(textOf(rawAt(b, 1, i + start))));
  let headerRows: number;
  let cols: { group: string; stat: SummarySubcolumn | null }[];
  if (b.rows.length >= 3 && second.filter((s) => s !== null).length >= 2) {
    headerRows = 2;
    let prev = '';
    cols = second.map((stat, i) => {
      const t = textOf(rawAt(b, 0, i + start));
      if (t !== '') prev = t;
      return { group: prev, stat };
    });
  } else {
    headerRows = 1;
    cols = b.cols.slice(start).map((_, i) => {
      const s = splitStat(textOf(rawAt(b, 0, i + start)));
      return s ? { group: s.group, stat: s.stat } : { group: '', stat: null };
    });
    // Every statistic alone ("Mean", "SD") is the other orientation (summaryDown).
    if (cols.every((c) => c.stat === null || c.group === '')) return null;
  }
  const groups: string[] = [];
  const statCols = new Map<string, Map<SummarySubcolumn, number>>();
  const found = new Set<SummarySubcolumn>();
  const leftOut: string[] = [];
  cols.forEach((c, i) => {
    const j = i + start;
    if (c.stat === null) {
      if (hasNumbers(b, j, headerRows) || !isBlank(rawAt(b, 0, j)))
        leftOut.push(columnName(b, j, true));
      return;
    }
    if (!statCols.has(c.group)) {
      statCols.set(c.group, new Map());
      groups.push(c.group);
    }
    const m = statCols.get(c.group);
    if (m && !m.has(c.stat)) m.set(c.stat, j);
    found.add(c.stat);
  });
  const format = formatFor(found);
  if (!format || groups.length === 0) return null;
  if (!groups.every((g) => statCols.get(g)?.has('mean'))) return null;
  const tally = new Tally();
  const bodyRows: number[] = [];
  for (let r = headerRows; r < b.rows.length; r += 1) {
    if (!b.cols.every((_, j) => at(b, r, j).kind === 'empty')) bodyRows.push(r);
  }
  if (bodyRows.length === 0) return null;
  const subs = summarySubcolumns(format.stats);
  const column = !firstLabels && bodyRows.length === 1;
  const { titles, unit } = commonUnit(groups);
  const slots = groups.map((g) =>
    subs.map((s) => {
      const j = statCols.get(g)?.get(s);
      return bodyRows.map((r) => (j === undefined ? EMPTY : tally.slot(at(b, r, j))));
    }),
  );
  const cube: Cube = {
    type: column ? 'column' : 'grouped',
    format: { kind: 'summary', stats: format.stats },
    groups: titles,
    rowTitles: column
      ? []
      : bodyRows.map((r) => (firstLabels ? textOf(rawAt(b, r, 0)) || null : null)),
    slots,
    unit,
    valueTitle: null,
  };
  return {
    cube: choice.swap && !column ? swapped(cube) : cube,
    extra: { leftOut, titleRows: headerRows, unusedStats: format.unused },
    tally,
  };
}

/** One row per group: `Group, Mean, SD, N` (a second label column makes two factors). */
function summaryDown(b: Block, choice: ImportChoice): Built {
  if (b.rows.length < 2) return null;
  const stats = new Map<SummarySubcolumn, number>();
  const leftOut: string[] = [];
  const labels = labelColumns(b);
  b.cols.forEach((_, j) => {
    const s = statOf(textOf(rawAt(b, 0, j)));
    if (s && !labels.includes(j)) {
      if (!stats.has(s)) stats.set(s, j);
    }
  });
  const format = formatFor(new Set(stats.keys()));
  if (!format) return null;
  const used = new Set([...stats.values()]);
  const labelCols = labels.filter((j) => !used.has(j)).slice(0, 2);
  b.cols.forEach((_, j) => {
    if (!used.has(j) && !labelCols.includes(j)) leftOut.push(columnName(b, j, true));
  });
  const tally = new Tally();
  const subs = summarySubcolumns(format.stats);
  const body: number[] = [];
  for (let r = 1; r < b.rows.length; r += 1) {
    if (!b.cols.every((_, j) => at(b, r, j).kind === 'empty')) body.push(r);
  }
  if (body.length === 0) return null;
  const cell = (r: number, s: SummarySubcolumn): Slot => {
    const j = stats.get(s);
    return j === undefined ? EMPTY : tally.slot(at(b, r, j));
  };
  const unit = null;
  if (labelCols.length < 2) {
    const lj = labelCols[0];
    const groups = body.map((r) => (lj === undefined ? '' : textOf(rawAt(b, r, lj))));
    const cube: Cube = {
      type: 'column',
      format: { kind: 'summary', stats: format.stats },
      groups,
      rowTitles: [],
      slots: body.map((r) => subs.map((s) => [cell(r, s)])),
      unit,
      valueTitle: null,
    };
    return { cube, extra: { leftOut, titleRows: 1, unusedStats: format.unused }, tally };
  }
  const [rj = 0, gj = 0] = labelCols;
  const rowLevels: string[] = [];
  const groupLevels: string[] = [];
  const where = new Map<string, number>();
  let repeats = 0;
  for (const r of body) {
    const rl = textOf(rawAt(b, r, rj));
    const gl = textOf(rawAt(b, r, gj));
    if (!rowLevels.includes(rl)) rowLevels.push(rl);
    if (!groupLevels.includes(gl)) groupLevels.push(gl);
    const key = `${rl}\u0000${gl}`;
    if (where.has(key)) repeats += 1;
    else where.set(key, r);
  }
  const cube: Cube = {
    type: 'grouped',
    format: { kind: 'summary', stats: format.stats },
    groups: groupLevels,
    rowTitles: rowLevels.map((l) => l || null),
    slots: groupLevels.map((gl) =>
      subs.map((s) =>
        rowLevels.map((rl) => {
          const r = where.get(`${rl}\u0000${gl}`);
          return r === undefined ? EMPTY : cell(r, s);
        }),
      ),
    ),
    unit,
    valueTitle: null,
  };
  return {
    cube: choice.swap ? swapped(cube) : cube,
    extra: { leftOut, titleRows: 1, unusedStats: format.unused, repeats },
    tally,
  };
}

/** One row per measurement: a column of groups (and of a second factor), a column of values. */
function buildLong(b: Block, choice: ImportChoice): Built {
  if (b.rows.length < 2) return null;
  const gj = b.cols.indexOf(choice.groupColumn);
  const vj = b.cols.indexOf(choice.valueColumn);
  const fj = choice.factorColumn === null ? -1 : b.cols.indexOf(choice.factorColumn);
  if (gj === -1 || vj === -1 || gj === vj || fj === vj || fj === gj) return null;
  const tally = new Tally();
  const leftOut = b.cols.flatMap((_, j) =>
    j === gj || j === vj || j === fj ? [] : [columnName(b, j, true)],
  );
  const header = splitUnit(textOf(rawAt(b, 0, vj)));
  let unlabelled = 0;
  if (fj === -1) {
    const groups: string[] = [];
    const values = new Map<string, Slot[]>();
    for (let r = 1; r < b.rows.length; r += 1) {
      const p = at(b, r, vj);
      const g = textOf(rawAt(b, r, gj));
      if (g === '') {
        if (p.kind !== 'empty') unlabelled += 1;
        continue;
      }
      if (p.kind === 'empty' || p.kind === 'missing') {
        tally.slot(p);
        continue;
      }
      if (!values.has(g)) {
        values.set(g, []);
        groups.push(g);
      }
      values.get(g)?.push(tally.slot(p));
    }
    if (groups.length === 0) return null;
    return {
      cube: {
        type: 'column',
        format: { kind: 'replicates', count: 1 },
        groups,
        rowTitles: [],
        slots: groups.map((g) => [values.get(g) ?? []]),
        unit: header.unit,
        valueTitle: header.name || null,
      },
      extra: { leftOut, titleRows: 1, reshaped: true, unlabelled },
      tally,
    };
  }
  const rowLevels: string[] = [];
  const groupLevels: string[] = [];
  const cells = new Map<string, Slot[]>();
  for (let r = 1; r < b.rows.length; r += 1) {
    const p = at(b, r, vj);
    const rl = textOf(rawAt(b, r, gj));
    const gl = textOf(rawAt(b, r, fj));
    if (rl === '' || gl === '') {
      if (p.kind !== 'empty') unlabelled += 1;
      continue;
    }
    if (p.kind === 'empty' || p.kind === 'missing') {
      tally.slot(p);
      continue;
    }
    if (!rowLevels.includes(rl)) rowLevels.push(rl);
    if (!groupLevels.includes(gl)) groupLevels.push(gl);
    const key = `${rl}\u0000${gl}`;
    const list = cells.get(key) ?? [];
    list.push(tally.slot(p));
    cells.set(key, list);
  }
  if (rowLevels.length === 0) return null;
  const reps = Math.max(1, ...[...cells.values()].map((l) => l.length));
  const cube: Cube = {
    type: 'grouped',
    format: { kind: 'replicates', count: reps },
    groups: groupLevels,
    rowTitles: rowLevels,
    slots: groupLevels.map((gl) =>
      Array.from({ length: reps }, (_, k) =>
        rowLevels.map((rl) => cells.get(`${rl}\u0000${gl}`)?.[k] ?? EMPTY),
      ),
    ),
    unit: header.unit,
    valueTitle: header.name || null,
  };
  return {
    cube: choice.swap ? swapped(cube) : cube,
    extra: { leftOut, titleRows: 1, reshaped: true, unlabelled },
    tally,
  };
}

const BUILDERS: Readonly<Record<LayoutKind, (b: Block, c: ImportChoice) => Built>> = {
  columns: buildColumns,
  grouped: buildGrouped,
  nested: buildNested,
  summary: buildSummary,
  long: buildLong,
};

/** The table a choice makes from a sheet, or null when that layout doesn't fit it. */
export function buildTable(
  sheet: SourceSheet,
  choice: ImportChoice,
  title: string,
): ImportResult | null {
  const b = makeBlock(sheet, choice.skip, choice.decimal);
  const built = BUILDERS[choice.layout](b, choice);
  if (!built || built.cube.groups.length === 0) return null;
  return finish(built.cube, title, built.tally, built.extra, {
    skip: choice.skip,
    decimal: choice.decimal,
    truncated: sheet.truncated,
  });
}

// ---------------------------------------------------------------------------
// Guessing

const looksNumeric = (c: SourceCell | undefined): boolean =>
  typeof c === 'number' ||
  typeof c === 'object' ||
  (typeof c === 'string' && /^\s*[-+−]?[\d.,' ]*\d[\d.,' ]*%?\s*$/.test(c));

/**
 * Rows above the table. The table is the first run of non-blank rows
 * holding a row about as wide as the data (three quarters of the typical
 * width of rows with numbers), so a preamble set off by a blank line (an
 * instrument's "Software, 3.08") is skipped; so is a title in the first
 * cell right above the table ("Experiment 3"). Anything else is the
 * dialog's "Skip rows".
 */
export function guessSkip(sheet: SourceSheet): number {
  const counts = sheet.cells.map((r) => r.filter((c) => !isBlank(c)).length);
  const widths = sheet.cells
    .map((r, i) => (r.some(looksNumeric) ? (counts[i] ?? 0) : -1))
    .filter((n) => n >= 0)
    .sort((a, b) => a - b);
  const w = widths[Math.floor(widths.length / 2)] ?? 0;
  const need = Math.max(1, Math.ceil(0.75 * w));
  const dense = counts.findIndex((n) => n >= need);
  if (dense === -1)
    return Math.max(
      0,
      counts.findIndex((n) => n > 0),
    );
  let r = dense;
  while (r > 0 && (counts[r - 1] ?? 0) > 0) r -= 1;
  while (r < dense && w > 1 && counts[r] === 1 && !isBlank(sheet.cells[r]?.[0])) r += 1;
  return r;
}

/** Replicate labels, not factor levels: `1`, `Rep 2`, `Mouse 3`, `R4`, `#5`. */
const REPLICATE_LABEL = /^(?:rep(?:licate)?|r|mouse|animal|sample|well|n|#|no\.?)?\s*#?\d+$/i;

function sheetColumns(b: Block): SheetColumn[] {
  return b.cols.map((c, j) => {
    const { numbers, filled } = numericShare(b, j, 1);
    return { index: c, name: columnName(b, j, true), numeric: filled > 0 && numbers * 2 >= filled };
  });
}

/** Long-data columns: the first label column with repeated values, a second one, a value column. */
function longColumns(b: Block): { group: number; factor: number | null; value: number } | null {
  if (b.rows.length < 3 || !isHeaderRow(b, 0)) return null;
  const labels = labelColumns(b).filter((j) => {
    const vals: string[] = [];
    for (let r = 1; r < b.rows.length; r += 1) {
      const t = textOf(rawAt(b, r, j));
      if (t !== '') vals.push(t);
    }
    const levels = new Set(vals).size;
    // A group column names each group at least twice on average.
    return levels >= 1 && levels * 2 <= vals.length && levels <= 100;
  });
  const values = b.cols
    .map((_, j) => j)
    .filter((j) => !labels.includes(j) && !isIndexColumn(b, j, true))
    .filter((j) => {
      const { numbers, filled } = numericShare(b, j, 1);
      return filled > 0 && numbers * 2 >= filled;
    });
  const [g, f] = labels;
  const [v] = values;
  if (g === undefined || v === undefined) return null;
  return {
    group: b.cols[g] ?? 0,
    factor: f === undefined ? null : (b.cols[f] ?? null),
    value: b.cols[v] ?? 0,
  };
}

/** The guess for a sheet, and every layout that makes a table from it. */
export function guessLayout(
  sheet: SourceSheet,
  fallback: DecimalSeparator,
  given: Partial<Pick<ImportChoice, 'skip' | 'decimal'>> = {},
): Guess {
  const skip = given.skip ?? guessSkip(sheet);
  const strings = sheet.cells
    .slice(skip)
    .map((r) => r.filter((c): c is string => typeof c === 'string'));
  const decimal = given.decimal ?? detectDecimal(strings, fallback);
  const b = makeBlock(sheet, skip, decimal);
  const header = b.rows.length > 1 && (isHeaderRow(b, 0) || isHeaderRow(b, 0, 1));
  const long = longColumns(b);
  const first = b.cols[0] ?? 0;
  const base: ImportChoice = {
    layout: 'columns',
    skip,
    decimal,
    header,
    groupColumn: long?.group ?? first,
    factorColumn: long?.factor ?? null,
    valueColumn: long?.value ?? b.cols[1] ?? first,
    swap: false,
  };
  const fits = (layout: LayoutKind) => {
    const built = BUILDERS[layout](b, { ...base, layout });
    return built !== null && built.cube.groups.length > 0 && built.tally.values > 0;
  };
  const possible = LAYOUTS.filter(fits);

  let guess: LayoutKind = 'columns';
  if (possible.includes('summary')) guess = 'summary';
  else if (long && possible.includes('long')) guess = 'long';
  else if (possible.includes('nested') && nestedShape(b, header)) guess = 'nested';
  else if (possible.includes('grouped') && looksGrouped(b, header)) guess = 'grouped';
  else if (!possible.includes('columns') && possible[0]) guess = possible[0];
  const ordered = possible.includes(guess)
    ? [guess, ...possible.filter((l) => l !== guess)]
    : possible;
  return { choice: { ...base, layout: guess }, possible: ordered, columns: sheetColumns(b) };
}

/**
 * A first column of labels beside numbers, unless the labels count
 * replicates ("Mouse 1", "Rep 2") under distinct group titles, which is
 * a Column table with its rows named.
 */
function looksGrouped(b: Block, header: boolean): boolean {
  if (b.cols.length < 2) return false;
  const headerRows = groupedHeaderRows(b, header);
  const labels: string[] = [];
  for (let r = headerRows; r < b.rows.length; r += 1) {
    const p = at(b, r, 0);
    if (p.kind === 'empty') continue;
    if (!isLabel(p)) return false;
    labels.push(textOf(rawAt(b, r, 0)));
  }
  if (labels.length === 0) return false;
  const titles = fillForward(b, headerRows).filter((t) => t !== '');
  const repeated = new Set(titles).size < titles.length || headerRows === 2;
  if (repeated) return true;
  // Labels nearly all different down a long table are IDs (strains,
  // samples; a few listed twice), not the levels of a factor.
  const levels = new Set(labels).size;
  if (levels > MAX_ROW_LEVELS && levels >= 0.9 * labels.length) return false;
  return !labels.every((l) => REPLICATE_LABEL.test(l));
}

/** More distinct row labels than this, nearly all different, read as IDs rather than a factor. */
const MAX_ROW_LEVELS = 24;
