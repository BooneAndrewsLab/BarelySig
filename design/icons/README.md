# BarelySig UI icons

24px grid, 2px stroke, square caps, mitred joins. Structure in ink #201e1d; one detail per icon in red #ec3013.

- `*.svg` — two-color, ready to drop in
- `mono/*.svg` — single color via `currentColor`
- `sprite.svg` — all icons as `<symbol id="bs-NAME">`; strokes follow `currentColor`, the red detail follows `--bs-accent` (default #ec3013). Usage: `<svg width="20" height="20"><use href="sprite.svg#bs-analyze"/></svg>`

Icons (19): column, grouped, xy, contingency, survival, t-test, anova, curve-fit, descriptive-stats, dot-plot, bar-error, box-plot, violin, new-table, analyze, new-graph, format, add-significance, export
