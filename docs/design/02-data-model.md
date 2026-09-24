# 02. Data model: tables, project, dependency graph

Proposed, 2026-09-24 (#4). For review before #5–#7 are built on it.

## What was asked

The typed data model everything else sits on: Column and Grouped tables
now, XY, Contingency, Survival, Nested and Multiple-variables later
without a rewrite; raw replicates and summary data; empty cells; the
project that holds tables, analyses and graphs; the dependency graph that
keeps them live; and what of it goes into a `.bsig` file. Pure TypeScript
in `src/model/`, no React, no WebR.

## One shape under every table type

Prism's own file format already shows the common shape. A `.pzfx` table
has a `TableType` (`OneWay`, `TwoWay`, `XY`, …), an optional X column, an
optional row-titles column, and a list of Y columns ("data sets"), each
with a title and one or more **subcolumns** of values; a table-wide
`YFormat` says what the subcolumns mean (`replicates` with a count, or
summary formats `SDN`, `SEN`, `CVN`, `SD`, `SE`, `CV`, `low-high`,
`upper-lower-limits`), and single values can carry `Excluded="1"`.

We use the same shape, so Prism import (#42) is a mapping, not a
translation:

```
Table
├── rows[]            ordered, each with a stable id and optional title
├── x?                XY and Survival only: one column of X values (+ X error)
└── dataSets[]        ordered, each with a stable id, title, colour …
    └── subcolumns[]  each an array of cells, one per row
```

| Type | rows are | data sets are | subcolumns are |
|---|---|---|---|
| Column | replicates (positional) | groups | 1 (raw), or the summary stats with 1 row |
| Grouped | row-factor levels (titled) | column-factor levels | replicates, or summary stats |
| XY (later) | X values | Y data sets | replicates, or summary stats |
| Contingency (later) | outcomes (titled) | groups | 1: counts |
| Survival (later) | subjects | groups | 1: event (1) / censored (0) |
| Nested (later) | replicates | groups | subgroups (titled, count per data set) |
| Multiple variables (later) | cases | variables | 1; a variable may be text or a category |

Nested is why the subcolumn count lives on each data set rather than only
on the table, and Multiple variables is why the cell type is chosen per
table type rather than fixed for all.

## Types (sketch)

```ts
type Id = string & { readonly __brand: 'Id' }; // 't_…', 'ds_…', 'r_…', 'a_…', 'g_…'

/** One value. Empty is null — never 0, never NaN. Non-finite numbers are rejected on entry. */
type Cell = number | null;

interface Row { readonly id: Id; readonly title: string | null }

interface DataSet {
  readonly id: Id;
  readonly title: string;
  /** Column-major: subcolumns[s][r] is row r of subcolumn s; every array has rows.length entries. */
  readonly subcolumns: readonly (readonly Cell[])[];
  /** Kept in the table, shown struck through, left out of every analysis and graph (Prism's "exclude"). */
  readonly excluded: ReadonlySet<CellKey>; // `${subcolumn}:${rowId}`
  /** Identity colour for this data set across all graphs; graphs may override. Unset = theme palette. */
  readonly color?: string;
  /** Digits shown in the grid; the value itself is never rounded. */
  readonly decimals?: number;
}

/** What the subcolumns of every data set in the table hold. */
type EntryFormat =
  | { readonly kind: 'replicates'; readonly count: number }       // Column: count is 1
  | { readonly kind: 'summary'; readonly stats: SummaryStats };

type SummaryStats =
  | 'mean-sd-n' | 'mean-sem-n' | 'mean-cv-n'   // tests allowed (n is known)
  | 'mean-sd' | 'mean-sem' | 'mean-cv';        // graphs only: no n, no test
  // later: 'mean-plus-minus' (low-high), 'mean-upper-lower' (upper-lower-limits)

interface TableBase {
  readonly id: Id;
  readonly title: string;
  readonly rows: readonly Row[];
  readonly dataSets: readonly DataSet[];
  /** Defaults for graph axis titles; graphs may override. */
  readonly valueTitle?: string;
  readonly unit?: string;
  readonly notes?: string;
}

interface ColumnTable extends TableBase { readonly type: 'column'; readonly format: EntryFormat }
interface GroupedTable extends TableBase { readonly type: 'grouped'; readonly format: EntryFormat }
// later: XYTable (adds x), ContingencyTable, SurvivalTable, NestedTable, MultipleVariablesTable

type Table = ColumnTable | GroupedTable;
```

Notes on the choices:

- **Cells are numbers, not the typed text.** The grid parses what was
  typed or pasted (#10) and stores the double; `decimals` controls
  display. `0.10` and `0.1` are the same value. Rejected alternative:
  storing strings, which would push parsing into every analysis.
- **Rows have ids even where they look positional.** Paired tests pair
  by row, exclusions and later annotations point at rows, and inserting a
  row must not shift what an exclusion points at. The row order is the
  array order.
- **Column tables have ragged columns** as far as the user sees; in the
  model every subcolumn has `rows.length` cells and the short ones end in
  `null`. Trailing empty rows are trimmed on save.
- **Summary data is a format, not a different table.** A Column table
  with `mean-sd-n` has one row and three subcolumns per data set. The
  table type still decides which analyses are offered; the format decides
  which of those can run (no `n` → no test, the analysis dialog says so).
- **Exclusion is a per-cell flag, not a value.** An excluded value is
  still data: it is saved, shown, and one click brings it back. Analyses
  report how many values were excluded. Prism has this and people rely on
  it for outliers they must not silently delete.
- **Titles, units, colours live on the table** (CLAUDE.md), so every
  graph of the same data agrees; a graph can override. The theme supplies
  the colour when none is set.
- **Invariants** (checked by `validateTable`, run after every edit in
  development and on every load): ids unique within the project; every
  subcolumn has `rows.length` cells; subcolumn count matches the format
  (Column raw: 1; Grouped raw: `count`; summary: the number of stats);
  cells are finite numbers or null; `excluded` keys point at existing
  cells. Semantic problems (negative SD, non-integer n) are *not*
  invariants: the user can type them, and the analysis that reads them
  reports them in plain language.

## From table to analysis input

Analyses never read `subcolumns` directly. Selectors in `src/model/`
turn a data set into what a test needs, dropping empty and excluded
cells and saying how many were dropped:

```ts
type GroupData =
  | { readonly kind: 'raw'; readonly values: readonly number[]; readonly dropped: Dropped }
  | { readonly kind: 'summary'; readonly mean: number; readonly sd: number; readonly n: number | null };

interface Dropped { readonly empty: number; readonly excluded: number }
```

- SEM and CV are converted to SD at this boundary (`sd = sem·√n`,
  `sd = cv·mean/100`), as Prism does, so every analysis sees one summary
  form. Without `n`, SEM cannot be converted and `n` is `null`.
- Paired selectors take two data sets and return pairs, dropping a row
  when either side is empty or excluded (CLAUDE.md, Domain rules).
- Grouped selectors return the row × column cell structure two-way ANOVA
  needs, with empty cells kept as structure (unbalanced designs are
  legal).

These selectors are where most "domain rules that cause bugs" are
enforced, so they carry the exhaustive tests; the analyses stay thin.

## Project

```ts
interface Project {
  readonly id: Id;
  readonly name: string;
  readonly tables: ReadonlyMap<Id, Table>;
  readonly analyses: ReadonlyMap<Id, Analysis>;
  readonly graphs: ReadonlyMap<Id, Graph>;       // shape: design note for #19/#20
  readonly layouts: ReadonlyMap<Id, Layout>;     // Phase 2; empty for now
  /** Navigator order per section; the maps are unordered. */
  readonly order: { readonly tables: readonly Id[]; readonly graphs: readonly Id[]; readonly layouts: readonly Id[] };
  readonly exports: readonly ExportRecord[];     // #43: frozen figure recipes
}

interface Analysis {
  readonly id: Id;
  readonly kind: AnalysisKind;                   // 'descriptive' | 't-test' | …
  readonly title: string;
  /** What it reads: a table and which of its data sets, or another analysis's results. */
  readonly input: { readonly table: Id; readonly dataSets: readonly Id[] } | { readonly analysis: Id };
  readonly options: AnalysisOptions;             // typed per kind, e.g. { paired, welch, tails }
}
```

- **Normalised by id.** Tables, analyses and graphs are stored once and
  referenced by id; renaming or reordering never breaks a link.
- **Results are derived, not part of the project state.** They live in a
  separate result store keyed by analysis id (see below), so an edit to a
  table never has to touch results by hand.
- **Immutable values, structural sharing.** Every edit returns a new
  `Project` sharing unchanged tables. That gives undo/redo (#12) as a
  list of snapshots for free, cheap change detection (`===`), and safe
  hand-off to the worker. Edits are named operations (`setCells`,
  `insertRows`, `setFormat`, `addAnalysis`, …) so undo can say what it
  undoes and analytics can count kinds of edit — never contents.
- **One project-wide history**, not one per sheet: undoing "delete table"
  must also bring back its analyses.

## Dependency graph

Edges are not stored; they are **derived from references**: an analysis
depends on its input table or analysis, a graph on its source and on
the analyses whose results it draws (brackets). One source of truth, so
edges can never disagree with the nodes.

```
table ──▶ analysis ──▶ analysis (chained, e.g. normalise → fit)
  │           │
  └─────▶ graph ◀────┘            layout ◀── graphs (Phase 2)
```

- **Cycles are refused at edit time** (adding the reference that would
  close one fails with a message), so the graph is always a DAG.
- **Staleness by content, not by event.** Each analysis result records a
  hash of its inputs: the selected data (after selectors), the options,
  and the engine version (WebR, R, package versions from `lock.json`).
  A result is fresh when its hash matches; nothing needs to "notice" an
  edit. Undo back to an earlier state finds the earlier results still
  valid.
- **Recompute** runs in topological order, debounced (~300 ms after the
  last edit), one analysis at a time on the engine. Each run carries the
  input hash; a result whose hash no longer matches when it returns is
  dropped, so a slow stale run never overwrites a fresh one. A superseded
  run is cancelled by restarting WebR only if it has been running for
  more than a few seconds (restart costs ~2 s, item 01).
- **Node status** for the navigator and graphs: `fresh`, `stale` (inputs
  changed, recompute pending), `running`, `error` (message in plain
  language), `blocked` (an upstream node is in error, or the format can't
  run this test).

## The `.bsig` file

```json
{
  "format": "barelysig",
  "schemaVersion": 1,
  "app": "0.2.0",
  "engine": { "webr": "0.6.0", "r": "4.6.0", "packages": { "mvtnorm": "1.2-4" } },
  "project": { "…": "tables, analyses, graphs, order, exports" },
  "results": { "a_x1": { "inputHash": "…", "value": { "…": "…" } } }
}
```

- Plain JSON, UTF-8. Maps become objects keyed by id; `ReadonlySet`s
  become sorted arrays; cells stay `number | null` (the model never holds
  NaN or Inf, so JSON can carry every cell).
- **Results are saved** with their input hashes. Opening a project shows
  every result and graph at once, before WebR has even started; results
  are then re-checked in the background, and if a newer engine gives
  different numbers the user is told (the same mechanism #43 needs).
- **Migrations**: `schemaVersion` plus a chain of pure functions
  `v1 → v2 → …`, each with tests on saved example files. A file newer
  than the app refuses to open with a clear message instead of guessing.
- The same format, cut down to one graph and what it depends on, is the
  figure recipe embedded in exports (#43).

## Rejected alternatives

- **One generic "sheet" type with the table type as a tag only.** Loses
  the type safety that makes "an analysis gets data it can handle"
  checkable by the compiler. Discriminated unions per table type, with a
  shared base, instead.
- **Row-major storage.** Every analysis reads columns; row-major would
  mean transposing on each run.
- **Storing edges or an event bus.** Two sources of truth, and the
  classic way live-linked apps go stale. Derived edges + content hashes
  instead.
- **Mutable model with change events.** Harder undo, harder to prove a
  result is fresh, unsafe to share with the worker.

## Decisions for review

1. **Excluded values** (Prism's struck-through cells) are in the model
   from the start. Recommended: yes — cheap now, a migration later.
2. **Results are cached in the `.bsig`.** Recommended: yes, for instant
   reopen and for #43; costs file size only for big result tables.
3. **Numbers, not typed strings, in cells**, with per-data-set display
   decimals. Recommended: yes.
4. **Colours on the table** (as the brief says), overridable per graph.
   Recommended: yes.
5. **One project-wide undo history.** Recommended: yes.

## Not in this note

- Graph and theme model: design note for #19/#20.
- Grid behaviour, paste parsing, locales: #9, #10.
- The engine request/result types per analysis: #14.
