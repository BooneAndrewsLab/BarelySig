/**
 * Laying out a Column-table graph (note 05): pure, from the plotted data,
 * the graph's settings and a resolved theme to a `Scene` in points. Text
 * is measured with the bundled font's metrics, so the result is the same
 * everywhere. D3 is used for the scale and its nice ticks only.
 */
import { scaleLinear } from 'd3-scale';

import type { ColumnPlot, ErrorBar } from '@/model/project';

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
}

export interface LayoutInput {
  readonly plot: ColumnPlot;
  /** Millimetres. */
  readonly size: { readonly width: number; readonly height: number };
  readonly theme: GraphTheme;
  readonly yTitle: string;
  readonly yMin?: number | undefined;
  readonly yMax?: number | undefined;
  readonly groups: readonly GroupInput[];
  readonly brackets: readonly BracketInput[];
}

const MINUS = '−';
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

function niceTickLabels(lo: number, hi: number, count: number) {
  const scale = scaleLinear().domain([lo, hi]).nice(count);
  const [d0, d1] = scale.domain() as [number, number];
  const ticks = scale.ticks(count);
  const format = scale.tickFormat(count);
  return {
    domain: [d0, d1] as const,
    ticks: ticks.map((v) => ({ v, text: format(v).replace('-', MINUS) })),
  };
}

