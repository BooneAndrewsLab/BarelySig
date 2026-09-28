/**
 * Laying out an XY scatter graph (item 31, #87): two independent
 * continuous axes, unlike `layoutColumn`'s single categorical axis with
 * one continuous value axis. `axis.ts`'s `valueAxis` is called once per
 * axis; positions come straight from its `frac(v)`, not from slot maths.
 * Deliberately self-contained rather than sharing `layoutColumn`'s axis-
 * drawing code: that function is one large, well-tested unit, and this
 * graph's axes (no group labels, clusters or brackets) are simple enough
 * not to be worth extracting a shared helper from it yet.
 */
import type { XyPlot } from '@/model/project';

import { type AxisOptions, valueAxis } from './axis';
import { type Mark, PT_PER_MM, type Scene } from './scene';
import { ascent, lineHeight, textWidth } from './text/measure';
import { darken, type GraphTheme } from './theme';

export interface XyPoint {
  readonly x: number;
  readonly y: number;
}

export interface XyBandPoint {
  readonly x: number;
  readonly y0: number;
  readonly y1: number;
}

export interface XySeriesInput {
  readonly id: string;
  readonly title: string;
  readonly color: string;
  readonly points: readonly XyPoint[];
  /** The fitted line, a sorted polyline across the series' X range; unset = not drawn. */
  readonly fit?: readonly XyPoint[] | undefined;
  /** The band around the fit, one (x, y0, y1) per fit x; unset = not drawn. */
  readonly band?: readonly XyBandPoint[] | undefined;
  /** Why this series has no fit/band even though the plot asks for one. */
  readonly note?: string | undefined;
}

export interface XyGraphInput {
  readonly plot: XyPlot;
  /** Millimetres. */
  readonly size: { readonly width: number; readonly height: number };
  readonly theme: GraphTheme;
  readonly xTitle: string;
  readonly yTitle: string;
  readonly xMin?: number | undefined;
  readonly xMax?: number | undefined;
  readonly yMin?: number | undefined;
  readonly yMax?: number | undefined;
  readonly xAxis?: Omit<AxisOptions, 'min' | 'max'> | undefined;
  readonly yAxis?: Omit<AxisOptions, 'min' | 'max'> | undefined;
  /** The graph's title, drawn above it; unset = none. */
  readonly title?: string | undefined;
  readonly series: readonly XySeriesInput[];
}

const PAD = 3;

/** The extent of a set of values: padded 5% (linear), or the nearest decades (log). */
function extentOf(values: readonly number[], log: boolean): [number, number] {
  const shown = log ? values.filter((v) => v > 0) : values;
  let lo = shown.length ? Math.min(...shown) : log ? 1 : 0;
  let hi = shown.length ? Math.max(...shown) : log ? 10 : 1;
  if (!log) {
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.05;
    lo -= pad;
    hi += pad;
    // A span of nothing has no scale: widen it, or the tick maths asks for billions of ticks.
    if (!(hi - lo >= 1e-300)) {
      lo -= 1;
      hi += 1;
    }
  }
  return [lo, hi];
}

