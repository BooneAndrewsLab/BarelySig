# Getting started

BarelySig makes the statistics and graphs of a bench experiment — a bar
graph with error bars and significance asterisks, a t test or an ANOVA you
can trust — without installing anything. It runs entirely in your browser:
your data never leave your computer, and there is no account.

## From numbers to a figure in five minutes

1. **Start a table.** On the start screen, pick **Column table** (each
   column is a group, each row a replicate) or **Grouped table** (two
   factors, such as genotype × treatment). See
   [Column and Grouped tables](03-tables.md).
2. **Paste your data.** Copy a block of cells in Excel, Google Sheets or
   LibreOffice, click the first cell of the table and press `Ctrl+V`. A
   first row of names becomes the group names. See
   [Entering and pasting data](02-data-entry.md).
3. **Analyze.** Click **Analyze…** under the table and pick a test, or
   click **Help me choose** and answer a few questions about your
   experiment. The results appear further down the same page, with a
   sentence saying what they mean. See
   [Choosing a test](04-choosing-a-test.md).
4. **Graph.** Click **New graph**, next to **Analyze…**. The graph draws the
   mean of each group with its SD and every value as a point; the test you
   ran is offered as significance brackets under **Significance**. See
   [Graphs](12-graphs.md).
5. **Export.** Click **Export…**, choose SVG (for journals) or PNG (for
   slides) and a journal column width. See
   [Exporting figures](14-export.md).

Nothing needs saving along the way: your work is kept in this browser as
you go. Download a `.bsig` file (`Ctrl+S`) to keep a copy of your own or
send it to someone. See [Saving, files and privacy](15-files.md).

## What is on the screen

A project is a notebook of **experiments**. An experiment is one data
table and everything made from it: the analyses run on it and its graphs.

- **The sidebar** on the left: the project's name (click it to rename),
  then its **Experiments**, each with a small picture of its first graph
  and what it holds ("One-way ANOVA · 1 graph"). Click one to open it; its
  **⋯** menu renames, duplicates or deletes it. Deleting says what goes
  with it and can be undone. **New experiment** starts one. **On this
  page** lists the open experiment's sections and jumps to them. At the
  foot: **Projects** (new, close, and the projects kept in this browser),
  **Open…** and **Download**.
- **The page** in the middle is the open experiment, top to bottom: its
  title and a description (click to write one: cell line, assay, date),
  then numbered sections: **1 Data** (the table), then each analysis, then
  each graph. **Analyze…** and **New graph** sit under the data. Each
  section's **⋯** menu renames or deletes it, and **▾** folds it away.
- **The bar** at the top says where you are and holds **Undo**, **Redo**
  and **?** for this guide.
- **The status line** at the bottom says what the selection holds, or what
  a paste just did.

Everything is live: change a value in a table and its analyses rerun and
its graphs redraw by themselves.

## Try it first

**Try an example** on the start screen opens a project with made-up
numbers: a Column table with a one-way ANOVA and its bar graph with
significance brackets, and a Grouped table with a two-way ANOVA and its
grouped bars, so you can look around before typing anything.

## The statistics engine

The numbers come from R, the statistics software, running inside your
browser. The first analysis of a visit downloads it (tens of megabytes,
once; after that it comes from the browser's cache and works offline) and
takes a few seconds to start. Every analysis is checked against R on the
desktop, on test cases that include missing values, ties, tiny groups and
very small P values, before a version of BarelySig is released.
