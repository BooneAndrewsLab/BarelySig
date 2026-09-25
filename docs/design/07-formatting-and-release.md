# 07. Formatting and first release: inspector, box/violin, grouped bars, guide, release

Written 2026-09-24 before building milestone 1.0 (#30–#36, #44–#46,
#48, #49). Builds on note 05 (graph model, layout, recipes) and note 06
(two-way ANOVA, Kruskal-Wallis).

## What was asked

- **Click-to-format inspector** (#30): select any element of a graph
  (axis, ticks, title, data set, error bars, legend, bracket) and edit
  it: range, tick interval, log scale, number format; fonts, sizes,
  colours, line widths, symbols, fills, bar width and spacing. Overrides
  sit on top of the theme and can be reset.
- **Drag brackets** (#45) to move them up or down, stored per bracket,
  with a keyboard alternative.
- **Box-and-whisker and violin plots** (#31), whiskers stated, the
  violin's KDE computed in the engine with its bandwidth stated.
- **Grouped bar graphs** (#32), interleaved or separated, with error
  bars, points and brackets from two-way ANOVA comparisons.
- **Exact Kruskal-Wallis P** for small samples (#49) and **exact
  Spearman P** for 10–17 pairs (#48).
- **Say whether a reopened figure's numbers changed** under a newer
  engine (#46).
- **User guide** in the app (#34), a **wet-lab usability pass** (#33),
  **end-to-end tests** (#35), **real clipboard captures** (#44) and the
  **first public release** (#36).

## Formatting model (#30)

Overrides live in `GraphFormat`, next to what is there already, so a
graph stays one serialisable value and every change is one undoable
`setGraph` edit. Everything new is optional: a graph without overrides
is what 0.5 drew, and a `.bsig` from 0.5 reads unchanged (no schema
step; the codec writes the new fields only when set).

```ts
interface GraphFormat {
  // 0.5: yTitle, yMin, yMax, bracketLabels, starScheme, showNs, hiddenBrackets
  yScale?: 'log10';                  // unset = linear
  yStep?: number;                    // major tick interval; unset = automatic
  yDecimals?: number;                // tick label decimals; unset = what the step needs
  xAngle?: 45 | 90;                  // group labels turned; unset = level, wrapped
  showTitle?: boolean;               // the graph's title on the figure (off by default)
  legend?: 'right' | 'top' | 'none'; // grouped graphs; unset = right
  style?: StyleOverrides;            // theme values, below
  symbols?: Record<DataSetId, 'circle' | 'square' | 'triangle' | 'diamond'>;
  bracketOffsets?: Record<BracketKey, number>; // points, up (#45)
}
```

- **Style overrides are a flat record over a fixed list of theme
  paths** (`font.tick`, `font.axisTitle`, `font.title`, `font.bracket`,
  `font.legend`, `lines.axis`, `lines.tick`, `lines.tickLength`,
  `lines.error`, `lines.barEdge`, `lines.bracket`, `lines.pointEdge`,
  `pointSize`, `pointOpacity`, `barWidth`, `barLighten`, `capWidth`,
  `ticks`, `spines`). The resolved theme is the named (or fixed) theme
  with these applied, so a graph keeps following improvements to Modern
  wherever the user didn't change something, and a figure recipe, whose
  theme is fixed, still carries the overrides. The codec writes them in
  the list's order (CLAUDE.md, Lessons: fixed order, never spreading).
- **Colours stay on the table** (CLAUDE.md, typed tables): a data set's
  colour is `DataSet.color`, shared by every graph of the table, and the
  inspector edits it there ("Colour, in every graph of this table").
  Symbols are per graph.
- **Reset** removes the overrides of the selected element (its style
  keys, symbol, offset, axis settings); "Reset all formatting" on the
  graph removes every override. Both are single undoable edits.
- **Log axis:** base 10, ticks at powers of ten labelled `0.01`…`1000`
  and `10⁻⁴`/`10⁵` beyond, minor ticks at 2–9. Values ≤ 0 can't be
  shown and are left out with a note saying how many. Bars on a log
  axis rise from the bottom of the axis, as Prism draws them; the range
  is automatic from the data unless set.
- **Tick interval and decimals** apply to linear axes; a step that would
  make more than 50 ticks is ignored with a note (the property test's
  lesson from 0.5).

## Inspector (#30)

- The graph sheet's settings column becomes the inspector. With nothing
  selected it shows the graph's settings (plot, error bars, brackets,
  look, size) and "Click any part of the graph to format it".
- **Selecting**: clicking the figure picks the element under the
  pointer from *hit regions* computed from the scene (`hitRegions(scene)`,
  pure): each mark's bounding box padded to at least 6 px on screen, so a
  0.75 pt axis is easy to hit; the smallest region containing the point
  wins. Regions group marks into elements:

  | Element | Marks | Controls |
  |---|---|---|
  | Y axis | axis-y, tick-y, tick-label | range, log, tick interval, decimals, tick label size, line width, tick length, ticks in/out |
  | Axis title | axis-title | text, size |
  | X axis | axis-x, tick-x, group-label | label size, angle, line width |
  | Data set *X* | bar, point, box, violin, centre (by data set) | colour (table), symbol; for all data sets: bar width, fill lightness, edge width, point size and opacity |
  | Error bars | error, error-cap | SD/SEM/CI/range, line width, cap width |
  | Bracket *A vs. B* | bracket, bracket-label | label style, hide, move up/down, size, line width |
  | Legend | legend | position, size |
  | Title | title | show, text (the graph's name), size |

- The selected element is outlined on an overlay drawn over the figure,
  never in the scene, so no export can contain it. Esc or clicking the
  background returns to the graph's settings; Tab moves through elements
  (keyboard access), Enter selects.
- The overlay and the hit regions are computed from the same scene the
  SVG is, so a selection can't drift from what is drawn.

## Dragging brackets (#45)

- Pointer down on a bracket (or its label), drag vertically: the bracket
  follows live (the drag is local state), and on release one `setGraph`
  edit stores `bracketOffsets[key]` in points. Arrow keys move the
  selected bracket 1 pt (Shift: 5 pt). "Reset" puts it back.
- Offsets are applied during stacking: a raised bracket raises the
  brackets stacked on it, so dragging never makes two overlap. A
  bracket's automatic place is already the lowest that clears the data
  and the brackets under it, so it can be raised and brought back down,
  never lowered into the data. The top margin grows for raised brackets
  as it does for stacked ones.
- The offset is part of the format, so it is saved, undone, and kept in
  figure recipes.

## Box and violin plots (#31)

```ts
type ColumnPlot =
  | { kind: 'bars'; error: ErrorBar; points: boolean }
  | { kind: 'dots'; center: 'mean' | 'median'; error: ErrorBar }
  | { kind: 'box'; whiskers: Whiskers; points: 'none' | 'outliers' | 'all' }
  | { kind: 'violin'; inner: 'quartiles' | 'box' | 'points' | 'none'; smoothing: number };
type Whiskers = 'tukey' | 'min-max' | 'p10-90' | 'p5-95' | 'p2.5-97.5' | 'p1-99';
```

- **Statistics from R**, as error bars are (note 05, decision 3). The
  graph's virtual summary becomes its own internal analysis kind,
  `graph-summary` (never listed in the Analyze dialog, never saved as an
  analysis): per plotted cell, what the descriptive statistics give,
  plus — for box and violin plots — whisker ends, the values beyond them,
  and the KDE. One kind for every graph keeps one path; its R reuses
  descriptive's `bs_describe`.
- **Box:** Q1, median and Q3 by Prism's percentile rule (R type 6,
  already used for descriptive statistics). Whiskers as Prism offers
  them: **Tukey** (to the most extreme value within 1.5 IQR of the box;
  values beyond are drawn as points), **min to max**, or the 10–90,
  5–95, 2.5–97.5 and 1–99 percentiles (values beyond drawn). Prism's
  default is min to max; so is ours, with the individual values shown on
  top (seaborn-style "show the data"); with Tukey or percentiles the
  default is outliers only. The notes under the graph state the whiskers.
- **Violin:** Gaussian KDE with **Silverman's rule of thumb** bandwidth
  (R's `bw.nrd0`: 0.9 · min(SD, IQR/1.34) · n^−1/5) times a smoothing
  factor (1 by default; the inspector offers 0.5–2), evaluated exactly
  (Σ φ((y − xᵢ)/h) / nh at 64 points) rather than through `density()`,
  whose FFT binning is approximate. The violin is **truncated at the
  smallest and largest value**, as Prism draws it, so it never suggests
  values that weren't measured. Width: the widest violin fills 80% of its
  slot and the others scale by density (one shared scale, so widths
  compare between groups). Inner marks: median and quartiles as lines
  (Prism's default), a thin box, the points (beeswarm), or none. The
  notes state the kernel, the bandwidth rule and each group's h.
- **Summary data** (mean, SD, n) has no quartiles or distribution: box
  and violin plots of it say so and draw nothing, rather than guessing.
  Groups with fewer than 3 values get no violin (a KDE of two points
  says nothing), noted.
- On a **log axis** the violin's KDE is computed on log₁₀ of the values
  (flag in the request), so it has the same shape it would have on a
  linear axis of the logs.
- **Oracle:** quartiles against `quantile(type = 6)`; Tukey whiskers
  and outliers by an explicit loop over sorted values; percentile
  whiskers against `quantile(type = 6)`; bandwidth against `bw.nrd0`
  and the written-out formula; the KDE against a loop over points of
  `dnorm`. Edge cases: n = 1, 2, 3, ties, zero IQR (bw.nrd0 falls back to
  SD, then to 0.9 · |x₁| · n^−1/5, then 1), an outlier on each side.

## Grouped bar graphs (#32)

- Graphs of Grouped tables: `plot: { kind: 'grouped-bars'; arrangement:
  'interleaved' | 'separated'; error: ErrorBar; points: boolean }`
  (`GroupedPlot`; a graph's plot union is Column or Grouped by its
  table's type, checked by `validateProject`).
  - **Interleaved** (Prism's default): one cluster per row (row title
    under it), one bar per data set in it, coloured by data set, with a
    legend.
  - **Separated:** one cluster per data set (data set title under it),
    one bar per row, labelled by row, coloured by data set; no legend.
- The summary covers every cell (row × data set), raw or summary data;
  error bars from R as for Column graphs.
- **Brackets from two-way ANOVA comparisons**, keyed
  `<analysis>/<family level>/<a>/<b>` for the families that compare
  cells of the graph: within rows (the default family; columns compared
  in each row: brackets inside a cluster when interleaved), within
  columns (rows compared in each data set), and all cells. Main-effect
  comparisons compare marginal means, which no bar shows: they give no
  brackets, and the bracket list says so. The two-way result gains each
  family's level id (its version is bumped, so old results recompute).
- The **legend** is a scene mark (swatch + label per data set), placed
  right of the plot or above it, and is click-to-format.

## Exact Kruskal-Wallis P (#49)

- **Exact P** when the permutation distribution can be counted within a
  fixed budget, **even with ties**, labelled "exact"; otherwise the
  chi-square approximation, labelled "approximate", as now.
- **Algorithm:** dynamic programming over the ranks in order. Each
  rank (doubled midranks, whole numbers, as the rank tests use) goes to
  one of the k groups; a state is the counts so far and the rank sums of
  the first k − 1 groups (the last group's sum is what remains). States
  with equal keys are merged by adding their counts (`rowsum`). At the
  end, each state's statistic T = Σ Sᵢ² · (L / nᵢ), L = lcm(nᵢ), is a
  whole number, so "at least as extreme as observed" is exact. P = Σ
  counts with T ≥ T_obs / total.
- **Budget:** the exact count runs when an estimate of the states it
  visits, from the group sizes alone, is within 260,000 (a hard cap of
  1.2 million stops it anyway), so the choice depends on the data, never
  on the computer's speed. See As built for what that covers.
- **Reference:** full enumeration of every assignment (recursive
  `combn`) for small cases in the oracle, independent of the DP, and
  `kruskal.test`'s H for the statistic. Cases: 3 × 3, 3 × 4 with ties,
  2 + 3 + 4, 4 × 3, all ties but one.

## Exact Spearman P (#48)

The pairing's Spearman r (Wilcoxon results) would need the null
distribution of Σ i·π(i) over n! permutations. The standard counting
method goes over subsets of used ranks (2ⁿ states × partial sums): for
17 pairs, some 4·10⁷ cells, too slow for R running in WebAssembly for a
secondary statistic whose last digits are all that differ. **Deferred to
Phase 2** with this estimate; the results already say which method was
used.

## Numbers under a newer engine (#46)

- When a recipe (an exported figure or "Restore this figure") opens in
  an app whose engine fingerprint differs from the recipe's, the session
  keeps the recipe's stored results as a **baseline**. Once every
  analysis the graph uses has recomputed, the graph sheet compares the
  new results with the baseline number by number, to the fixtures'
  tolerance (1e-6 relative, absolute at 0), and says either
  "Recomputed with a newer engine (BarelySig x, R y): every number is
  the same." or "Recomputed with a newer engine: 2 numbers changed", with
  a list of each: which analysis, which value (P, t, mean of Control, …),
  old and new. The baseline is dropped when the user edits the data.
- The comparison is a pure function over two result values (paths and
  numbers), tested on constructed pairs.

## User guide (#34)

- `docs/guide/NN-*.md`, bundled with the app (Vite `?raw`) and shown in a
  Help panel, as PlasmidPop's: a small Markdown renderer of our own (no
  dependency, no remote content), a table of contents, deep links from
  the app ("What is SEM?" next to the error bar choice, "How to read
  these results" on every results sheet).
- Pages: getting started (the 5-minute path to a bar graph with
  asterisks), entering and pasting data, Column and Grouped tables,
  summary data, each analysis (what it assumes, when to use it, how to
  read the results, what Prism calls it), graphs, formatting, export and
  reproducible figures, saving and privacy.
- A test checks that every link in the guide resolves and every
  analysis kind has a page.

## Usability pass (#33)

Walk the app as a grad student with no statistics background: create a
table, paste, analyse, graph, export. Fix what is confusing; results
text is already plain (note 06), so this is mostly labels, empty states,
first-run hints and the graph sheet, which gains the most in this
milestone. Findings and fixes are listed under "As built".

## End-to-end tests (#35)

Playwright (Chromium) against `vite preview` of a production build:
paste a block from "Excel" (a real clipboard event with `text/plain`
and `text/html`) → t test → bar graph with asterisks → export SVG and
PNG (checks the downloads' recipes) → download the `.bsig`, reload,
reopen it. WebR runs for real (the self-hosted runtime is staged by
`webr:fetch`). `npm run e2e`, not part of `npm run check` (it builds and
takes a minute); CI runs it as its own job with Playwright's Chromium.

## Clipboard captures (#44)

Real captures need Excel on Windows and macOS, Google Sheets, LibreOffice
and Numbers, none of which are on this machine. The capture page exists
(`/?capture`); recording them needs the user (or a lab member) and stays
open, but it doesn't block the release: the constructed fixtures follow
each application's documented clipboard format.

## First public release (#36)

- Prepared here: `deploy.yml` (on GitHub Releases only, as PlasmidPop:
  build with `BASE_PATH=/BarelySig/` and the Matomo variables, deploy to
  Pages), `CITATION.cff`, `.zenodo.json`, version 1.0.0 in
  `package.json`, release notes.
- **Left to the user**, since they are public and hard to undo: making
  the repository public, enabling Pages, connecting Zenodo, and
  publishing the release that triggers the deploy.

## As built

### Inspector and brackets (#30, #45)

- As designed. The inspector's element list ("Format: …") is the
  keyboard route to every element; clicking the figure picks from hit
  regions at least 5 pt across. Outlines: each mark of a data set or the
  error bars, one box around anything else.
- Number fields commit on Enter or leaving the field (empty = automatic
  or the theme's value), so typing "12" is one undo step, not two.
- Tick label size and axis width are shared by both axes (one theme
  value each); the inspector says "both axes".
- Brackets are dragged on the figure (a live preview, one edit on
  release) or moved with the arrow keys (Shift: 5 pt) once selected.
- A property test of the axis found a subnormal span again, this time
  inside the axis itself; it widens such spans on its own now.
- The file's round-trip property generated too few graphs to see every
  new field (9 graphs in 200 sessions); graphs are now generated four
  times as often, and dropping a field is caught every run.

### Box and violin plots (#31)

- As designed; `graph-summary` replaces the descriptive run behind every
  graph (bars and dots read the same numbers from it). Its fixtures check
  whiskers, quartiles, bandwidths and the KDE against written-out
  references, and `density()` roughly, since its FFT binning is
  approximate.
- WebR's conversion unboxes a list of one value that jsonlite keeps as a
  list (the oracle marks such lists `I()`); the parity test follows the
  fixture's shape there.
- The layout found two older faults while growing its property test:
  the last bracket pass laid out at a top margin it had just raised (the
  labels ran off the page), and in Classic the top bracket crossed the
  frame. Brackets now stay inside a boxed frame by raising the axis, as
  Prism does, and fall back to a taller top margin when raising doesn't
  help (the data sits low). Brackets dragged so high that no room can be
  made stop at the top of the figure.

### Grouped bar graphs (#32)

- As designed. A graph's plot is `ColumnPlot | GroupedPlot`, and
  `validateProject` refuses a plot that doesn't fit its table. The
  layout knows clusters (consecutive groups sharing 80% of a slot, bars
  nearly touching), per-bar labels (separated) and cluster labels, and a
  legend at the right or above; a cell's marks belong to its data set,
  so clicking a bar formats the data set.
- Two-way comparisons are keyed by cells (`<analysis>/<row>/<data
  set>/<row>/<data set>`); the two-way result names each family's row or
  data set (`level`; its version is 2, so older results recompute).
  Choices read "Day 1: WT vs. KO"; main-effect comparisons are listed
  with a note that they give no brackets.

### Exact Kruskal-Wallis P (#49)

- The count runs over doubled midranks with states packed into one
  whole-number key and merged with `rowsum`, as designed. A budget on
  the states of one step (the first plan) let 4 × 4 × 4 × 4 run for 19 s
  and 7 × 7 × 7 for 3 s natively; the budget is on the whole count
  instead, decided before it starts from an estimate (for each vector
  of counts, the smaller of the ways to reach it and the number of
  distinct rank sums), which was within a factor of 3 of the real work
  from 2 to 5 groups. Exact: three groups of up to 6, four groups of 3,
  two groups of up to 31 each (in WebR: 3 × 5 in 0.3 s, 4 × 3 in 0.8 s).
  Approximate: four groups of 4, three of 7, five of 2, and anything larger.
- References: brute-force enumeration (up to 2 million ways) and, for
  two untied groups, `wilcox.test`'s exact P. With ties, R's exact
  two-sided P doubles the smaller tail while Kruskal-Wallis counts "at
  least as far from the mean rank sum either way", so tied two-group
  cases aren't checked against it.
- The brute-force references would take minutes in WebR, so their
  fixtures say `parity: false` and the parity test skips them; the
  analysis's own test runs every case in WebR.

### Exact Spearman P (#48)

Deferred to Phase 2 as planned.

### Numbers under a newer engine (#46)

- As designed. The session keeps a reopened figure's stored results
  when its engine differs from the app's; the graph sheet says
  "Recomputing…", then either that every number is the same or lists
  what changed ("Graph statistics: WT: mean was 10, now 10.5"), at most
  eight lines. It holds while the figure's tables and analyses are the
  ones it was opened with (formatting the graph doesn't end it).
- A long vector (a violin's density) that changed is one line, not 64.

### User guide (#34)

- Ported from PlasmidPop: the Markdown subset, the dialog (a list of
  pages and the page), the **?** button in the bar and the `?` key
  (except where typing: text fields and the data grid), and
  `openGuide()` for deep links: "How to read these results" on every
  results sheet, "SD, SEM or CI?" beside the error bars.
- Sixteen pages in `docs/guide/`. The parser also reads `_emphasis_`,
  since Prettier (run on the docs by `npm run check`) rewrites
  `*emphasis*` that way. Lists are flat: the parser has no nesting.
- Tests: every link resolves (sections too) and none leaves the site,
  every analysis kind has a page, the words a results sheet uses are
  explained somewhere.

### End-to-end tests (#35)

- `e2e/workflow.spec.ts`: create a Column table, paste an Excel-style
  block (tab-separated, header row, CRLF) at the first cell, run a t test
  in the Analyze dialog, make a graph and check its bracket reads
  "****", export SVG (recipe, size) and PNG at 600 DPI (signature,
  `pHYs`, recipe), download the `.bsig`, reload (the project comes back
  from the browser with its results), reopen the `.bsig` and the
  exported SVG. WebR runs for real; the whole test takes about 8 s once
  built.
- The paste is a dispatched `paste` event carrying a `DataTransfer`, the
  same thing a browser delivers; a real clipboard needs the captures of
  #44. Downloads go through the `<a download>` path (the test removes
  `showSaveFilePicker`), which is what Firefox and Safari use.
- `npm run e2e` (builds, then serves with `vite preview`); CI runs it as
  its own job with Playwright's Chromium.

## Decisions made here

1. **Overrides in `GraphFormat`, style as a flat record over a fixed
   list of theme paths**, applied over the named theme.
2. **Colours stay on the table**; symbols are per graph.
3. **Hit regions from the scene** for selecting, an overlay for the
   outline; nothing on screen that exports could pick up.
4. **One internal `graph-summary` analysis** for every graph's
   statistics.
5. **Box whiskers min to max by default (Prism), values shown on top**;
   violins truncated at the data, Silverman bandwidth, exact KDE.
6. **Grouped bars interleaved by default, brackets from within-row
   comparisons**; main-effect comparisons give none.
7. **Exact Kruskal-Wallis within a 200,000-state budget**, decided from
   the data alone.
8. **Exact Spearman deferred** to Phase 2.
9. **Public, irreversible release steps left to the user.**
