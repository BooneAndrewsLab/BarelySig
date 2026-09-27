# 08. Notebook layout: one page per experiment, with margin notes

Written 2026-09-25 before building #55 and #56, the first items of the
UI revamp milestone. The shell it replaces is note 03's; nothing below
changes the model, the engine or the file format.

## What was asked

Four layouts were drawn for the same experiment (a Column table, a
one-way ANOVA with Dunnett, a bar graph): a Prism-like workbench, data
beside its graph, a notebook, and a figure board
(https://claude.ai/artifact/V7PHbi4aa9ZcTFyF8SWGc8). Several people
preferred **C, the notebook**; the user liked its margin notes most and
asked for that design to be built.

## The idea

Prism's navigator sorts a project by kind: all tables, then all results,
then all graphs. A bench scientist thinks in experiments: "the 48 h
viability plate", with its numbers, the test run on them and the figure.
The notebook groups by that instead.

- **An experiment is a data table and everything made from it**: the
  analyses that read it and the graphs that plot it (or plot an analysis
  of it). It is not a new model object: the table is the experiment, and
  what belongs to it is what the dependency graph already says
  (`dependenciesOf`, walked up to the table). No migration, no new field.
- **The open experiment is one scrolling page**, in reading order:
  title and description, then numbered sections — 1 Data, then each
  analysis, then each graph, in project order. Between the data and the
  rest: **+ Analyze…** and **+ New graph**, where the next step is.
- **Beside each section, a margin note** (#56) in plain words: what the
  section's numbers are, what the test does, what the error bars mean.

```
┌ side ─────────┬ bar ──────────────────────────────────────────────────┐
│ ✱ Project     │ Project › Viability 48 h        ↶ ↷  Hide notes  ?    │
│ EXPERIMENTS   ├───────────────────────────────────────────────────────┤
│ ▣ Viability ◂ │ Viability 48 h                                         │
│ ▣ Growth      │ HeLa, MTT assay… (description)                         │
│ + New exp.    │ ┌ 1 Data ─────────────────────────┐  ┌ note ─────────┐ │
│               │ │ grid                            │  │ Replicates…   │ │
│ ON THIS PAGE  │ └─────────────────────────────────┘  └───────────────┘ │
│ 1 Data        │        ── + Analyze…   + New graph ──                  │
│ 2 One-way…    │ ┌ 2 One-way ANOVA of Viability ───┐  ┌ What this ────┐ │
│ 3 Viability   │ │ reading, tables                 │  │ means         │ │
│               │ └─────────────────────────────────┘  └───────────────┘ │
│ Projects      │ ┌ 3 Viability (graph) ────────────┐  ┌ On this ──────┐ │
│ Open…         │ │ figure                          │  │ figure        │ │
│ Download      │ └─────────────────────────────────┘  └───────────────┘ │
│ Saved…        ├───────────────────────────────────────────────────────┤
│               │ status line                                            │
└───────────────┴───────────────────────────────────────────────────────┘
```

## Decisions

1. **The sheet model stays.** `Sheet` is still table / analysis / graph /
   home, and everything that shows a sheet (a new analysis, undo's
   "where", the Analyze dialog, a link chip) keeps working: the page shown
   is the experiment the sheet belongs to, and the sheet's own section is
   scrolled into view. `store.show` sets a new sheet object each time, so
   clicking the same entry twice scrolls again; an edit without `show`
   keeps the object, so typing never scrolls.
2. **Sections reuse the sheets' insides.** The results views and the
   graph editor are unchanged; they lose their sheet headers, which become
   section headers (`h2`: the page's `h1` is the experiment). Actions move
   with them: Change data format…, Change analysis…, How to read these
   results, Format, Export…. Rename, Duplicate and Delete move from the
   navigator into each section's **⋯** menu and each experiment's menu in
   the sidebar.
3. **The grid gets a bounded box.** It is virtualised inside its own
   scroller, so in a page it gets a height: enough for the rows entered
   plus a few empty ones, between 8 and 16 rows. Keys and paste work as
   before; the page scrolls around it.
4. **The graph's format panel opens on demand.** A section shows the
   figure centred; **Format** (or clicking a part of the figure) opens the
   settings / inspector panel beside it, as before. Mockup C shows no
   panel; a panel always open would halve the figure in a 780 px column.
5. **Sidebar.** The project name (click to rename), the experiments with
   a thumbnail of each one's first graph (the same SVG as the figure,
   scaled; the table's icon until there is a graph) and a one-line summary
   ("One-way ANOVA · 1 graph"), **+ New experiment** (the new-table
   dialog), then **On this page**: the open experiment's sections, which
   scroll to them. File actions (Projects, Open…, Download) and the save
   state sit at its foot, as in the mockup.
6. **Words.** "Experiment" in the sidebar and the new-table dialog's
   title ("New experiment"); the table types keep their names (a Column
   table is still a Column table). The guide says once what an experiment
   is.
7. **Margin notes (#56) are data, written by pure functions**
   (`src/ui/notebook/notes.ts`), tested like the results' reading. Each
   has a kicker, an optional title and one or two sentences:
   - Data: replicates vs summary data (and what summary data can't do:
     rank and paired tests need the values), empty cells aren't zeros,
     paste from Excel.
   - Analysis: what the test asks in plain words; the comparisons and how
     their P is adjusted; that "ns" means no evidence of a difference, not
     "the same"; for normality tests, that a large P is not proof.
   - Graph: what the error bars show (SD / SEM / 95% CI / range, or the
     box's whiskers), where the brackets come from, the export size, and
     that clicking a part formats it.
   A note never states a result (no P values): the section beside it
   does that, and a note that restated it could fall out of step.
8. **Hide notes.** A switch in the bar hides the column, remembered in
   this browser (`localStorage`, per viewer, wrapped in try/catch). Below
   1180 px wide the notes go under their section instead of beside it, so
   a tablet in portrait still reads well.
9. **Look.** Mockup C's: white section cards with a hairline rule on the
   off-white ground, an ink number badge per section, notes on a warmer
   white. Note 03's "no cards" gives way here: in a long page the cards
   are what tell one section from the next. The UI font stays the system
   stack; bundling Archivo (the wordmark's face, used in the mockup) is a
   separate decision.

10. **Width (2026-09-26).** The page fills the main panel (up to
    1920 px) instead of stopping at 1120 px with 780 px sections, which
    left half a wide screen empty. An analysis section uses the width
    rather than stretching a column of text: the reading sits in a band
    across the section with its **key numbers** beside it (the P it goes
    by with its asterisks, the difference with its CI or the number of
    significant pairs, the statistic; two-way: one P per term), the
    reading kept to about 76 characters a line; Prism's label/value
    tables become cards side by side, and tables with columns run across
    the section. The key numbers repeat values from the tables, never
    new ones, so Prism's layout below stays complete (#57 builds on this).

## Prism parity

Prism has no notebook view; its navigator is what this replaces. What a
Prism user needs is still one click away: every table, result and graph
is listed (as an experiment's sections), results read as Prism lays them
out, and a graph still follows its table. Intentional difference: a
result or graph can't be opened alone in the main area; it is always
shown on its experiment's page.

## Testing

- Pure: an experiment's sections and summary (`experiments.ts`), and the
  notes for every table format, analysis kind and plot kind (`notes.ts`).
- Components: the shell test drives the sidebar (create, rename,
  duplicate, delete, undo) and checks that showing an analysis scrolls
  its section into view; results and graph tests read `h2` section
  headings and open Format before touching graph settings.
- e2e: the workflow walks the same path through the page (paste → t test
  → bar graph → export → reload → reopen).
