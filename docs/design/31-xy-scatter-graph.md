# 31. XY scatter graph

Written 2026-09-28 for #87 ("XY scatter graph: points, fitted line,
confidence/prediction band"). Builds on note 29 (XY tables, linear
regression, correlation — which deferred this graph explicitly) and note
28 (splitting a large table-type addition's scope). #93 (connected-line
and individual-trace plot styles for XY tables) sits on top of whatever
this note builds; it is not this note's job.

## What was asked, and the scoping decision

Note 29 shipped the XY table type and linear regression/correlation with
no graph, because every existing graph (`src/graphs/layout.ts`'s
`GroupInput[]`) is drawn on a single categorical axis — one slot per
group, positioned by array index, with one continuous *value* axis (y).
An XY scatter needs two independent continuous axes, which is a rendering
path this app doesn't have yet, not a new `GraphPlot` variant bolted onto
`layoutColumn`.

This note builds that path, and the scatter plot on top of it: points,
an optional fitted regression line (from a `linear-regression` analysis
already in the project), and an optional confidence or prediction band
around it.

**Scoped out, filed as follow-ups:**

- Connected-line and individual-replicate-trace plot styles (#93) — a
  different way of drawing an XY table's series, on top of this note's
  axis/scene work.
- Nonlinear regression curves (#37) — the fitted line here is linear
  regression only; #37's dose-response curves get their own fit-drawing
  once that analysis exists.
- "Help me choose" wiring for XY tables (unchanged from note 29's
  deferral).

## The gap this note closes

Confirmed by reading the current graph pipeline end to end
(`src/model/project.ts`, `src/graphs/layout.ts`, `axis.ts`, `data.ts`,
`scene.ts`, `drawn.ts`, `renderer.ts`, `render.worker.ts`, `hit.ts`,
`src/model/validate.ts`, `src/analyses/linear-regression/`):

- `GraphPlot = ColumnPlot | GroupedPlot` (`project.ts`) has no XY
  variant. `GraphFormat` has y-axis fields only (`yTitle/yMin/yMax/
  yScale/yStep/yDecimals`) — no x equivalents at all, because no plot
  kind has ever needed an independent x-axis; `xAngle` is a group-*label*
  rotation, not an axis property.
- `layoutColumn` (`layout.ts`) positions groups with `plotW / nSlots`, a
  band scale by array index. There is no continuous x-domain anywhere in
  it.
- `axis.ts`'s `valueAxis`/`ValueAxis` (linear or log₁₀, `frac(v)` mapping
  a value to 0..1 of the axis span) is already generic — it takes no
  "this is y" assumption — but is only ever called once per graph, for y.
  It is directly reusable for x with no changes to the module itself.
- `makeGraphInput` (`data.ts`) branches on `table.type` (`column` /
  `grouped` / `nested`) and otherwise refuses with "This plot is for
  Column tables; choose grouped bars." It reads a `graph-summary`
  analysis result shaped for bar/box/violin statistics (mean, SD, SEM,
  quartiles, KDE) — none of which an XY scatter needs. `xySeries`
  (`src/model/selectors.ts`) already exists and returns exactly the
  per-series `{row, x, y}[]` points a scatter needs, built from the
  table's own missing-X-drops-the-row rule (note 29).
- `Scene`'s `Mark` union (`rect | line | path | circle | text`, each
  tagged `{role, ref}` for click-to-format) needs no new mark kinds:
  points are `circle`, a fitted line is `path`, a band is a filled
  `path` (both already support `fill`/`opacity`). `drawn.ts`/`hit.ts`
  are mark-role-driven and need new roles recognized, not new
  machinery.
- `render.worker.ts` calls `layoutColumn(req.input)` at one hardcoded
  site for both `'scene'` and `'draw'` requests — the one place that
  must learn to dispatch to a second layout function.
- `validate.ts`'s plot-vs-table check is a single XOR:
  `(t.type === 'grouped') !== (g.plot.kind === 'grouped-bars')`. XY
  introduces a second special pairing, so this becomes a real
  lookup rather than a one-off XOR.
