/**
 * Laying out a graph (notes 05, 07): pure, from the plotted data, the
 * graph's settings and a resolved theme to a `Scene` in points. Text is
 * measured with the bundled font's metrics, so the result is the same
 * everywhere. D3 is used for scales and nice ticks only (`axis.ts`).
 */
import type { ColumnPlot, ErrorBar, PointSymbol } from '@/model/project';

import { type AxisOptions, valueAxis } from './axis';
import { beeswarm } from './beeswarm';
import { type Mark, PT_PER_MM, type Scene } from './scene';
import { ascent, lineHeight, textWidth, wrap } from './text/measure';
import { type GraphTheme, darken, lighten } from './theme';

/** A group's summary statistics, from the graph's R summary (note 05). */
export interface GroupSummary {
  readonly n: number | null;
  readonly mean: number | null;
  readonly median: number | null;
  readonly sd: number | null;
  readonly sem: number | null;
  readonly ciLower: number | null;
  readonly ciUpper: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface GroupInput {
  readonly id: string;
  readonly title: string;
  readonly color: string;
  /** Unset = circle. */
  readonly symbol?: PointSymbol | undefined;
  /** The values to plot as points: empty and excluded cells already left out. */
  readonly values: readonly number[];
  /** null while the summary isn't available (then no bar, line or error bar is drawn). */
  readonly summary: GroupSummary | null;
}

export interface BracketInput {
  readonly id: string;
  /** Group indices it spans. */
  readonly from: number;
  readonly to: number;
  readonly label: string;
  /** Moved up by this many points (negative: down), note 07. */
  readonly offset?: number | undefined;
}

export interface LayoutInput {
  readonly plot: ColumnPlot;
  /** Millimetres. */
  readonly size: { readonly width: number; readonly height: number };
  readonly theme: GraphTheme;
  readonly yTitle: string;
  readonly yMin?: number | undefined;
  readonly yMax?: number | undefined;
  /** Log scale, tick interval, decimals (note 07). */
  readonly axis?: Omit<AxisOptions, 'min' | 'max'> | undefined;
  /** Group labels turned by this many degrees; unset = level, wrapped. */
  readonly xAngle?: 45 | 90 | undefined;
  /** The graph's title, drawn above it; unset = none. */
  readonly title?: string | undefined;
  readonly groups: readonly GroupInput[];
  readonly brackets: readonly BracketInput[];
}

const PAD = 3;

/** The centre a bar or line shows. */
function centre(plot: ColumnPlot, s: GroupSummary): number | null {
  return plot.kind === 'dots' && plot.center === 'median' ? s.median : s.mean;
}

/** Lower and upper end of the error bar, or null for none. */
export function errorExtent(
  error: ErrorBar,
  s: GroupSummary,
  at: number,
): readonly [number, number] | null {
  switch (error) {
    case 'sd':
      return s.sd === null ? null : [at - s.sd, at + s.sd];
    case 'sem':
      return s.sem === null ? null : [at - s.sem, at + s.sem];
    case 'ci95':
      return s.ciLower === null || s.ciUpper === null ? null : [s.ciLower, s.ciUpper];
    case 'range':
      return s.min === null || s.max === null ? null : [s.min, s.max];
    case 'none':
      return null;
  }
}

const ERROR_WORDS: Readonly<Record<ErrorBar, string>> = {
  sd: 'SD',
  sem: 'SEM',
  ci95: '95% CI',
  range: 'range',
  none: '',
};

/** What the marks show, for the notes under the graph: "Bars: mean ± SD; points: individual values". */
export function describePlot(plot: ColumnPlot): string {
  const centreWord = plot.kind === 'dots' ? plot.center : 'mean';
  const err = plot.error;
  const shown =
    err === 'none'
      ? centreWord
      : err === 'ci95'
        ? `${centreWord} with 95% CI`
        : err === 'range'
          ? `${centreWord} with range`
          : `${centreWord} ± ${ERROR_WORDS[err]}`;
  const first = plot.kind === 'bars' ? `Bars: ${shown}` : `Lines: ${shown}`;
  return plot.kind === 'bars' && !plot.points ? first : `${first}; points: individual values`;
}

/** A point of `symbol` centred on (cx, cy), about as heavy as a circle of `d`. */
function pointMark(
  symbol: PointSymbol,
  cx: number,
  cy: number,
  d: number,
  base: {
    role: string;
    ref: string;
    fill: string;
    opacity: number;
    line: { stroke: string; width: number };
  },
): Mark {
  if (symbol === 'circle') return { kind: 'circle', ...base, cx, cy, r: d / 2 };
  const f = (v: number) => String(Math.round(v * 100) / 100);
  let path: string;
  if (symbol === 'square') {
    const h = (d * 0.886) / 2;
    path = `M${f(cx - h)} ${f(cy - h)}H${f(cx + h)}V${f(cy + h)}H${f(cx - h)}Z`;
  } else if (symbol === 'diamond') {
    const h = (d * 1.25) / 2;
    path = `M${f(cx)} ${f(cy - h)}L${f(cx + h)} ${f(cy)}L${f(cx)} ${f(cy + h)}L${f(cx - h)} ${f(cy)}Z`;
  } else {
    // Equilateral, centred on its centroid.
    const side = d * 1.35;
    const hgt = (side * Math.sqrt(3)) / 2;
    path = `M${f(cx)} ${f(cy - (2 * hgt) / 3)}L${f(cx + side / 2)} ${f(cy + hgt / 3)}L${f(cx - side / 2)} ${f(cy + hgt / 3)}Z`;
  }
  return { kind: 'path', ...base, d: path };
}

export function layoutColumn(input: LayoutInput): Scene {
  const { theme, plot, groups } = input;
  const W = input.size.width * PT_PER_MM;
  const H = input.size.height * PT_PER_MM;
  const ink = theme.ink;
  const notes: string[] = [];
  const marks: Mark[] = [];
  const tickOut = theme.ticks === 'out' ? theme.lines.tickLength : 0;
  const log = input.axis?.scale === 'log10';

  // --- the value range -------------------------------------------------------
  const extent: number[] = [];
  let hiddenOnLog = 0;
  for (const g of groups) {
    for (const v of g.values) {
      if (log && !(v > 0)) hiddenOnLog += 1;
      else extent.push(v);
    }
    if (!g.summary) continue;
    const c = centre(plot, g.summary);
    if (c === null) continue;
    extent.push(c);
    const e = errorExtent(plot.error, g.summary, c);
    if (e) extent.push(e[0], e[1]);
  }
  const shown = log ? extent.filter((v) => v > 0) : extent;
  let lo = shown.length ? Math.min(...shown) : log ? 1 : 0;
  let hi = shown.length ? Math.max(...shown) : log ? 10 : 1;
  if (!log) {
    if (plot.kind === 'bars') {
      // A bar is a length: the axis starts at zero.
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    } else {
      const pad = (hi - lo || Math.abs(hi) || 1) * 0.05;
      lo -= pad;
      hi += pad;
    }
    // A span of nothing (one value, or values a few subnormal steps apart)
    // has no scale: widen it, or the tick maths asks for billions of ticks.
    if (!(hi - lo >= 1e-300)) {
      if (plot.kind === 'bars') hi = lo + 1;
      else {
        lo -= 1;
        hi += 1;
      }
    }
  }
  if (hiddenOnLog > 0)
    notes.push(
      `${String(hiddenOnLog)} ${hiddenOnLog === 1 ? 'value is' : 'values are'} zero or negative and can’t be shown on a log axis.`,
    );
  const tickCount = Math.max(3, Math.floor((H - 40) / (theme.font.tick * 4)));
  const axis = valueAxis(lo, hi, { ...input.axis, min: input.yMin, max: input.yMax }, tickCount);
  notes.push(...axis.notes);

  // --- margins ---------------------------------------------------------------
  const tickLabelW = Math.max(0, ...axis.ticks.map((t) => textWidth(t.text, theme.font.tick)));
  const yTitleH = input.yTitle ? lineHeight(theme.font.axisTitle) : 0;
  const n = Math.max(groups.length, 1);
  const angle = input.xAngle;
  const labelWidths = groups.map((g) => textWidth(g.title, theme.font.tick));
  let left = PAD + yTitleH + (input.yTitle ? 4 : 0) + tickLabelW + 3 + tickOut;
  const right = PAD + 2;
  let slot = Math.max(10, W - left - right) / n;
  if (angle === 45) {
    // A turned label runs down to the left of its tick: keep the first one inside the figure.
    const first = (labelWidths[0] ?? 0) * Math.SQRT1_2;
    left = Math.max(left, PAD + first - slot / 2);
    slot = Math.max(10, W - left - right) / n;
  }
  const plotW = Math.max(10, W - left - right);
  const labels = groups.map((g) =>
    angle === undefined ? wrap(g.title, slot - 2, theme.font.tick) : [g.title],
  );
  const labelLines = Math.max(1, ...labels.map((l) => l.length));
  const tickA = ascent(theme.font.tick);
  const labelBlock =
    angle === 45
      ? Math.max(0, ...labelWidths) * Math.SQRT1_2 + tickA
      : angle === 90
        ? Math.max(0, ...labelWidths)
        : labelLines * lineHeight(theme.font.tick);
  const bottom = tickOut + 3 + labelBlock + PAD;
  const titleH = input.title ? lineHeight(theme.font.title) + 3 : 0;
  const ceiling = PAD + titleH;

  // Brackets may need more room above the data: lay out, check, grow the top margin.
  let top = ceiling + 3;
  let placed: PlacedBracket[] = [];
  let plotH = 0;
  let yOf = (v: number) => v;
  for (let pass = 0; pass < 4; pass += 1) {
    plotH = Math.max(10, H - top - bottom);
    const scaleTop = top;
    const ph = plotH;
    yOf = (v: number) => {
      const f = axis.frac(v);
      // A value a log axis can't show sits just below it.
      return scaleTop + ph * (1 - (f ?? -0.02));
    };
    placed = placeBrackets(input, yOf, left, slot);
    const highest = Math.min(top, ...placed.map((b) => b.top));
    if (highest >= ceiling - 0.01) break;
    top += ceiling - highest;
  }

  const xOf = (i: number) => left + slot * (i + 0.5);
  const baseY = top + plotH;
  const [d0, d1] = axis.domain;
  // Bars rise from zero on a linear axis, from the bottom of a log axis.
  const zeroY = log ? baseY : yOf(Math.min(Math.max(0, d0), d1));

  // --- title -----------------------------------------------------------------
  if (input.title) {
    marks.push({
      kind: 'text',
      role: 'title',
      x: left + plotW / 2,
      y: PAD + ascent(theme.font.title),
      text: input.title,
      size: theme.font.title,
      weight: 700,
      anchor: 'middle',
      fill: ink,
    });
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
  for (const t of axis.ticks) {
    const y = yOf(t.v);
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
  for (const v of axis.minor) {
    const y = yOf(v);
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
  groups.forEach((g, i) => {
    const x = xOf(i);
    marks.push({
      kind: 'line',
      role: 'tick-x',
      ref: g.id,
      x1: x,
      y1: baseY,
      x2: x,
      y2: baseY - dir * theme.lines.tickLength,
      line: tickLine,
    });
    const y0 = baseY + tickOut + 3;
    if (angle !== undefined) {
      marks.push({
        kind: 'text',
        role: 'group-label',
        ref: g.id,
        // Turned about the label's end, which sits under the tick.
        x: angle === 90 ? x + tickA / 2 - 0.3 : x + tickA * 0.35,
        y: y0 + (angle === 90 ? 0 : tickA * 0.35),
        text: g.title,
        size: theme.font.tick,
        weight: 400,
        anchor: 'end',
        fill: ink,
        rotate: -angle,
      });
      return;
    }
    (labels[i] ?? []).forEach((line, k) => {
      marks.push({
        kind: 'text',
        role: 'group-label',
        ref: g.id,
        x,
        y: y0 + tickA + k * lineHeight(theme.font.tick),
        text: line,
        size: theme.font.tick,
        weight: 400,
        anchor: 'middle',
        fill: ink,
      });
    });
  });

  // --- data ------------------------------------------------------------------
  const barW = slot * theme.barWidth;
  const errLine = { stroke: ink, width: theme.lines.error };
  const swarmState = { squeezed: false };
  groups.forEach((g, i) => {
    const x = xOf(i);
    const s = g.summary;
    const c = s ? centre(plot, s) : null;
    if (plot.kind === 'bars' && s && c !== null && !(log && !(c > 0))) {
      const yc = yOf(c);
      marks.push({
        kind: 'rect',
        role: 'bar',
        ref: g.id,
        x: x - barW / 2,
        y: Math.min(yc, zeroY),
        w: barW,
        h: Math.abs(zeroY - yc),
        fill: lighten(g.color, theme.barLighten),
        line: { stroke: theme.barEdge ?? g.color, width: theme.lines.barEdge },
      });
    }
    // Points: a beeswarm within the bar, or within most of the slot.
    const showPoints = plot.kind === 'dots' || plot.points;
    const values = log ? g.values.filter((v) => v > 0) : g.values;
    if (showPoints && values.length > 0) {
      const d = theme.pointSize + 0.4;
      const halfWidth = plot.kind === 'bars' ? barW / 2 - d / 2 : slot * 0.38;
      const ys = values.map(yOf);
      const swarm = beeswarm(ys, d, Math.max(0, halfWidth));
      swarmState.squeezed ||= swarm.squeezed;
      const fill = theme.pointColor ?? g.color;
      const line = { stroke: darken(fill, theme.pointDarken), width: theme.lines.pointEdge };
      values.forEach((_, k) => {
        marks.push(
          pointMark(
            g.symbol ?? 'circle',
            x + (swarm.offsets[k] ?? 0),
            ys[k] ?? 0,
            theme.pointSize,
            {
              role: 'point',
              ref: g.id,
              fill,
              opacity: theme.pointOpacity,
              line,
            },
          ),
        );
      });
    }
    if (s && c !== null && !(log && !(c > 0))) {
      const e = errorExtent(plot.error, s, c);
      const half = slot * 0.24;
      const cap = (plot.kind === 'bars' ? barW / 2 : half) * theme.capWidth;
      if (e) {
        // Modern bars show the error above the bar only; everything else both ways.
        const onlyUp = plot.kind === 'bars' && theme.spines !== 'box';
        const from = onlyUp ? (c >= 0 ? c : e[0]) : e[0];
        const to = onlyUp ? (c >= 0 ? e[1] : c) : e[1];
        // On a log axis an end at or below zero is cut at the axis.
        const yEnd = (v: number) => (log && !(v > 0) ? baseY : yOf(v));
        marks.push({
          kind: 'line',
          role: 'error',
          ref: g.id,
          x1: x,
          y1: yEnd(from),
          x2: x,
          y2: yEnd(to),
          line: errLine,
        });
        for (const v of onlyUp ? [c >= 0 ? e[1] : e[0]] : [e[0], e[1]]) {
          if (log && !(v > 0)) continue;
          marks.push({
            kind: 'line',
            role: 'error-cap',
            ref: g.id,
            x1: x - cap,
            y1: yOf(v),
            x2: x + cap,
            y2: yOf(v),
            line: errLine,
          });
        }
      }
      if (plot.kind === 'dots') {
        marks.push({
          kind: 'line',
          role: 'centre',
          ref: g.id,
          x1: x - half,
          y1: yOf(c),
          x2: x + half,
          y2: yOf(c),
          line: { stroke: ink, width: theme.lines.error * 1.6 },
        });
      }
    }
  });
  if (swarmState.squeezed)
    notes.push(
      'Some points were squeezed together to fit their group’s width; make the graph wider to separate them.',
    );

  // --- brackets --------------------------------------------------------------
  const bracketLine = { stroke: ink, width: theme.lines.bracket };
  for (const b of placed) {
    const tip = 3;
    marks.push({
      kind: 'path',
      role: 'bracket',
      ref: b.id,
      d: `M${fmt(b.x1)} ${fmt(b.y + tip)}V${fmt(b.y)}H${fmt(b.x2)}V${fmt(b.y + tip)}`,
      line: bracketLine,
      fill: 'none',
    });
    marks.push({
      kind: 'text',
      role: 'bracket-label',
      ref: b.id,
      x: (b.x1 + b.x2) / 2,
      y: b.y - 1.5,
      text: b.label,
      size: theme.font.bracket,
      weight: 400,
      anchor: 'middle',
      fill: ink,
    });
  }

  return { width: W, height: H, font: theme.font.family, marks, notes };
}

interface PlacedBracket {
  readonly id: string;
  readonly label: string;
  readonly x1: number;
  readonly x2: number;
  /** The bracket's horizontal line. */
  readonly y: number;
  /** Top of its label: what the next bracket must clear. */
  readonly top: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * Stacks brackets without overlap (notes 05, 07): shortest span first,
 * each a gap above the highest mark under it and above every bracket it
 * overlaps, then raised by its offset (never lowered below that place).
 */
function placeBrackets(
  input: LayoutInput,
  yOf: (v: number) => number,
  left: number,
  slot: number,
): PlacedBracket[] {
  const { theme, plot, groups } = input;
  const log = input.axis?.scale === 'log10';
  const groupTop = groups.map((g) => {
    let top = Number.POSITIVE_INFINITY;
    for (const v of g.values) if (!log || v > 0) top = Math.min(top, yOf(v) - theme.pointSize / 2);
    if (g.summary) {
      const c = centre(plot, g.summary);
      if (c !== null && (!log || c > 0)) {
        top = Math.min(top, yOf(c));
        const e = errorExtent(plot.error, g.summary, c);
        if (e && (!log || e[1] > 0)) top = Math.min(top, yOf(e[1]));
      }
    }
    return Number.isFinite(top) ? top : yOf(log ? 0 : 0);
  });
  const labelH = ascent(theme.font.bracket) + 1.5;
  const gap = 4;
  const spans = input.brackets
    .map((b) => ({ ...b, lo: Math.min(b.from, b.to), hi: Math.max(b.from, b.to) }))
    .filter((b) => b.lo !== b.hi && b.lo >= 0 && b.hi < groups.length)
    .sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || a.lo - b.lo);
  const placed: PlacedBracket[] = [];
  for (const b of spans) {
    const data = Math.min(...groupTop.slice(b.lo, b.hi + 1));
    let floor = data;
    // Brackets that only share an end group sit side by side (their insets keep them apart).
    for (const p of placed) if (p.lo < b.hi && b.lo < p.hi) floor = Math.min(floor, p.top);
    // Its automatic place is the lowest that clears the data and the
    // brackets under it, so it can be raised but not lowered past that.
    const y = floor - gap - Math.max(0, b.offset ?? 0);
    const inset = slot * 0.12;
    placed.push({
      id: b.id,
      label: b.label,
      x1: left + slot * (b.lo + 0.5) + inset,
      x2: left + slot * (b.hi + 0.5) - inset,
      y,
      top: y - labelH,
      lo: b.lo,
      hi: b.hi,
    });
  }
  return placed;
}

const fmt = (v: number) => String(Math.round(v * 100) / 100);
