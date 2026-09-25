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