- `linear-regression`'s `RegressionOutcome` (ran: true case) has slope,
  intercept and their own 95% CIs, R², the F-test, residuals and the
  runs test — but no pointwise confidence/prediction band. Drawing a
  band needs new statistics: `predict.lm(fit, newdata, interval=,
  se.fit=TRUE)` evaluated over a grid of x, not derivable from
  slope/intercept CIs alone. This is new analysis-side scope (R code,
  `types.ts`, oracle fixtures), not purely rendering.
- `DataSection.tsx`'s "New graph" button is hidden outright for
  `table.type === 'xy'`; `actions.ts`'s `addGraph` has no XY branch for
  a default plot.

## Design

### Model (`src/model/project.ts`)

```ts
export interface XyPlot {
  readonly kind: 'xy-scatter';
  /** Show each series' (x, y) points. */
  readonly points: boolean;
  /** Draw the fitted line from this graph's linear-regression analysis (graph.analyses[0]), if it has one. */
  readonly fit: boolean;
  /** Band around the fit; meaningless (ignored) unless fit is true. */
  readonly band: 'confidence' | 'prediction' | 'none';
}

export type GraphPlot = ColumnPlot | GroupedPlot | XyPlot;
```

An XY graph's `analyses` (the existing `Graph.analyses: Id[]`, today
used for bracket-giving comparisons) holds the id of the one
`linear-regression` analysis it fits, when `plot.fit` is true —
`graphDependencies` already includes `analyses` in recompute, so this
needs no dependency-graph change. `bracketChoices`/comparisons reads of
`graph.analyses` are column/grouped-only and stay untouched; the XY
branch in `data.ts` reads `graph.analyses[0]` itself instead.

`GraphFormat` gains the x equivalents of its y fields:

```ts
xTitle?: string;
xMin?: number;
xMax?: number;
xScale?: 'log10';
xStep?: number;
xDecimals?: number;
```

All optional, all ignored by every non-XY plot kind (same pattern as
the existing y fields being ignored where meaningless, e.g. bars have
no `yScale` meaning outside their own axis).

`GRAPH_DEFAULTS`/`addGraph` (`actions.ts`) gets an `xy` branch: default
`{ kind: 'xy-scatter', points: true, fit: false, band: 'none' }` —
points only, matching Prism's own default XY graph (no fit until the
user asks for one) and note 29's "regression is a separate step from
plotting" framing.

### Data (`src/graphs/data.ts`, `src/graphs/xy.ts` — new)

A new `xyGraphInput(project, graph)` in `data.ts`, parallel to
`makeGraphInput`, taking the `xy` branch instead of falling through to
the "This plot is for Column tables" refusal:

- Calls `xySeries(table, plotted dataSets)` for each Y series' points.
- If `plot.fit`, reads the referenced `linear-regression` analysis
  result's matching series `RegressionOutcome`; `ran: false` series are
  skipped with a note (same "why" wording the results view already
  uses), not an error for the whole graph.
- If `plot.band !== 'none'`, reads the new band arrays off that
  `RegressionOutcome` (see Analysis section).