export function layoutXy(input: XyGraphInput): Scene {
  const { theme, series } = input;
  const W = input.size.width * PT_PER_MM;
  const H = input.size.height * PT_PER_MM;
  const ink = theme.ink;
  const tickOut = theme.ticks === 'out' ? theme.lines.tickLength : 0;
  const xLog = input.xAxis?.scale === 'log10';
  const yLog = input.yAxis?.scale === 'log10';
  const notes = [...new Set(series.flatMap((s) => (s.note ? [s.note] : [])))];

  const collect = (pick: (x: number, y: number) => number, log: boolean) => {
    const values: number[] = [];
    let hidden = 0;
    for (const s of series) {
      for (const p of s.points) {
        const v = pick(p.x, p.y);
        if (log && !(v > 0)) hidden += 1;
        values.push(v);
      }
      for (const p of s.fit ?? []) values.push(pick(p.x, p.y));
      for (const b of s.band ?? []) {
        values.push(pick(b.x, b.y0));
        values.push(pick(b.x, b.y1));
      }
    }
    return { values, hidden };
  };
  const xCollected = collect((x) => x, xLog);
  const yCollected = collect((_x, y) => y, yLog);
  const [xLo, xHi] = extentOf(xCollected.values, xLog);
  const [yLo, yHi] = extentOf(yCollected.values, yLog);
  const hiddenOnLog = xCollected.hidden + yCollected.hidden;
  if (hiddenOnLog > 0) {
    notes.push(
      `${String(hiddenOnLog)} ${hiddenOnLog === 1 ? 'value is' : 'values are'} zero or negative and can’t be shown on a log axis.`,
    );
  }

  const xTickCount = Math.max(3, Math.floor((W - 40) / 40));
  const yTickCount = Math.max(3, Math.floor((H - 40) / (theme.font.tick * 4)));
  const xAxis = valueAxis(
    xLo,
    xHi,
    { ...input.xAxis, min: input.xMin, max: input.xMax },
    xTickCount,
  );
  const yAxis = valueAxis(
    yLo,
    yHi,
    { ...input.yAxis, min: input.yMin, max: input.yMax },
    yTickCount,
  );
  notes.push(...xAxis.notes, ...yAxis.notes);

  const yTitleH = input.yTitle ? lineHeight(theme.font.axisTitle) : 0;
  const xTitleH = input.xTitle ? lineHeight(theme.font.axisTitle) + 3 : 0;
  const titleH = input.title ? lineHeight(theme.font.title) + 3 : 0;

  const yTickLabelW = Math.max(0, ...yAxis.ticks.map((t) => textWidth(t.text, theme.font.tick)));
  const left = PAD + yTitleH + (input.yTitle ? 4 : 0) + yTickLabelW + 3 + tickOut;
  const right = PAD + 2;
  const top = PAD + titleH + 3;
  const xTickLabelH = lineHeight(theme.font.tick);
  const bottom = tickOut + 3 + xTickLabelH + xTitleH + PAD;

  const plotW = Math.max(10, W - left - right);
  const plotH = Math.max(10, H - top - bottom);
  const baseY = top + plotH;

  const xOf = (v: number): number | null => {
    const f = xAxis.frac(v);
    return f === null ? null : left + f * plotW;
  };
  const yOf = (v: number): number | null => {
    const f = yAxis.frac(v);
    return f === null ? null : baseY - f * plotH;
  };

  const marks: Mark[] = [];
  const f2 = (v: number) => String(Math.round(v * 100) / 100);

  if (input.title) {
    marks.push({
      kind: 'text',
      role: 'title',
      x: W / 2,
      y: PAD + ascent(theme.font.title),
      text: input.title,
      size: theme.font.title,
      weight: 700,
      anchor: 'middle',
      fill: ink,
    });
  }

  // Bands underneath, then fit lines, then points on top.
  for (const s of series) {
    const band = s.band;
    if (!band || band.length < 2) continue;
    const upper = band
      .map((b) => {
        const x = xOf(b.x);
        const y = yOf(b.y1);
        return x === null || y === null ? null : `${f2(x)} ${f2(y)}`;
      })
      .filter((p): p is string => p !== null);
    const lower = [...band]
      .reverse()
      .map((b) => {
        const x = xOf(b.x);
        const y = yOf(b.y0);
        return x === null || y === null ? null : `${f2(x)} ${f2(y)}`;
      })
      .filter((p): p is string => p !== null);
    if (upper.length < 2 || lower.length < 2) continue;
    marks.push({
      kind: 'path',
      role: 'band',
      ref: s.id,
      d: `M${upper.join('L')}L${lower.join('L')}Z`,
      line: { stroke: 'none', width: 0 },
      fill: s.color,
      opacity: theme.bandOpacity,
    });
  }
  for (const s of series) {
    const fit = s.fit;
    if (!fit || fit.length < 2) continue;
    const pts = fit
      .map((p) => {
        const x = xOf(p.x);
        const y = yOf(p.y);
        return x === null || y === null ? null : `${f2(x)} ${f2(y)}`;
      })
      .filter((p): p is string => p !== null);
    if (pts.length < 2) continue;
    marks.push({
      kind: 'path',
      role: 'fit-line',
      ref: s.id,
      d: `M${pts.join('L')}`,
      line: { stroke: s.color, width: theme.lines.fit },
    });
  }
  if (input.plot.points) {
    for (const s of series) {
      const fill = s.color;
      const line = { stroke: darken(fill, theme.pointDarken), width: theme.lines.pointEdge };
      for (const p of s.points) {
        const cx = xOf(p.x);
        const cy = yOf(p.y);
        if (cx === null || cy === null) continue;
        marks.push({
          kind: 'circle',
          role: 'xy-point',
          ref: s.id,
          cx,
          cy,
          r: theme.pointSize / 2,
          fill,
          opacity: theme.pointOpacity,
          line,
        });
      }
    }
  }

  // --- axes ------------------------------------------------------------------
  const axisLine = { stroke: ink, width: theme.lines.axis };
  if (theme.spines === 'box') {
    marks.push({
      kind: 'rect',
      role: 'frame',
      x: left,
      y: top,
      w: plotW,
      h: plotH,
      fill: 'none',
      line: axisLine,
    });
  } else {
    marks.push({
      kind: 'line',
      role: 'axis-y',
      x1: left,
      y1: top,
      x2: left,
      y2: baseY,
      line: axisLine,
    });
    marks.push({
      kind: 'line',
      role: 'axis-x',
      x1: left,
      y1: baseY,
      x2: left + plotW,
      y2: baseY,
      line: axisLine,
    });
  }
  const tickLine = { stroke: ink, width: theme.lines.tick };
  const dir = theme.ticks === 'out' ? -1 : 1;
  for (const t of yAxis.ticks) {
    const y = yOf(t.v);
    if (y === null) continue;
    marks.push({
      kind: 'line',
      role: 'tick-y',
      x1: left,
      y1: y,
      x2: left + dir * theme.lines.tickLength,
      y2: y,
      line: tickLine,
    });
    marks.push({
      kind: 'text',
      role: 'tick-label',
      x: left - tickOut - 3,
      y: y + ascent(theme.font.tick) / 2 - 0.3,
      text: t.text,
      size: theme.font.tick,
      weight: 400,
      anchor: 'end',
      fill: ink,
    });
  }
  for (const v of yAxis.minor) {
    const y = yOf(v);
    if (y === null) continue;
    marks.push({
      kind: 'line',
      role: 'tick-y-minor',
      x1: left,
      y1: y,
      x2: left + dir * theme.lines.tickLength * 0.6,
      y2: y,
      line: tickLine,
    });
  }
  for (const t of xAxis.ticks) {
    const x = xOf(t.v);
    if (x === null) continue;
    marks.push({
      kind: 'line',
      role: 'tick-x',
      x1: x,
      y1: baseY,
      x2: x,
      y2: baseY - dir * theme.lines.tickLength,
      line: tickLine,
    });
    marks.push({
      kind: 'text',
      role: 'tick-label-x',
      x,
      y: baseY + tickOut + 3 + ascent(theme.font.tick),
      text: t.text,
      size: theme.font.tick,
      weight: 400,
      anchor: 'middle',
      fill: ink,
    });
  }
  for (const v of xAxis.minor) {
    const x = xOf(v);
    if (x === null) continue;
    marks.push({
      kind: 'line',
      role: 'tick-x-minor',
      x1: x,
      y1: baseY,
      x2: x,
      y2: baseY - dir * theme.lines.tickLength * 0.6,
      line: tickLine,
    });
  }
  if (input.yTitle) {
    marks.push({
      kind: 'text',
      role: 'axis-title',
      x: PAD + ascent(theme.font.axisTitle),
      y: top + plotH / 2,
      text: input.yTitle,
      size: theme.font.axisTitle,
      weight: 400,
      anchor: 'middle',
      fill: ink,
      rotate: -90,
    });
  }
  if (input.xTitle) {
    marks.push({
      kind: 'text',
      role: 'axis-title-x',
      x: left + plotW / 2,
      y: H - PAD - ascent(theme.font.axisTitle) * 0.2,
      text: input.xTitle,
      size: theme.font.axisTitle,
      weight: 400,
      anchor: 'middle',
      fill: ink,
    });
  }

  return { width: W, height: H, font: theme.font.family, marks, notes };
}
