# 10. Opening a data file and guessing its layout

Written 2026-09-26 before building #60 (UI revamp milestone). Note 03
built paste from Excel; this note lets a data file come in the same way,
without opening it in a spreadsheet first.

## What was asked

"Ability to upload/drop in a data file, try autodetect data layout."
Formats: xls, xlsx, csv, tsv and ods ("maybe odt": `.odt` is a text
document; the spreadsheet is `.ods`).

## Decisions

1. **Which files.** Text: `.csv`, `.tsv`, `.tab`, `.txt` (comma, tab,
   semicolon or pipe separated; the separator is sniffed). Spreadsheets:
   `.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.ods`, `.fods`, and `.numbers`
   (read by the same library, less reliably; a file that can't be read
   says so and suggests saving it as `.xlsx` or `.csv`). Macros never run:
   the reader only reads cell values. A Word/Writer table (`.docx`,
   `.odt`) is not read; the message asks for the spreadsheet.
2. **Where they come in.** **Open…** (Ctrl+O) and dropping on the window
   take a data file as well as a `.bsig` or a figure; the start screen
   and the New experiment dialog get **Open a data file…**. The file is
   told apart by its extension (content for `.txt`-like files is always
   read as text). A data file never replaces the open project: it
   becomes **a new experiment in the open project**. From the start
   screen the open project is the blank one, so that makes a new project,
   named after the file.
3. **Nothing is created before the user sees it.** A dialog, **Open data
   file**, shows the guess and a preview of the table it will make, and
   creates the experiment only on **Create**. Cancel leaves the project
   as it was; Create is one undo step.
4. **The reader.** SheetJS Community Edition 0.20.3 (Apache-2.0, fine
   beside our MIT). The npm `xlsx` package is stuck at 0.18.5 with known
   advisories; the maintained build is a tarball on cdn.sheetjs.com, so
   the tarball is **vendored** in `vendor/` and installed from there
   (`"xlsx": "file:vendor/xlsx-0.20.3.tgz"`, its SHA-256 in
   `vendor/README.md`): no install-time or run-time request to a CDN.
   It is **lazy**: loaded only when a spreadsheet is opened, in a **Web
   Worker** (`src/io/import/reader.worker.ts`) that parses the file and
   posts back plain text cells, so a big workbook never blocks the page
   and the ~1 MB library is not in the app shell. It is precached by the
   PWA like the rest of the JS, so opening a file works offline. The
   legacy code pages (`cpexcel`) are loaded too, for old `.xls` files
   that aren't Unicode.
5. **Text files are ours, not SheetJS's.** SheetJS's CSV reader converts
   values by its own rules (dates, locale); ours is the paste parser
   (note 03) generalised from tab to any separator, so pasting and opening
   a file agree on every cell. Encoding: UTF-8 (BOM stripped), UTF-16
   with a BOM, and Windows-1252 when the bytes aren't valid UTF-8 (older
   Excel "CSV" on Windows).
6. **One grid of text cells in between.** Every reader produces the same
   thing: sheets, each a rectangle of strings. The layout guess and the
   table builder only see that, so they're pure and tested without files.
   From a spreadsheet:
   - A number is written in full (`String(v)`: shortest round-trip), never
     as displayed, so nothing is rounded by a cell's number format. A
     percentage-formatted cell becomes the percentage shown with a `%`
     (0.85 → `85%`), which the paste parser reads as 85 with a notice,
     exactly as pasting that cell does.
   - Dates, times, booleans and text are kept as displayed (text, so they
     are never data); formula errors as their code (`#DIV/0!`: an empty
     cell, counted); a formula's cached value is used.
   - **Merged cells** are expanded when they hold text (a header `WT`
     merged over three columns becomes `WT WT WT`), so a merged header
     reads as replicate subcolumns. A merged *number* is not copied into
     the other cells: that would invent data.
   - Hidden rows and columns are read like the others (their values are
     data). Hidden sheets are left out unless no visible sheet has data.
   - Two leading columns of a Column table are recognised and left out:
     a replicate counter (1, 2, 3… under `Rep`, `#`, `Mouse` or nothing)
     and any column without numbers (IDs, notes); the notes name them.
7. **What the guess considers.** First, the block: empty columns and
   trailing empty rows are dropped, and rows above the table are skipped.
   The table is the first run of non-blank rows holding a row about as
   wide as the data (three quarters of the typical width of rows with
   numbers), so a preamble set off by a blank line is skipped, and so is
   a lone title in the first cell right above the table; **Skip rows at
   the top** in the dialog changes it. Then each of four layouts is tried.
   Summary headers win; then long data (a label column whose values
   repeat); then two factors (a first column of labels, unless they count
   replicates, `Mouse 1`, `Rep 2`, beside distinct group titles); else
   each column a group. The guess is preselected and marked, the others
   that make a table stay one click away, and those that don't are shown
   disabled ("Doesn't fit this sheet"):

   | Layout | What it looks like | Makes |
   |---|---|---|
   | **Each column is a group** | a header row of names, numbers under them (ragged = unequal n); no header → groups A, B, … | Column table, individual values |
   | **Rows × columns (two factors)** | a first column of text (row labels), a header of groups; repeated headers (`WT WT WT KO KO KO`) or two header rows (a group row, blank or merged continuation, over a replicate row) = replicate subcolumns | Grouped table, n replicates |
   | **Summary data** | headers naming `Mean`, `SD`, `SEM`, `%CV`, `N` (and `lower`/`upper`) per group: in the header (`WT mean`, `WT SD`, …), as a second header row, or as columns with one row per group (`Group, Mean, SD, N`) | Column table of summary data, or Grouped with row labels |
   | **One row per measurement (long)** | a column of group labels and a column of values, optionally a second label column; other columns (ID, date, notes) ignored | Column table (one factor) or Grouped (two), **reshaped**, and the dialog says so |

   Recognising summary headers is word-based and case-insensitive:
   `mean`, `average`, `avg`; `sd`, `stdev`, `st dev`, `std`, `standard
   deviation`; `sem`, `se`, `s.e.m.`, `standard error`; `cv`, `%cv`; `n`,
   `count`, `size`; `lower`/`upper` (`lcl`, `ucl`, `low`, `high`). A
   format needs a mean; SD, SEM or CV picks the kind; n is optional (the
   "graphs only" formats, note 03).