- Produces a new `XyGraphInput` type (not `LayoutInput`/`GroupInput` —
  those stay column/grouped/nested-only, unchanged): per-series id,
  title, color, `points: {x,y}[]`, optional `fit: {x,y}[]` (a sorted
  polyline, not just two endpoints — a straight line only needs its
  endpoints, but reusing one "evaluated at a grid of x" shape keeps this
  forward-compatible with #37's nonlinear curves), optional
  `band: {x,y0,y1}[]`; plus `xTitle/xMin.../yTitle/yMin...` resolved via
  `axis.ts`'s existing `valueAxis` called twice (once per axis) — no
  changes needed to `axis.ts` itself.

### Layout (`src/graphs/xy.ts` — new)

`layoutXy(input: XyGraphInput): Scene`, parallel to (not inside)
`layoutColumn`. Two `valueAxis` calls (x and y) instead of one;
positions come from `xAxis.frac(x)`/`yAxis.frac(y)` directly (both
already 0..1-of-span mappers) rather than `layoutColumn`'s
index-into-slots math. Produces:

- one `circle` mark per point, `role: 'xy-point'`, `ref` = series id
  (reuses the palette's per-series colour, translucent + thin edge, per
  CLAUDE.md's graph look);
- one `path` mark per series' fit line (if present), `role: 'fit-line'`,
  `ref` = series id;
- one filled `path` mark per series' band (if present), `role: 'band'`,
  `ref` = series id, drawn *before* the fit line and points so it sits
  underneath;
- axis tick/line marks for both axes, reusing the same tick-drawing
  helpers `layoutColumn` already uses (extracted if they're not already
  axis-orientation-agnostic — most of `axis.ts`'s output already is).

### Rendering plumbing (`renderer.ts`, `render.worker.ts`)

`RenderRequest`'s `input` becomes a tagged union:
`{ kind: 'column'; input: LayoutInput } | { kind: 'xy'; input:
XyGraphInput }`. `render.worker.ts`'s one `layoutColumn(req.input)` call
site becomes a two-way dispatch on `req.input.kind`. Everything
downstream of `Scene` (`drawnParts`, `paintScene`, `OffscreenCanvas`,
transferables) is already scene-shaped and needs no changes.

### Hit-testing (`src/graphs/hit.ts`)

`elementOf`'s switch gains: `'xy-point'` → `` `series:${ref}` `` (groups
with the existing per-series click-to-format, same as a column plot's
`point`/`bar` roles today); `'fit-line'` → `` `fit-line:${ref}` ``;
`'band'` → `` `band:${ref}` ``, each its own formattable element (line
style/width/colour; band fill/opacity), the same pattern `'error-bars'`
already uses for a non-series, still-formattable part of the graph.
`drawn.ts`'s `outlinesOf` extends its per-mark (not unioned) box
handling to `'xy-point'`/`series:` the same way it already does for
column/grouped series, so many points don't collapse to one bounding
box.

### Validation (`src/model/validate.ts`)

The single XOR at the plot-vs-table check becomes a lookup:

```ts
const PLOT_TABLE_TYPES: Readonly<Record<GraphPlot['kind'], TableType>> = {
  bars: 'column', dots: 'column', box: 'column', violin: 'column',
  // nested tables also render as one of the above four; handled below
  'grouped-bars': 'grouped',
  'xy-scatter': 'xy',
};
```

with the nested-table exception (nested tables use the same
`bars`/`dots`/`box`/`violin` kinds as column tables, per today's code)
kept as an explicit allow-list rather than folded into the map, so the
check stays a straight lookup instead of growing more special cases.

### Analysis (`src/analyses/linear-regression/`)

`RegressionOutcome`'s `ran: true` case gains:

```ts
band: {
  readonly x: readonly number[];       // ascending grid across the series' x range
  readonly fit: readonly number[];
  readonly confidenceLower: readonly number[];
  readonly confidenceUpper: readonly number[];
  readonly predictionLower: readonly number[];
  readonly predictionUpper: readonly number[];
};
```

computed in `analysis.R` via `predict(fit, newdata = data.frame(x = grid),
interval = "confidence", se.fit = TRUE)` and again with
`interval = "prediction"`, over a fixed-size grid (100 points, evenly
spaced from min to max observed x — independent of screen resolution,
computed once per analysis run, not per render) sharing the same `fit`
values for both intervals. Verified independently in `oracle.R` against
`predict.lm`'s own documented formulas (a hand-computed `t * SE` at a
few grid points) before any fixture is written, per CLAUDE.md's oracle
lesson (note 06). New fixtures added to the existing
`linear-regression` fixture set (not a new analysis module) covering:
a typical case, `n` small enough that the band visibly widens away from
x̄, and a `ran: false` series (no band fields on that variant — the type
already encodes this).

Cost: this is the one part of #87 that changes analysis output, so it
needs `npm run oracle:generate linear-regression`, the parity test, and
the analysis's own fixture test to pass before anything downstream uses
`band`.

### UI

`DataSection.tsx`'s `table.type !== 'xy'` gate is dropped (or inverted
to also show the button for XY). `actions.ts`'s `addGraph` gets the `xy`
default described above; `analytics.trackOnce`'s per-type event name
gets an `'new-xy'`-shaped addition, consistent with the existing
per-table-type events.

## What's scoped out (repeated from #87/#93's own text)

- Connected-line/individual-trace styles: #93.
- Nonlinear regression curves: #37.
- "Help me choose" for XY tables: unchanged deferral from note 29.
