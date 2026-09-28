# 30. Import: a Nested-table layout

Written 2026-09-27 for #88. Builds on note 10 (opening a data file) and
note 13 (Nested tables' `replicateTitles`).

## What was asked

The user tried opening a real lab spreadsheet — yeast budding-index
counts, three biological replicates, each split into four cell-cycle
stages, one row per field of view — and none of the importer's four
layouts (Each column a group / Rows × columns / Summary / Long) fit it.

## Shape of the file

```
Young Cells (Age 0-1)                                                    ← skipped (title)
Replicate 1              Replicate 2              Replicate 3            ← group header, merged/blank-continued
Unbudded  Small  Medium  Large  Unbudded  Small … (repeated identically)  ← subgroup header
16  17  17  21   25  15  14  18   25  17  21  21                         ← ~250 raw rows, ragged
...
```

Two header rows, and critically **no leading row-label column**: the
first group's columns start at column 0. That is the tell — Grouped's
`buildGrouped` (guess.ts) always treats column 0 as the row-title
column, so on a sheet shaped like this it silently shifts everything by
one column: it reads `"Replicate 1"` as a row-title header, drops it,
and folds columns 1–3 into an unlabelled group. It still returns a
table (`possible` lists "Rows × columns"), just a wrong one — which is
what the user saw as one of the four options that "wasn't right".

Structurally this is exactly a **Nested table** (note 13): a set of
named groups (here, `Replicate 1/2/3`), each split into the same set of
subgroups (`Unbudded`/`Small Budded`/`Medium Budded`/`Large Budded`),
with raw, ragged replicate rows stacked under each subgroup —
`NestedTable.replicateTitles`, shared across every group, was built for
precisely this shared-subgroup-name shape.

## Which level is the "group"?

The sheet's own nesting (Replicate outer, stage inner) is not
necessarily the one worth comparing statistically — comparing
"Replicate 1 vs 2 vs 3" with budding stage as the nested nuisance factor
is an odd question; comparing the four stages with replicate as the
nested subgroup is the ordinary one for this kind of count data. The
file's shape alone doesn't say which the user wants, so (asked
directly) the answer is: don't guess a semantic axis, reuse the
existing **Swap** control (already used by Grouped/Summary to flip which
factor goes across). The importer's default guess mirrors the file's
literal nesting order (top header = groups, second header = shared
subgroups); Swap flips group ↔ subgroup.

## The fifth layout

`LayoutKind` gains `'nested'`, between `'grouped'` and `'summary'`
(`guess.ts`, `LAYOUTS`). Detection (`nestedShape`, shared by the guess
and the builder so they can't drift):

- Two header rows required (no headerless variant — without the second
  row there is nothing to call a subgroup, and that shape is already
  "Each column is a group").
- Row 1: group titles, forward-filled across blank/merged columns,
  starting at column 0 (unlike Grouped, which starts this scan at
  column 1). A sheet with nothing in row 1 at column 0 isn't this shape.
- Row 2: every filled cell across the block must be a label (not a
  number) — this is what tells Nested apart from a two-header-row
  Grouped table whose second row is *replicate numbers* (`1, 2, 3…`);
  `groupedHeaderRows`'s own rule already accepts small integers there,
  Nested's does not.
- Every group's column count must match the first group's, and its
  labels must equal the first group's position by position — a blank
  cell inherits the first group's label there (so the subgroup names
  can be written once, under the first group, or repeated under every
  one, as this file does). A mismatch (different counts, or a stage
  name that disagrees between replicates) means the sheet isn't this
  shape, and Nested is left out of `possible`.
- At least two subgroups per group — one subgroup is just "Each column
  is a group" with a redundant top header.

Building reuses the existing raw/ragged machinery unchanged: `Cube`
gains an optional `subTitles` (Nested's shared subgroup names, kept
alongside `groups`), and `finish()` only special-cases table
construction to attach `replicateTitles: cube.subTitles` when
`cube.type === 'nested'` — row counting, ragged padding, marks and
notes are all already type-generic. Swap is a new `swappedNested`
(transpose `groups` and `subTitles`, plain array transpose, no row
alignment to worry about — unlike Grouped's `swapped`, Nested has no row
factor to preserve across the swap).

## Dialog and preview

`OpenDataDialog`'s two-header preview and `subcolumnLabels` (`replicateTitles`
lookup) already handle Nested's shape with no change (built for the
table-editing grid, item 13); only `LAYOUT_INFO` (name/blurb) and
`madeLine`'s table-kind word needed a `'nested'` case, and the "first
row holds titles" / "Swap" checkboxes needed to also show for a Nested
choice.

## Testing

`guess.test.ts` gets the shape above (plus: blank-inherited subgroup
labels, mismatched subgroup counts between groups — falls back to
`possible` without `'nested'` — mismatched subgroup names, a lone
leading column with no group, single-subgroup sheets, and swap)
alongside the existing fixtures, and a regression fixture for the
"Grouped answers, but shifts one column" sheet this note started from,
asserting `'grouped'` is no longer preferred over `'nested'` there.
