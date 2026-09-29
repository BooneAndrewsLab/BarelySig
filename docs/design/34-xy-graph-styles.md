# 34. XY graph styles: connected lines and replicate traces

Written 2026-09-28 for #93, on top of note 31's XY scatter path.

## What was asked

Prism-style alternatives to a bare scatter for an XY table: a line joining
each Y data set's points in X order (not a regression fit), and individual
replicate traces against the mean.

## What was built

`XyPlot` gains `style: 'scatter' | 'lines' | 'traces'` (plot style as an
option, not a new graph kind, as the issue suggested). Old `.bsig` files
without the field open as `scatter`; the serialiser always writes it.

- `lines`: `meanByX` (data.ts) averages Y at each distinct X and sorts by X;
  `layoutXy` draws it as a `connect-line` path (width `lines.fit`, colour the
  data set's). It is its own clickable element (`connect-line:<series>`),
  reusing the fit line's per-segment hit boxes.
- `traces`: `xyTraces` (selectors.ts) returns one point list per replicate
  subcolumn; each is drawn as a thin, lightened `trace-line` (not clickable,
  so a dense set of overlapping paths cannot steal picks), under the mean
  line. Summary-data tables have no replicates and show the mean line only.
- Points remain a separate checkbox, so points + line and line alone both work.
- The mean line takes part in axis auto-range; traces do not need to (every
  trace point is also a data point).

Prism parity: Prism's connected-line default is also the mean of replicates.

## Not done

A mean ± error band in the `traces` style (SD/SEM/CI choice, and how it
coexists with a fit's band) is filed as a follow-up issue.
