# 03. Data entry: shell, grid, paste, history, saving

Written 2026-09-24 before building milestone 0.3 (#8–#13). The model
underneath is note 02; this note is about getting data into it.

## What was asked

An app shell with a navigator (#8); our own data grid with Excel's
keyboard behaviour (#9); flawless paste from Excel, Google Sheets and
LibreOffice (#10); summary-data entry (#11); project-wide undo (#12);
autosave, open and download (#13). The reader is a grad student who
opens the app, pastes a column block from Excel and expects it to just
land.

## Shell

```
┌ bar ─────────────────────────────────────────────────────────────┐
│ ✱barelysig   Project name        ↶ Undo  ↷ Redo    Open  Download │
├ navigator ──┬ sheet ──────────────────────────────────────────────┤
│ Data tables │ Viability                      Column table · Raw   │
│ ▌Viability  │ ┌──────┬──────────┬──────────┬───────────┐          │
│  Growth     │ │      │ ▀ WT     │ ▀ KO     │   Add group│          │
│ + New table │ ├──────┼──────────┼──────────┼───────────┤          │
│             │ │    1 │     1.52 │     3.10 │           │          │
│ Results     │ │    2 │     1.61 │          │           │          │
│ Graphs      │ │    3 │          │     2.95 │           │          │
│             │                                                     │
├─────────────┴─────────────────────────────────────────────────────┤
│ status: selection summary, or what a paste did                     │
└───────────────────────────────────────────────────────────────────┘
```

- **Navigator** on the left, Prism's order: Data tables, Results,
  Graphs (Layouts in Phase 2). Results and Graphs list nothing until 0.4
  and 0.5, and say so. Each item can be renamed (double-click or F2),
  duplicated and deleted from a small menu; deleting says what goes with
  it (analyses and graphs that read the table) and is undoable.
- **New table** opens a dialog with the table types as large choices,
  each with its icon from the sprite and one plain sentence ("Each column
  is a group, each row a replicate. For t-tests and one-way ANOVA."). Only
  the types that exist are offered (Column, Grouped); XY and the rest
  appear when they are built rather than as disabled tiles. The dialog
  also picks raw replicates or summary data (and for Grouped the number
  of replicates), with the same wording the grid will use.
- **First visit / empty project:** the sheet area invites the first
  action: the two table types side by side, plus "Open a project" and
  "Try an example" (a small made-up data set, so a new user sees a filled
  table before typing anything).
- **Look.** The brand gives the colours: ground `#f3f2f2` for chrome,
  white for the sheet, ink `#201e1d`, and the red `#ec3013` used sparingly
  (the active cell, keyboard focus, the current navigator item). A range
  selection is an ink tint, not red, so red never reads as an error. No
  cards, no shadows on the sheet: it is a flat plane with hairline rules.
  System UI font (no webfonts, CLAUDE.md), tabular figures in the grid.
- **The one memorable detail:** each data set's header carries a thin bar
  in its identity colour — the colour its graphs will use (note 02,
  decision 4), so the table and its graphs visibly belong together.

## Store and history (#12)

- One store module (`src/ui/state/store.ts`), read with
  `useSyncExternalStore`, as PlasmidPop's editor store. It holds the
  project, the history, and view state (which sheet is open).
- **History is model-level and pure** (`src/model/history.ts`):
  `{ past, present, future }` of `{ project, label, sheet }`; `push`,
  `undo`, `redo`, capped at 500 steps. Since projects are immutable and
  share structure (note 02), a step costs only what changed. `label`
  comes from `describeEdit`, for "Undo Edit cells". `sheet` lets undo
  bring the user back to where the change was made.
- Every change goes through `store.edit(edit)`, one history step per edit
  (a paste is one `batch`). Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, and the
  buttons in the bar. Typing into cell after cell makes one step per cell,
  as in Excel.
- Opening a file or a saved project starts a fresh history.

## The grid (#9)

Our own component, `src/ui/grid/`. Split in two so most of it is tested
without a DOM: **pure logic** (layout, coordinates, selection, keyboard
commands, editing → edits) and a **thin React view**.

**Layout.** A table becomes a grid of columns: one per subcolumn of each
data set, in order, then the subcolumns of *spare* data sets filling the view
(the first titled "Add group"). A Grouped table has a row-title column first. Rows are the
table's rows, then spare blank rows (enough to fill the view plus 20):
typing into a spare row or a spare data set creates it (and any spare
groups to its left, empty) as part of the same edit (a `batch`). A new
table starts with no groups at all. So the model only holds what the user entered
(note 02: trailing rows are not trimmed, so they must not be created
needlessly).

**Headers.** Two levels: the data set title, spanning its subcolumns, and
under it the subcolumn labels when there is more than one subcolumn (`Y1`,
`Y2`, … for replicates, as Prism; `Mean`, `SD`, `N` for summary data).
The title row is part of the grid — arrow up from the first row reaches
it and typing renames the data set — so titles are entered the same way
as data, as in Prism.

**Coordinates.** A cell is `(row, col)` in grid terms: row `-1` is the
title row, col `-1` the row-title column. A pure `GridLayout` maps them
to model addresses (`{ dataSet, subcolumn, row }`, spare or not). All
commands work in grid coordinates and are turned into model edits at the
end.

**Selection.** An anchor and a focus cell; the range is the rectangle
between them. Shift extends, Ctrl+A selects the data area.

**Keyboard,** as Excel:

| Keys | Does |
|---|---|
| Arrows | Move; with Shift, extend |
| Ctrl+arrows | Jump to the edge of the data (Excel's rule: next filled cell next to a blank) |
| Tab / Shift+Tab | Right / left; at the end of a row Enter returns to the column Tab started in |
| Enter / Shift+Enter | Down / up; commits an edit |
| Home / End, Ctrl+Home / Ctrl+End | Row start / end; first cell / last filled cell |
| PageUp / PageDown | A screen up / down |
| Typing | Starts editing, replacing the cell |
| F2 or double-click | Edits, keeping the value |
| Escape | Cancels the edit |
| Delete / Backspace | Clears the selection (one undo step) |
| Ctrl+D | Fill down: the selection's top row into the rows below |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy, cut, paste (#10) |
| Ctrl+E | Exclude / include the selected values |
| Ctrl+Shift+= / Ctrl+- | Insert / delete rows at the selection |

Columns (data sets) are inserted and deleted from the header's context
menu, which also holds the row commands.

**Values.** Typed text goes through the same number parser as paste. A
cell that isn't a number (`abc`) isn't stored: the edit stays open, the
cell is outlined and the status line says "“abc” isn't a number. Type a
number, or clear the cell with Delete." Display: the value's shortest
form up to 10 significant digits, or the data set's `decimals`; editing
shows the full value. Decimal separator follows the browser's language.
Excluded values are shown struck through in a muted colour.

**Virtualised** in both directions with fixed row height (24 px) and
column widths (per column, default 96 px): only the visible cells plus a
margin are in the DOM, so a 10,000-row paste scrolls smoothly. Headers and
the row-number column stay in place (sticky).

**Accessibility.** `role="grid"` with `aria-rowcount`/`aria-colcount`,
rows and cells carrying `aria-rowindex`/`aria-colindex` (virtualisation
keeps the true indices), headers as `columnheader`/`rowheader`,
`aria-selected` on selected cells. The grid element holds keyboard focus
and points at the active cell with `aria-activedescendant`; the editor is
a real `<input>` labelled with the cell's address ("WT, row 3").

## Paste and copy (#10)

Pure parsing (`src/ui/grid/clipboard.ts`), tested on clipboard captures;
the grid only decides where the block lands.

- **Source.** `text/plain` is read first: Excel, Sheets and LibreOffice
  all put TSV there, with Excel's quoting (a cell with a tab, newline or
  quote is wrapped in `"`, quotes doubled). `text/html` (a `<table>`) is
  the fallback when there is no plain text. Line endings `\r\n`, `\n`,
  `\r`; one trailing newline is not a row; ragged rows are padded with
  empty cells.
- **Numbers.** Empty or blank → `null`, never 0. Accepted: `1.5`, `-2`,
  `+3`, `1e-5`, `1.2E+10`, the Unicode minus `−`, surrounding spaces,
  thousands separators (`1,234.5`, `1.234,5`, `1 234,5`, `1'234.5`), and a
  trailing `%` (kept as shown: `85%` → 85, with a notice). **Decimal comma
  or point is decided for the whole block**: `1,5` can only be a decimal
  comma; `1,234` is ambiguous and follows the browser's language unless
  another cell in the block settles it.
- **Not numbers.** Spreadsheet errors and missing markers (`#N/A`,
  `#DIV/0!`, `#VALUE!`, `#REF!`, `#NUM!`, `#NAME?`, `#NULL!`, `NaN`, `NA`,
  `N/A`, `n/a`, `-`, `—`) and any other text become empty cells, and the
  status line says how many and which kind ("3 cells had #DIV/0! or other
  errors and were left empty"). Nothing is dropped silently.
- **Headers.** If the first row is all text and the rows below are mostly
  numbers, it is taken as data set titles (pasted into the title row).
  In a Grouped table, a first column of text is taken as row titles. The
  status line says so, and one undo takes the whole paste back.
- **Growing.** A block bigger than the table adds the rows and data sets
  it needs (in a Grouped table, whole data sets of the table's replicate
  count). One paste is one `batch`, so one undo.
- **Copy** writes TSV of the selection: values in full precision with a
  `.` decimal point (what Excel and R read back in any locale is not
  guaranteed; `.` is what R and Prism read), empty cells as nothing, the
  title row as text.
- **Captures.** Tests use recorded clipboards, one file per source
  (`src/ui/grid/fixtures/*.json`: every MIME type the clipboard offered).
  A development page (`?capture` in `npm run dev`) records what a paste
  offers and downloads it as such a file, so captures from Excel on
  Windows and macOS, LibreOffice and Google Sheets can be added from any
  machine.

## Summary data (#11)

The formats of note 02 (`mean-sd-n`, `mean-sem-n`, `mean-cv-n`, and the
same without n) plus **`mean-lower-upper`**: mean with the lower and upper
limits of an interval, e.g. a 95% CI, as Prism's "Mean with upper/lower
limits". Like Prism, it is for graphs only: turning a CI back into an SD
needs n and a t quantile, and is better not guessed. The New table dialog
and a "Change data format" dialog pick the format in plain words ("Mean,
SD and n"); the subcolumn headers follow (`Mean`, `SD`, `N`; `Mean`,
`Lower`, `Upper`). A Column table of summary data has one row, so its grid
reads as one row of numbers per group.

## Saving (#13)

- **Autosave** to IndexedDB with Dexie, as PlasmidPop: database
  `barelysig`, table `projects` (`id`, `name`, `text` — the `.bsig`
  itself, so the stored form is the file format with its migrations —
  `updatedAt`). Written 1 s after the last change and on `pagehide`.
  Opening the app restores the most recently changed project. A
  "Recent projects" list (on the welcome screen and in the project menu)
  opens the others.
- **Download** (Ctrl+S): `<name>.bsig`, through `showSaveFilePicker`
  where it exists (handle dropped at once) or an `<a download>`. The bar
  says whether the project has changed since it was last downloaded; the
  work is safe in the browser either way, and the wording says so rather
  than alarming.
- **Open** (Ctrl+O): a file picker, or a `.bsig` dropped anywhere on the
  window. An opened file becomes a new project in the browser (with its
  own id — opening the same file twice gives two, as downloading is the
  only way out). A file that can't be read shows `BsigError`'s message.
- Two tabs on the same project: last write wins. Tab-to-tab locking is a
  follow-up issue, not 0.3.

## Analytics

New `EVENTS`: `table: new-column, new-grouped`, `data: paste, fill-down,
exclude`, `history: undo, redo`, `file: open, download`. Counts of actions
only, never contents.

## Decisions made here

1. **Titles in the grid**, as Prism, rather than in a side panel.
2. **Spare rows and spare data sets** instead of a fixed empty
   rectangle, so the model holds only entered data.
3. **Non-numbers typed into a cell are refused** with a message, and
   non-numbers in a paste become empty cells with a notice.
4. **`85%` pastes as 85**, the number the user sees, not Excel's 0.85.
5. **Copy uses `.` as decimal point** in every locale.
6. **CI entry is graph-only** (`mean-lower-upper`), as in Prism.