export function layoutColumn(input: LayoutInput): Scene {
  const { theme, plot, groups } = input;
  const W = input.size.width * PT_PER_MM;
  const H = input.size.height * PT_PER_MM;
  const ink = theme.ink;
  const notes: string[] = [];
  const marks: Mark[] = [];
  const tickOut = theme.ticks === 'out' ? theme.lines.tickLength : 0;

  // --- the value range -------------------------------------------------------
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (const g of groups) {
    tops.push(...g.values);
    bottoms.push(...g.values);
    if (!g.summary) continue;
    const c = centre(plot, g.summary);
    if (c === null) continue;
    tops.push(c);
    bottoms.push(c);
    const e = errorExtent(plot.error, g.summary, c);
    if (e) {
      tops.push(e[1]);
      bottoms.push(e[0]);
    }
  }
  let lo = bottoms.length ? Math.min(...bottoms) : 0;
  let hi = tops.length ? Math.max(...tops) : 1;
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
  if (input.yMin !== undefined) lo = input.yMin;
  if (input.yMax !== undefined) hi = input.yMax;
  const tickCount = Math.max(3, Math.floor((H - 40) / (theme.font.tick * 4)));
  const nice =
    input.yMin !== undefined || input.yMax !== undefined
      ? (() => {
          const scale = scaleLinear().domain([lo, hi]);
          const f = scale.tickFormat(tickCount);
          return {
            domain: [lo, hi] as const,
            ticks: scale.ticks(tickCount).map((v) => ({ v, text: f(v).replace('-', MINUS) })),
          };
        })()
      : niceTickLabels(lo, hi, tickCount);
  const [y0, y1] = nice.domain;

  // --- margins ---------------------------------------------------------------
  const tickLabelW = Math.max(0, ...nice.ticks.map((t) => textWidth(t.text, theme.font.tick)));
  const yTitleH = input.yTitle ? lineHeight(theme.font.axisTitle) : 0;
  const left = PAD + yTitleH + (input.yTitle ? 4 : 0) + tickLabelW + 3 + tickOut;
  const right = PAD + 2;
  const plotW = Math.max(10, W - left - right);
  const n = Math.max(groups.length, 1);
  const slot = plotW / n;
  const labels = groups.map((g) => wrap(g.title, slot - 2, theme.font.tick));
  const labelLines = Math.max(1, ...labels.map((l) => l.length));
  const bottom = tickOut + 3 + labelLines * lineHeight(theme.font.tick) + PAD;

  // Brackets may need more room above the data: lay out, check, grow the top margin.
  let top = PAD + 3;
  let pass = 0;
  let placed: PlacedBracket[] = [];
  let yOf = (v: number) => v;
  let plotH = 0;
  for (; pass < 4; pass += 1) {
    plotH = Math.max(10, H - top - bottom);
    const scaleTop = top;
    const ph = plotH;
    yOf = (v: number) => scaleTop + ph * (1 - (v - y0) / (y1 - y0));
    placed = placeBrackets(input, yOf, left, slot);
    const highest = Math.min(top, ...placed.map((b) => b.top));
    if (highest >= PAD - 0.01) break;
    top += PAD - highest;
  }

  const xOf = (i: number) => left + slot * (i + 0.5);
  const baseY = top + plotH;
  const zeroY = yOf(Math.min(Math.max(0, y0), y1));

  // --- axes ------------------------------------------------------------------
  const axis = { stroke: ink, width: theme.lines.axis };
  if (theme.spines === 'box') {
    marks.push({
      kind: 'rect',
      role: 'frame',
      x: left,
      y: top,
      w: plotW,
      h: plotH,
      fill: 'none',
      line: axis,
    });
  } else {
    marks.push({
      kind: 'line',
      role: 'axis-y',
      x1: left,
      y1: top,
      x2: left,
      y2: baseY,
      line: axis,
    });
    marks.push({
      kind: 'line',
      role: 'axis-x',
      x1: left,
      y1: baseY,
      x2: left + plotW,
      y2: baseY,
      line: axis,
    });
  }
  const tickLine = { stroke: ink, width: theme.lines.tick };
  const dir = theme.ticks === 'out' ? -1 : 1;
  for (const t of nice.ticks) {
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
    (labels[i] ?? []).forEach((line, k) => {
      marks.push({
        kind: 'text',
        role: 'group-label',
        ref: g.id,
        x,
        y: baseY + tickOut + 3 + ascent(theme.font.tick) + k * lineHeight(theme.font.tick),
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
    if (plot.kind === 'bars' && s && c !== null) {
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
    if (showPoints && g.values.length > 0) {
      const d = theme.pointSize + 0.4;
      const halfWidth = plot.kind === 'bars' ? barW / 2 - d / 2 : slot * 0.38;
      const ys = g.values.map(yOf);
      const swarm = beeswarm(ys, d, Math.max(0, halfWidth));
      swarmState.squeezed ||= swarm.squeezed;
      const fill = theme.pointColor ?? g.color;
      g.values.forEach((_, k) => {
        marks.push({
          kind: 'circle',
          role: 'point',
          ref: g.id,
          cx: x + (swarm.offsets[k] ?? 0),
          cy: ys[k] ?? 0,
          r: theme.pointSize / 2,
          fill,
          opacity: theme.pointOpacity,
          line: { stroke: darken(fill, theme.pointDarken), width: theme.lines.pointEdge },
        });
      });
    }
    if (s && c !== null) {
      const e = errorExtent(plot.error, s, c);
      const cap = plot.kind === 'bars' ? barW / 4 : slot * 0.12;
      if (e) {
        // Modern bars show the error above the bar only; everything else both ways.
        const onlyUp = plot.kind === 'bars' && theme.spines !== 'box';
        const from = onlyUp ? (c >= 0 ? c : e[0]) : e[0];
        const to = onlyUp ? (c >= 0 ? e[1] : c) : e[1];
        marks.push({
          kind: 'line',
          role: 'error',
          ref: g.id,
          x1: x,
          y1: yOf(from),
          x2: x,
          y2: yOf(to),
          line: errLine,
        });
        for (const v of onlyUp ? [c >= 0 ? e[1] : e[0]] : [e[0], e[1]]) {
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
        const half = slot * 0.24;
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
 * Stacks brackets without overlap (note 05): shortest span first, each a
 * gap above the highest mark under it and above every bracket it overlaps.
 */
function placeBrackets(
  input: LayoutInput,
  yOf: (v: number) => number,
  left: number,
  slot: number,
): PlacedBracket[] {
  const { theme, plot, groups } = input;
  const groupTop = groups.map((g) => {
    let top = Number.POSITIVE_INFINITY;
    for (const v of g.values) top = Math.min(top, yOf(v) - theme.pointSize / 2);
    if (g.summary) {
      const c = centre(plot, g.summary);
      if (c !== null) {
        top = Math.min(top, yOf(c));
        const e = errorExtent(plot.error, g.summary, c);
        if (e) top = Math.min(top, yOf(e[1]));
      }
    }
    return Number.isFinite(top) ? top : yOf(0);
  });
  const labelH = ascent(theme.font.bracket) + 1.5;
  const gap = 4;
  const spans = input.brackets
    .map((b) => ({ ...b, lo: Math.min(b.from, b.to), hi: Math.max(b.from, b.to) }))
    .filter((b) => b.lo !== b.hi && b.lo >= 0 && b.hi < groups.length)
    .sort((a, b) => a.hi - a.lo - (b.hi - b.lo) || a.lo - b.lo);
  const placed: PlacedBracket[] = [];
  for (const b of spans) {
    let floor = Math.min(...groupTop.slice(b.lo, b.hi + 1));
    // Brackets that only share an end group sit side by side (their insets keep them apart).
    for (const p of placed) if (p.lo < b.hi && b.lo < p.hi) floor = Math.min(floor, p.top);
    const y = floor - gap;
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
