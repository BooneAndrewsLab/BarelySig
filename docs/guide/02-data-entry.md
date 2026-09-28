# Entering and pasting data

A table works like a spreadsheet: click a cell and type, or paste a block
from a spreadsheet.

## Typing

- **Click a cell and type** to replace what is there; `Enter` keeps it and
  moves down, `Tab` moves right. `Escape` cancels.
- **`F2` or a double-click** edits a cell keeping its value.
- **The top row holds the group names.** Arrow up from the first row (or
  click the header) and type to rename a group. In a Grouped table the
  first column holds the row names, such as the genotypes.
- **Typing past the end** adds rows and groups as needed. Empty groups are
  titled "Add group" until you type in them.
- Only numbers are stored. Something that isn't a number (`abc`) is not
  kept: the cell stays open and the status line says why.

## Empty is not zero

An empty cell means "no value" and is left out of every analysis and
graph. A `0` is a measurement of zero. Clearing a cell (`Delete`) makes it
empty; it never becomes 0.

## Pasting from a spreadsheet

Select a block in Excel, Google Sheets or LibreOffice, copy it, click the
cell where its top-left corner should go, and press `Ctrl+V`.

- **Names.** If the first row is all text and the rows under it are
  numbers, it becomes the group names. In a Grouped table a first column
  of text becomes the row names.
- **Numbers as spreadsheets write them:** `1,234.5`, `1.234,5`, `1e-5`,
  `−2` and `85%` (kept as 85) all read correctly. Whether a comma is a
  decimal comma is decided for the whole block, so `1,5` and `1,234` in
  one paste can't be misread.
- **Errors and missing markers** (`#N/A`, `#DIV/0!`, `NA`, `-`, …) become
  empty cells, and the status line says how many and which kind. Nothing
  is dropped silently.
- **A block bigger than the table** adds the rows and groups it needs.
- One paste is one undo step.

`Ctrl+C` copies the selection as tab-separated text that spreadsheets
and R read back, with every digit kept.

## Opening a data file

Data already saved in a file can come in without copying: **Open…**
(`Ctrl+O`), **Open a data file** on the start screen or in the New
experiment dialog, or drop the file on the window. BarelySig reads `.csv`,
`.tsv`, `.txt`, `.xlsx`, `.xls`, `.xlsm`, `.xlsb` and `.ods` files (Apple
`.numbers` too, less reliably). Nothing is uploaded: the file is read on
your computer.

BarelySig works out how the file is laid out and shows you the table it
will make before making anything:

- **Each column is a group:** group names across the top, values under
  them (columns of different lengths are fine).
- **Rows and columns are two factors:** row names down the left, groups
  across the top. Repeated group names (`WT WT WT KO KO KO`), or one name
  over several columns (merged, or followed by blank titles), are
  replicates.
- **Groups of named subgroups:** two header rows, group names on top
  and the same subgroup names repeated under each (`WT` over
  `Rep 1 Rep 2 Rep 3`, then `KO` over the same), individual values
  below. This makes a [Nested table](17-nested-tables.md).
- **Summary data:** means with SD, SEM or %CV and n, as columns named
  `Mean`, `SD`, `N` with one row per group, or as `WT mean`, `WT SD`, ….
- **One row per measurement:** a column naming the group of each value
  (and perhaps a second factor, such as treatment) and a column of
  values. BarelySig rearranges it into a table and says so.

Its best guess is marked; pick another layout if it guessed wrong. A
two-factor layout shows a swap checkbox right under it, to swap rows and
groups (for a Nested table, groups and subgroups). You can also choose
the sheet of a workbook, skip rows above the table (an instrument's
header lines), say whether the first row holds titles, and for text
files set the separator and the decimal mark. The preview follows each
change.

Why swap groups and subgroups? A nested test compares the **groups**
and counts each **subgroup** as one biological replicate within them.
The two header rows alone don't say which is which, and many files are
laid out the other way round: one block per experiment (`Rep 1` on top)
with the conditions repeated under it. If the preview shows your
replicates as the groups, tick **Swap groups and subgroups**.

Cells are read as a paste reads them: `NA`, `#DIV/0!` and blanks become
empty cells, never 0. A cell of other text is left empty too, and shown
struck through in the preview, so you can see what didn't come in.
Columns that hold no numbers (sample IDs, notes) are left out, and the
list under the preview says which. **Create** adds the table as a new
experiment (from the start screen, a new project named after the file);
one undo takes it back.

## Selecting and editing many cells

- Drag, or hold `Shift` with the arrow keys, to select a range; `Ctrl+A`
  selects all the data.
- `Delete` clears the selection (one undo step).
- `Ctrl+D` fills the selection's top row down into the rows below.
- The right-click menu inserts and deletes rows and groups.

## Excluding a value

To leave a value out without deleting it — an outlier you have a reason
to drop, a failed well — select it and press `Ctrl+E` (or right-click ▸
**Exclude or include values**). It stays in the table, struck through,
and is left out of every analysis and graph; the results say how many
values were excluded. `Ctrl+E` again brings it back.

## Summary data

If you only have means — from a paper, or from another program — create
the table with **Summary data, already averaged** and choose what you
have, such as **Mean, SD and n**. See
[Column and Grouped tables](03-tables.md#summary-data).

See [Keyboard shortcuts](16-shortcuts.md) for every key.