8. **Unsure is asked, never assumed.** The dialog has: the sheet (when a
   workbook has several; the first with data is picked), the layout
   (radio, the guess preselected and labelled **best guess**), skip rows,
   for text files the separator and decimal mark, for long data which
   column holds the groups (and the second factor, and the values), and
   for two-factor data which factor goes across (the columns). Every
   change re-runs the builder at once and the preview follows.
9. **Cells.** Parsed with the paste parser: `NA`, `n/a`, `#N/A`, blank
   and the other missing markers → empty cell (`null`, never 0); a decimal
   comma is decided for the whole sheet (`1,5`), a semicolon separator
   with it (European Excel); `85%` → 85 with a notice. A cell that isn't
   a number is left empty **and marked in the preview** (its text shown
   struck through in the cell), and counted in the notes under it.
10. **Titles.** Group names come from the header, trimmed. A unit common
    to every group header, in brackets (`WT (mg)`, `KO (mg)`), goes to the
    table's unit instead; a long file's value column header becomes the
    value title and its unit (`Weight (g)` → value title "Weight", unit
    "g"). The experiment is named after the sheet (a workbook with
    several sheets) or the file. Empty titles fall back to `Group A`, as
    in the grid.
11. **Notes under the preview**, plain words, the same as a paste's:
    "Reshaped from one row per measurement: 3 groups." "12 cells of text
    (“bad well”, “—”) aren't numbers and are left empty." "Read with a
    decimal comma." "Skipped 3 rows above the table." "The columns
    ‘Date’ and ‘Notes’ aren't numbers and were left out."
12. **Limits.** A file over 50 MB is refused before reading (it is not
    lab data we can show); a sheet is read up to 10 000 rows and 500
    columns, and the notes say when more were cut. An empty file or sheet
    says so.

## Big files (found with the first real one)

A screening export (3,656 rows × 4 numeric columns, beside ID, gene and
empty columns) froze the page on New graph, and showed two guesses to fix.

- **The beeswarm was cubic** (every point checked against every placed
  point, each candidate against every interval): 3,650 close values took
  about 20 s per group, on every render. It now looks only at the points
  near in value (a run at the end, since points are placed in order), keeps
  their blocked intervals sorted from one point to the next (an insertion
  sort, as they barely move), and picks the free position from the
  blocked stretch around the centre. A property test holds it to the first
  implementation's placements exactly; 3,650 points take about 0.1–0.2 s.
- **Nothing drawn was kept.** Every store change (a notice, a click) made
  the results bridge rehash every analysis input and re-render; every
  render laid the graph out, serialised it and made hit regions again, for
  the page and for the sidebar thumbnail. Now: the bridge ignores store
  changes that leave the project as it was; input hashes are kept per
  table object (same values, checked against the original formula); a
  graph's layout input is the same object while what it is made from is
  unchanged, so the scene, SVG and hit regions are made once
  (`src/graphs/cache.ts`); swarm placements are kept by their values; and
  thumbnails are images, not thousands of live shapes. A re-render went
  from about 1 s to 70 ms on that file.
- **Guesses.** A titled column with nothing in it is left out (named in
  the notes), not made an empty group. A first column of labels nearly all
  different (≥ 90%) over more than 24 rows is IDs, not a row factor, so
  the guess is "each column a group". A long-data group column must name
  each group at least twice on average.

## Words

"Open a data file", never "import" or "upload" in the interface (nothing
is uploaded; it stays on the computer). The layouts are named by what the
user sees in their file, not by table-type jargon; the table type they
make is said in small print under each.

## Prism parity

Prism's "Import data" puts a text file into the current table from a
chosen cell, with options for separators and rows to skip; it does not
guess the table type or reshape long data. We guess and show; the
options (skip rows, separator, decimal mark) cover Prism's. Excel files
in Prism are linked or pasted; here they are read directly.

## Testing

- Pure: the delimited parser (quotes, separators, line endings, BOM),
  separator sniffing, decoding; the layout guess on each layout above,
  with preamble, ragged columns, decimal comma, `NA`, units in headers,
  merged headers; building each table type; notes text.
- Workbooks: small files made by independent writers (openpyxl, odfpy,
  xlwt — `scripts/make-import-fixtures.py`) with numbers, percentages,
  dates, errors, merged headers and several sheets, read by the worker's
  reader code under Node.
- A property: any Column or Grouped table written out as the grid's TSV
  (`copyText`) and read back by the guess gives the same values.
- Components: the dialog shows the guess and preview, switching layouts
  and options updates it, Create adds one experiment (one undo); Open…
  and drop route data files to it. An e2e opens a CSV.
