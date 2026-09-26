# 11. Drawing graphs off the main thread

Written 2026-09-26 before building #62 (UI revamp milestone). Note 05
drew the figure as the export's SVG, inline in the page; item 10 cached
what is drawn per input. Both assumed a figure is cheap to draw. It
isn't with a few thousand points.

## What was asked

"Graph rendering must be offloaded to a worker… if the data is a bit
bigger the whole page completely freezes w/o any indication when you
click on graph or change any graph formatting setting", and "some sort
of indication/animation/spinner in graph placeholder".

## What it cost

A 3,656-row file with four groups, bars with points, measured in Chrome
(14,600 marks, a 2.3 MB SVG):

| Step, per change | Main thread |
|---|---|
| Beeswarm (only when the plot's height or the values change) | ≈ 2 s |
| Layout, the rest | 59 ms |
| SVG text | 115 ms |
| Hit regions, element list | 54 ms |
| `innerHTML` of the SVG | 219 ms |
| Style and layout of 14,600 shapes (before paint) | 162 ms |
| Sidebar thumbnail: an SVG `<img>`, decoded | 619 ms |

A formatting change blocked the page for 0.7–0.9 s of script alone, and
2.4 s when it moved the plot (a title, the size, the axis range). The
last three rows are the browser, not our code: Chrome parses and lays
out an SVG image on the main thread too, so moving only our code to a
worker, or drawing the SVG as an `<img>`, would leave most of the freeze.

## Decisions

1. **A worker lays out and paints.** `src/graphs/render.worker.ts` gets
   the `LayoutInput`, runs `layoutColumn` and paints the scene to an
   `OffscreenCanvas` at 2 CSS px per point times the device pixel ratio
   (the section shows a figure 1.5× its millimetre size; capped at
   16 megapixels). The page gets a **PNG** (`convertToBlob`) shown as an
   `<img>`; browsers decode raster images off the main thread. The
   sidebar thumbnail uses the same image.
2. **The painter draws the scene, not the SVG.** `src/graphs/paint.ts`
   draws each mark the way `svg.ts` writes it (fill, fill opacity,
   stroke, dash, butt caps, miter joins with SVG's limit of 4, text
   anchor, rotation, kerning off, Arimo from the bundled WOFF files). The
   scene has five mark kinds, so a second painter is small; a test holds
   it to the serialiser mark by mark. **Exports stay the SVG** (and the
   PNG export rasterises that SVG, as before): what is exported is still
   one serialisation; the screen is a picture of the same scene.
3. **Hit testing and outlines come back as typed arrays.** Hit regions
   (padded boxes and their element) and the outline boxes of each element
   are `Float32Array`s transferred with the image, so a click or a hover
   is a loop over numbers on the main thread, and a selected data set of
   3,656 points is outlined by **one** `<path>` rather than 3,656 rects.
   Nothing on the main thread holds the scene.
4. **The latest request wins.** Each figure asks under a slot (the
   graph on its page, its thumbnail); one render runs at a time; a
   request that is superseded before it starts is dropped, so dragging a
   bracket or typing a size doesn't queue stale renders. Renders are kept
   per input object (item 10), a few dozen of them, their blob URLs
   revoked when dropped.
5. **A spinner while it draws.** Before the first image, the figure's
   placeholder has the graph's proportions and a spinner with "Drawing
   the graph…". While a newer version is drawn, the old picture stays,
   faded, with the spinner over it after 150 ms (so a quick redraw
   doesn't flicker). Respects `prefers-reduced-motion` (a pulse, no
   spin).
5a. **Work in progress never moves the page** (added after the first
   version: "briefly showing the 'calculating...' above the graph shifts
   everything and that makes it look amateurish"). Calculating the error
   bars or starting the engine is said in the note over the figure, not
   in a banner above it; while the error bars are recalculated the figure
   keeps its last complete version (faded) rather than drawing a bare one
   in between, which also saves a redraw of every point. Results sections
   do the same: a recalculated result keeps the previous one in place,
   faded under **Calculating…** / **Updating…** and marked `aria-busy`,
   instead of collapsing to a banner and growing back. Note 04's rule
   holds: an outdated result is never shown *as if current*. Problems
   (blocked, failed) keep their banners: they stay until fixed.
6. **Exports ask the worker for the scene.** The Export dialog needs the
   scene for the SVG; it comes from the worker (which has the beeswarm
   placements cached) when an export starts.
7. **Where there is no worker canvas** (jsdom in unit tests, browsers
   without `OffscreenCanvas` 2D), the same interface draws on the main
   thread, synchronously, and the figure is the inline SVG, as before.
   Unit tests keep reading the figure's marks; the e2e test, which runs
   in Chrome, reads the exported SVG and the Format list instead.

## Prism parity

Not applicable (Prism is a desktop program with no such split).
