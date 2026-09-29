/**
 * Laying out a graph (notes 05, 07): pure, from the plotted data, the
 * graph's settings and a resolved theme to a `Scene` in points. Text is
 * measured with the bundled font's metrics, so the result is the same
 * everywhere. D3 is used for scales and nice ticks only (`axis.ts`).
 */
import {
  type ColumnPlot,
  type ErrorBar,
  type GraphPlot,
  POINT_SYMBOLS,
  type PointSymbol,
  type Whiskers,
} from '@/model/project';

import { type AxisOptions, valueAxis } from './axis';
import { beeswarm } from './beeswarm';
import { paletteColor } from './palette';
import { type Mark, PT_PER_MM, type Scene, type Stroke } from './scene';
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
  /** Box and violin plots (note 07); unset or null for summary data. */
  readonly q1?: number | null;
  readonly q3?: number | null;
  readonly whiskers?: {
    readonly low: number;
    readonly high: number;
    readonly beyond: readonly number[];
  } | null;
  readonly kde?: {
    readonly bw: number;
    readonly y: readonly number[];
    readonly density: readonly number[];
  } | null;
}

export interface GroupInput {
  readonly id: string;
  /** The data set its marks belong to, for click-to-format; unset = `id` (a grouped graph's bars are cells). */
  readonly series?: string | undefined;
  readonly title: string;
  readonly color: string;
  /** Unset = circle. */
  readonly symbol?: PointSymbol | undefined;
  /** The values to plot as points: empty and excluded cells already left out. */
  readonly values: readonly number[];
  /** A Nested table's SuperPlot: which biological replicate each of `values` belongs to (parallel array). */
  readonly replicateOf?: readonly number[] | undefined;
  /** A Nested table's SuperPlot: each replicate's own mean, by replicate (null: no values), for the overlaid markers. */
  readonly replicateMeans?: readonly (number | null)[] | undefined;
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
  /**
   * Group labels turned by this many degrees; unset = automatic (level,
   * wrapped, turned only if that would still overlap, note 12).
   */
  readonly xAngle?: 45 | 90 | undefined;
  /** The graph's title, drawn above it; unset = none. */
  readonly title?: string | undefined;
  readonly groups: readonly GroupInput[];
  readonly brackets: readonly BracketInput[];
  /**
   * Grouped graphs (note 07): consecutive groups drawn as clusters, each
   * with its title under it. Unset = every group its own slot.
   */
  readonly clusters?: readonly { readonly title: string; readonly size: number }[] | undefined;
  /** With clusters: label each bar too (separated grouped bars); otherwise only the clusters. */
  readonly barLabels?: boolean | undefined;
  /** A legend of these entries; unset = none. */
  readonly legend?:
    | {
        readonly at: 'right' | 'top';
        readonly entries: readonly {
          readonly id: string;
          readonly title: string;
          readonly color: string;
        }[];
      }
    | undefined;
}

const PAD = 3;

/** The centre a bar or line shows. */
function centre(plot: ColumnPlot, s: GroupSummary): number | null {
  return plot.kind === 'dots' && plot.center === 'median' ? s.median : s.mean;
}

/**
 * The values a group's marks reach, for the axis range and for placing
 * brackets above them: `lines` (bar tops, error bars, boxes, whiskers,
 * violins) and `points` (drawn as points, so half a point higher).
 */
function reach(plot: ColumnPlot, g: GroupInput): { lines: number[]; points: number[] } {
  const s = g.summary;
  switch (plot.kind) {
    case 'bars':
    case 'dots': {
      // Every value counts even when bars hide the points, so showing them doesn't move the axis.
      const lines: number[] = [];
      const c = s ? centre(plot, s) : null;
      if (s && c !== null) {
        lines.push(c);
        const e = errorExtent(plot.error, s, c);
        if (e) lines.push(e[0], e[1]);
      }
      return { lines, points: [...g.values] };
    }
    case 'box': {
      if (!s?.whiskers || s.q1 == null || s.q3 == null) return { lines: [], points: [] };
      const points =
        plot.points === 'all'
          ? [...g.values]
          : plot.points === 'outliers'
            ? [...s.whiskers.beyond]
            : [];
      return { lines: [s.q1, s.q3, s.whiskers.low, s.whiskers.high], points };
    }
    case 'violin': {
      const y = s?.kde?.y ?? [];
      const lines = y.length ? [Math.min(...y), Math.max(...y)] : [];
      return { lines, points: plot.inner === 'points' ? [...g.values] : [] };
    }
  }
}

const WHISKER_WORDS: Readonly<Record<Whiskers, string>> = {
  'min-max': 'min to max',
  tukey: 'Tukey (the most extreme values within 1.5 × IQR of the box)',
  'p10-90': '10th to 90th percentile',
  'p5-95': '5th to 95th percentile',
  'p2.5-97.5': '2.5th to 97.5th percentile',
  'p1-99': '1st to 99th percentile',
};

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
export function describePlot(graphPlot: GraphPlot): string {
  if (graphPlot.kind === 'xy-scatter') {
    const parts: string[] = [];
    if (graphPlot.points) parts.push('points: each (X, Y) pair');
    if (graphPlot.fit) {
      parts.push('a fitted regression line');
      if (graphPlot.band !== 'none')
        parts.push(
          `a ${graphPlot.band === 'confidence' ? '95% confidence' : '95% prediction'} band`,
        );
    }
    if (graphPlot.fit && graphPlot.unknowns)
      parts.push('open circles with dashed drop-lines: unknowns read off the curve');
    if (graphPlot.style === 'traces' && graphPlot.error !== 'none') {
      parts.push(
        graphPlot.error === 'ci95'
          ? 'a band of the mean with its 95% CI'
          : `a band of the mean ± ${graphPlot.error === 'sd' ? 'SD' : 'SEM'}`,
      );
    }
    return parts.length ? `XY scatter: ${parts.join('; ')}` : 'XY scatter';
  }
  const plot: ColumnPlot =
    graphPlot.kind === 'grouped-bars'
      ? { kind: 'bars', error: graphPlot.error, points: graphPlot.points }
      : graphPlot;
  if (plot.kind === 'box') {
    const first = `Boxes: median and quartiles; whiskers: ${WHISKER_WORDS[plot.whiskers]}`;
    if (plot.points === 'all') return `${first}; points: individual values`;
    if (plot.points === 'outliers' && plot.whiskers !== 'min-max')
      return `${first}; points: values beyond the whiskers`;
    return first;
  }
  if (plot.kind === 'violin') {
    const k = plot.smoothing === 1 ? '' : ` × ${String(plot.smoothing)}`;
    const first = `Violins: distribution of the values (Gaussian kernel density, Silverman’s bandwidth${k}; drawn from the smallest to the largest value)`;
    const inner =
      plot.inner === 'quartiles'
        ? '; lines: median (solid) and quartiles (dashed)'
        : plot.inner === 'box'
          ? '; inside: quartiles (box), median (dot), min to max (line)'
          : plot.inner === 'points'
            ? '; points: individual values'
            : '';
    return first + inner;
  }
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
  if (plot.kind === 'bars' && !plot.points) return first;
  if (plot.kind === 'dots' && plot.colorByReplicate) {
    return `${first} of the replicate means (n = replicates); points: individual values, coloured and shaped by biological replicate; larger points: each replicate's own mean`;
  }
  return `${first}; points: individual values`;
}

/** A SuperPlot's individual values and replicate means, × the theme's point size. */
const SUPERPLOT_POINT = 0.75;
const SUPERPLOT_MEAN = 2;

/** A SuperPlot's replicate `r` has a shape as well as a colour, so it reads in grey too. */
const replicateSymbol = (r: number): PointSymbol =>
  POINT_SYMBOLS[r % POINT_SYMBOLS.length] ?? 'circle';

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
  const tickOut = theme.ticks === 'out' ? theme.lines.tickLength : 0;
  const log = input.axis?.scale === 'log10';

  // --- the value range -------------------------------------------------------
  const extent: number[] = [];
  let hiddenOnLog = 0;
  for (const g of groups) {
    for (const v of g.values) if (log && !(v > 0)) hiddenOnLog += 1;
    const r = reach(plot, g);
    extent.push(...r.lines, ...r.points);
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
  const yTitleH = input.yTitle ? lineHeight(theme.font.axisTitle) : 0;
  const n = Math.max(groups.length, 1);
  const clusters = input.clusters?.length ? input.clusters : null;
  // Which cluster each group is in, and its place in it.
  const member = groups.map((_, i) => {
    if (!clusters) return { c: i, k: 0, of: 1 };
    let start = 0;
    for (let c = 0; c < clusters.length; c += 1) {
      const size = clusters[c]?.size ?? 0;
      if (i < start + size) return { c, k: i - start, of: size };
      start += size;
    }
    return { c: clusters.length - 1, k: 0, of: 1 };
  });
  const nSlots = clusters ? clusters.length : n;
  const barLabels = !clusters || input.barLabels === true;
  const labelWidths = groups.map((g) => (barLabels ? textWidth(g.title, theme.font.tick) : 0));
  const tickA = ascent(theme.font.tick);
  const titleH = input.title ? lineHeight(theme.font.title) + 3 : 0;
  // The legend: a column at the right, or rows above the plot.
  const legend = input.legend && input.legend.entries.length > 0 ? input.legend : null;
  const legendSize = theme.font.legend;
  const swatch = legendSize * 1.1;
  const entryW = (t: string) => swatch + 3 + textWidth(t, legendSize) + 8;
  const entries = legend?.entries ?? [];
  const legendRows: (typeof entries)[] = [];
  if (legend?.at === 'top') {
    let row: (typeof entries)[number][] = [];
    let w = 0;
    for (const e of entries) {
      if (row.length > 0 && w + entryW(e.title) > W - 2 * PAD) {
        legendRows.push(row);
        row = [];
        w = 0;
      }
      row.push(e);
      w += entryW(e.title);
    }
    if (row.length) legendRows.push(row);
  }
  const legendLine = lineHeight(legendSize) + 2;
  const legendRight =
    legend?.at === 'right' ? 6 + Math.max(0, ...entries.map((e) => entryW(e.title) - 8)) : 0;
  const right = PAD + 2 + legendRight;
  const ceiling = PAD + titleH + legendRows.length * legendLine;

  /**
   * Lays out and draws everything below the value range for one candidate
   * group-label angle: level (wrapped), or a whole title turned 45° or
   * 90°. `overlap` says whether a label still ran into its neighbour's
   * slot at this angle, so the caller can escalate (note 12).
   */
  const attempt = (
    angle: 45 | 90 | undefined,
  ): { marks: Mark[]; notes: string[]; overlap: boolean } => {
    const marks: Mark[] = [];
    const notes: string[] = [];

    /** The axis up to `upTo`, and the margins its tick labels and the group labels need. */
    const measure = (upTo: number) => {
      const axis = valueAxis(
        lo,
        upTo,
        { ...input.axis, min: input.yMin, max: input.yMax },
        tickCount,
      );
      const tickLabelW = Math.max(0, ...axis.ticks.map((t) => textWidth(t.text, theme.font.tick)));
      let left = PAD + yTitleH + (input.yTitle ? 4 : 0) + tickLabelW + 3 + tickOut;
      const place = (from: number) => {
        const plotW = Math.max(10, W - from - right);
        const slot = plotW / nSlots;
        // Bars of a cluster share 80% of its slot.
        const sub = (i: number) => (clusters ? (slot * 0.8) / (member[i]?.of ?? 1) : slot);
        const centre = (i: number) => {
          const mm = member[i] ?? { c: i, k: 0, of: 1 };
          if (!clusters) return from + slot * (i + 0.5);
          return from + slot * mm.c + slot * 0.1 + sub(i) * (mm.k + 0.5);
        };
        return { plotW, slot, sub, centre };
      };
      let geo = place(left);
      if (angle === 45 && barLabels) {
        // A turned label runs down to the left of its tick: keep the first one inside the figure.
        const first = (labelWidths[0] ?? 0) * Math.SQRT1_2;
        left = Math.max(left, PAD + first - geo.sub(0) / 2);
        geo = place(left);
      }
      const labels = groups.map((g, i) =>
        !barLabels
          ? []
          : angle === undefined
            ? wrap(g.title, geo.sub(i) - 2, theme.font.tick)
            : [g.title],
      );
      const clusterLabels = (clusters ?? []).map((c) =>
        wrap(c.title, geo.slot - 2, theme.font.tick),
      );
      const labelLines = Math.max(1, ...labels.map((l) => l.length));
      const barBlock = !barLabels
        ? 0
        : angle === 45
          ? Math.max(0, ...labelWidths) * Math.SQRT1_2 + tickA
          : angle === 90
            ? Math.max(0, ...labelWidths)
            : labelLines * lineHeight(theme.font.tick);
      const clusterLines = Math.max(0, ...clusterLabels.map((l) => l.length));
      const clusterBlock = clusters
        ? (barLabels ? 3 : 0) + Math.max(1, clusterLines) * lineHeight(theme.font.tick)
        : 0;
      // Whether a group's label still runs past its slot at this angle: a
      // wrapped line with no space or underscore to break at, or a turned
      // label whose footprint toward its neighbour outgrows the slot.
      const overlap = !barLabels
        ? false
        : groups.some((_, i) => {
            const room = geo.sub(i) - 2;
            if (angle === undefined)
              return (
                Math.max(0, ...(labels[i] ?? []).map((l) => textWidth(l, theme.font.tick))) > room
              );
            const reach =
              angle === 45 ? (labelWidths[i] ?? 0) * Math.SQRT1_2 : lineHeight(theme.font.tick);
            return reach > room;
          });
      return {
        axis,
        left,
        ...geo,
        labels,
        clusterLabels,
        barBlock,
        overlap,
        bottom: tickOut + 3 + barBlock + clusterBlock + PAD,
      };
    };

    // Brackets may need more room above the data: lay out, check, make room.
    // Inside a boxed frame they must stay under its top, so the axis goes
    // higher (as Prism does); otherwise the top margin grows. Each pass lays
    // out at the room it was given, never at room it added afterwards.
    const boxed = theme.spines === 'box' && input.yMax === undefined;
    let upTo = hi;
    let m = measure(upTo);
    let top = ceiling + 3;
    let placed: PlacedBracket[] = [];
    let plotH = 0;
    let yOf = (v: number) => v;
    // Inside the frame while raising the axis helps; when it doesn't (the data
    // sits low), the top margin grows instead.
    let inside = boxed;
    let lastNeed = Number.POSITIVE_INFINITY;
    const PASSES = 12;
    for (let pass = 0; pass < PASSES; pass += 1) {
      m = measure(upTo);
      plotH = Math.max(10, H - top - m.bottom);
      const scaleTop = top;
      const ph = plotH;
      const ax = m.axis;
      yOf = (v: number) => {
        const f = ax.frac(v);
        // A value a log axis can't show sits just below it.
        return scaleTop + ph * (1 - (f ?? -0.02));
      };
      placed = placeBrackets(input, yOf, m.centre, m.sub, scaleTop + ph);
      const highest = Math.min(...placed.map((b) => b.top));
      if (pass === PASSES - 1) break;
      if (inside) {
        const need = top + 2 - highest;
        if (!(need > 0.01)) break;
        if (need > lastNeed * 0.9) {
          inside = false;
          continue;
        }
        lastNeed = need;
        // Raise the axis's top by the share of the plot the brackets lack, a little more for rounding.
        const [d0, d1] = m.axis.domain;
        const share = (need / plotH) * 1.1;
        upTo = log ? d1 * (d1 / d0) ** share : d1 + (d1 - d0) * share;
        continue;
      }
      const above = Math.min(top, highest);
      if (above >= ceiling - 0.01) break;
      top += ceiling - above;
    }
    // Brackets raised so far that no room could be made (over groups whose
    // data sits low, which extra room doesn't move) stop at the top.
    const limit = inside ? top + 2 : ceiling;
    if (Math.min(...placed.map((b) => b.top)) < limit - 0.01)
      placed = placeBrackets(input, yOf, m.centre, m.sub, top + plotH, limit);
    const { axis, left, plotW, labels, clusterLabels, barBlock } = m;
    /** Each group's slot: its share of a cluster, or its own. */
    const slotOf = m.sub;
    notes.push(...axis.notes);

    const xOf = m.centre;
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
    const tick = (ref: string, x: number) => {
      marks.push({
        kind: 'line',
        role: 'tick-x',
        ref,
        x1: x,
        y1: baseY,
        x2: x,
        y2: baseY - dir * theme.lines.tickLength,
        line: tickLine,
      });
    };
    const y0 = baseY + tickOut + 3;
    if (barLabels)
      groups.forEach((g, i) => {
        const x = xOf(i);
        tick(g.id, x);
        if (angle !== undefined) {
          marks.push({
            kind: 'text',
            role: 'group-label',
            ref: g.series ?? g.id,
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
            ref: g.series ?? g.id,
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
    if (clusters) {
      const cy = y0 + (barLabels ? barBlock + 3 : 0);
      clusters.forEach((_, ci) => {
        const cx = left + m.slot * (ci + 0.5);
        if (!barLabels) tick(`cluster-${String(ci)}`, cx);
        (clusterLabels[ci] ?? []).forEach((line, k) => {
          marks.push({
            kind: 'text',
            role: 'cluster-label',
            ref: `cluster-${String(ci)}`,
            x: cx,
            y: cy + tickA + k * lineHeight(theme.font.tick),
            text: line,
            size: theme.font.tick,
            weight: barLabels ? 700 : 400,
            anchor: 'middle',
            fill: ink,
          });
        });
      });
    }

    // --- legend ----------------------------------------------------------------
    const legendEntry = (e: (typeof entries)[number], x: number, y: number) => {
      marks.push({
        kind: 'rect',
        role: 'legend-swatch',
        ref: e.id,
        x,
        y: y - swatch * 0.85,
        w: swatch,
        h: swatch,
        fill: lighten(e.color, theme.barLighten),
        line: { stroke: theme.barEdge ?? e.color, width: theme.lines.barEdge },
      });
      marks.push({
        kind: 'text',
        role: 'legend-label',
        ref: e.id,
        x: x + swatch + 3,
        y,
        text: e.title,
        size: legendSize,
        weight: 400,
        anchor: 'start',
        fill: ink,
      });
    };
    if (legend?.at === 'right') {
      entries.forEach((e, k) => {
        legendEntry(e, left + plotW + 8, top + ascent(legendSize) + k * legendLine);
      });
    } else if (legend) {
      legendRows.forEach((row, r) => {
        const width = row.reduce((a, e) => a + entryW(e.title), 0) - 8;
        let x = left + plotW / 2 - width / 2;
        for (const e of row) {
          legendEntry(e, Math.max(PAD, x), PAD + titleH + ascent(legendSize) + r * legendLine);
          x += entryW(e.title);
        }
      });
    }

    // --- data ------------------------------------------------------------------
    // Bars of a cluster nearly touch; a group's own bar keeps the theme's width.
    const barWOf = (i: number) =>
      slotOf(i) * (clusters ? Math.min(0.95, theme.barWidth + 0.3) : theme.barWidth);
    const errLine = { stroke: ink, width: theme.lines.error };
    const swarmState = { squeezed: false };
    const noDistribution: string[] = [];
    const noViolin: string[] = [];
    // One density scale for every violin, so their widths compare.
    const maxDensity = Math.max(0, ...groups.flatMap((g) => g.summary?.kde?.density ?? []));
    const edgeOf = (g: GroupInput) => ({
      stroke: theme.barEdge ?? g.color,
      width: theme.lines.barEdge,
    });
    /** A beeswarm of `values` within `halfWidth` of x. A SuperPlot (item 13) colours each
     * point by its biological replicate instead, and overlays each replicate's own mean. */
    // A SuperPlot's replicate means go on top of the mean line and error bar, as in
    // Lord et al. 2020, Fig. 1 ("Even better").
    const onTop: Mark[] = [];
    const drawPoints = (g: GroupInput, x: number, list: readonly number[], halfWidth: number) => {
      const superplot =
        plot.kind === 'dots' &&
        plot.colorByReplicate === true &&
        list === g.values &&
        g.replicateOf;
      // Kept alongside its original index, so a SuperPlot's replicate colours survive the
      // log-scale filter (which drops values positionally out of `list`).
      const indexed = list.map((v, i) => [v, i] as const);
      const kept = log ? indexed.filter(([v]) => v > 0) : indexed;
      if (kept.length === 0) return;
      // A SuperPlot's individual values are small and pale, so its replicate means read.
      const size = superplot ? theme.pointSize * SUPERPLOT_POINT : theme.pointSize;
      const ys = kept.map(([v]) => yOf(v));
      const swarm = beeswarm(ys, size + 0.4, Math.max(0, halfWidth));
      swarmState.squeezed ||= swarm.squeezed;
      const fill = theme.pointColor ?? g.color;
      const line = { stroke: darken(fill, theme.pointDarken), width: theme.lines.pointEdge };
      kept.forEach(([, original], k) => {
        const replicate = superplot ? (superplot[original] ?? 0) : null;
        const cx = x + (swarm.offsets[k] ?? 0);
        const cy = ys[k] ?? 0;
        if (replicate === null) {
          marks.push(
            pointMark(g.symbol ?? 'circle', cx, cy, size, {
              role: 'point',
              ref: g.series ?? g.id,
              fill,
              opacity: theme.pointOpacity,
              line,
            }),
          );
          return;
        }
        const color = paletteColor(replicate);
        marks.push(
          pointMark(replicateSymbol(replicate), cx, cy, size, {
            role: 'point',
            ref: g.series ?? g.id,
            fill: lighten(color, 0.6),
            opacity: theme.pointOpacity,
            line: { stroke: color, width: theme.lines.pointEdge },
          }),
        );
      });
      if (superplot && g.replicateMeans) {
        // Spread sideways where they would overlap, as the points are.
        const meanSize = theme.pointSize * SUPERPLOT_MEAN;
        const shown = g.replicateMeans.flatMap((mean, ri) =>
          mean !== null && !(log && !(mean > 0)) ? [{ mean, ri }] : [],
        );
        const ys = shown.map(({ mean }) => yOf(mean));
        const swarm = beeswarm(ys, meanSize + 0.6, Math.max(0, halfWidth));
        shown.forEach(({ ri }, k) => {
          onTop.push(
            pointMark(replicateSymbol(ri), x + (swarm.offsets[k] ?? 0), ys[k] ?? 0, meanSize, {
              role: 'replicate-mean',
              ref: g.series ?? g.id,
              fill: paletteColor(ri),
              opacity: 1,
              line: { stroke: ink, width: theme.lines.pointEdge * 2 },
            }),
          );
        });
      }
    };
    const hline = (role: string, ref: string, x1: number, x2: number, y: number, line: Stroke) => {
      marks.push({ kind: 'line', role, ref, x1, y1: y, x2, y2: y, line });
    };
    const vline = (role: string, ref: string, x: number, y1: number, y2: number, line: Stroke) => {
      marks.push({ kind: 'line', role, ref, x1: x, y1, x2: x, y2, line });
    };

    groups.forEach((g, i) => {
      const x = xOf(i);
      const s = g.summary;
      const slot = slotOf(i);
      const barW = barWOf(i);
      if (plot.kind === 'box') {
        if (!s) return;
        const w = s.whiskers;
        if (!w || s.q1 == null || s.q3 == null || s.median === null) {
          if (s.n !== null && s.n > 0) noDistribution.push(g.title);
          return;
        }
        const boxW = slot * theme.barWidth * 0.8;
        const yq1 = yOf(s.q1);
        const yq3 = yOf(s.q3);
        marks.push({
          kind: 'rect',
          role: 'box',
          ref: g.series ?? g.id,
          x: x - boxW / 2,
          y: Math.min(yq1, yq3),
          w: boxW,
          h: Math.abs(yq1 - yq3),
          fill: lighten(g.color, theme.barLighten),
          line: edgeOf(g),
        });
        const cap = (boxW / 2) * theme.capWidth;
        for (const [from, to] of [
          [s.q3, w.high],
          [s.q1, w.low],
        ] as const) {
          if (from === to) continue;
          vline('whisker', g.series ?? g.id, x, yOf(from), yOf(to), errLine);
          hline('whisker', g.series ?? g.id, x - cap, x + cap, yOf(to), errLine);
        }
        hline('median', g.series ?? g.id, x - boxW / 2, x + boxW / 2, yOf(s.median), {
          stroke: ink,
          width: theme.lines.error * 1.6,
        });
        if (plot.points === 'all') drawPoints(g, x, g.values, boxW / 2 - theme.pointSize / 2);
        else if (plot.points === 'outliers')
          drawPoints(g, x, w.beyond, boxW / 2 - theme.pointSize / 2);
        return;
      }
      if (plot.kind === 'violin') {
        if (!s) return;
        const kde = s.kde;
        if (!kde || kde.y.length < 2 || maxDensity <= 0) {
          if (s.n !== null && s.n > 0) (s.q1 == null ? noDistribution : noViolin).push(g.title);
          return;
        }
        const half = slot * 0.4;
        const wAt = (k: number) => ((kde.density[k] ?? 0) / maxDensity) * half;
        const pts = kde.y.map((y, k) => [x + wAt(k), yOf(y)] as const);
        const back = kde.y.map((y, k) => [x - wAt(k), yOf(y)] as const).reverse();
        const f = fmt;
        const d = [...pts, ...back]
          .map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${f(px)} ${f(py)}`)
          .join('');
        marks.push({
          kind: 'path',
          role: 'violin',
          ref: g.series ?? g.id,
          d: `${d}Z`,
          fill: lighten(g.color, theme.barLighten),
          line: edgeOf(g),
        });
        // The violin's half-width at a value, for lines across it.
        const widthAt = (v: number) => {
          const ys = kde.y;
          for (let k = 1; k < ys.length; k += 1) {
            const a = ys[k - 1] ?? 0;
            const b = ys[k] ?? 0;
            if (v >= a && v <= b) {
              const t = b === a ? 0 : (v - a) / (b - a);
              return wAt(k - 1) + (wAt(k) - wAt(k - 1)) * t;
            }
          }
          return 0;
        };
        if (plot.inner === 'quartiles' && s.q1 != null && s.q3 != null && s.median !== null) {
          for (const q of [s.q1, s.q3]) {
            const hw = widthAt(q);
            hline('median', g.series ?? g.id, x - hw, x + hw, yOf(q), {
              stroke: ink,
              width: theme.lines.error,
              dash: '2 1.5',
            });
          }
          const hw = widthAt(s.median);
          hline('median', g.series ?? g.id, x - hw, x + hw, yOf(s.median), {
            stroke: ink,
            width: theme.lines.error * 1.4,
          });
        } else if (plot.inner === 'box' && s.q1 != null && s.q3 != null && s.median !== null) {
          const bw = Math.max(2, slot * 0.05);
          if (s.min !== null && s.max !== null)
            vline('whisker', g.series ?? g.id, x, yOf(s.min), yOf(s.max), {
              stroke: ink,
              width: theme.lines.error,
            });
          marks.push({
            kind: 'rect',
            role: 'box',
            ref: g.series ?? g.id,
            x: x - bw / 2,
            y: Math.min(yOf(s.q1), yOf(s.q3)),
            w: bw,
            h: Math.abs(yOf(s.q1) - yOf(s.q3)),
            fill: ink,
          });
          marks.push({
            kind: 'circle',
            role: 'median',
            ref: g.series ?? g.id,
            cx: x,
            cy: yOf(s.median),
            r: Math.min(bw / 2, 1.4),
            fill: '#ffffff',
            opacity: 1,
          });
        } else if (plot.inner === 'points') {
          drawPoints(g, x, g.values, half * 0.6);
        }
        return;
      }
      const c = s ? centre(plot, s) : null;
      if (plot.kind === 'bars' && s && c !== null && !(log && !(c > 0))) {
        const yc = yOf(c);
        marks.push({
          kind: 'rect',
          role: 'bar',
          ref: g.series ?? g.id,
          x: x - barW / 2,
          y: Math.min(yc, zeroY),
          w: barW,
          h: Math.abs(zeroY - yc),
          fill: lighten(g.color, theme.barLighten),
          line: edgeOf(g),
        });
      }
      // Points: a beeswarm within the bar, or within most of the slot.
      if (plot.kind === 'dots' || plot.points) {
        const d = theme.pointSize + 0.4;
        drawPoints(g, x, g.values, plot.kind === 'bars' ? barW / 2 - d / 2 : slot * 0.38);
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
          vline('error', g.series ?? g.id, x, yEnd(from), yEnd(to), errLine);
          for (const v of onlyUp ? [c >= 0 ? e[1] : e[0]] : [e[0], e[1]]) {
            if (log && !(v > 0)) continue;
            hline('error-cap', g.series ?? g.id, x - cap, x + cap, yOf(v), errLine);
          }
        }
        if (plot.kind === 'dots') {
          hline('centre', g.series ?? g.id, x - half, x + half, yOf(c), {
            stroke: ink,
            width: theme.lines.error * 1.6,
          });
        }
      }
    });
    marks.push(...onTop);
    const list = (names: readonly string[]) =>
      names.length === 1
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
    if (noDistribution.length > 0)
      notes.push(
        `${list(noDistribution)} ${noDistribution.length === 1 ? 'has' : 'have'} summary data only (mean, SD, n): box and violin plots need the individual values.`,
      );
    if (noViolin.length > 0)
      notes.push(
        `${list(noViolin)} ${noViolin.length === 1 ? 'has' : 'have'} fewer than 3 different values, too few for a violin.`,
      );
    if (plot.kind === 'violin') {
      const bws = groups.flatMap((g) =>
        g.summary?.kde
          ? [`${g.title} ${sigFigs(g.summary.kde.bw)}${log ? ' (log₁₀ units)' : ''}`]
          : [],
      );
      if (bws.length > 0) notes.push(`Bandwidths: ${bws.join(', ')}.`);
    }
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

    return { marks, notes, overlap: m.overlap };
  };

  // Group labels: level and wrapped by default; escalated to a turned
  // angle only if that would still overlap (note 12). An angle the user
  // set explicitly is a hard override, tried once, never wrapped.
  const candidates: (45 | 90 | undefined)[] =
    input.xAngle !== undefined ? [input.xAngle] : [undefined, 45, 90];
  let result = attempt(candidates[0]);
  let resolvedXAngle: 45 | 90 | undefined;
  for (let k = 1; k < candidates.length && result.overlap; k += 1) {
    const c = candidates[k];
    result = attempt(c);
    resolvedXAngle = c;
  }
  if (result.overlap)
    notes.push(
      'Some group labels are long enough to touch even turned; make the graph wider or shorten the names.',
    );

  return {
    width: W,
    height: H,
    font: theme.font.family,
    marks: result.marks,
    notes: [...notes, ...result.notes],
    ...(resolvedXAngle !== undefined ? { resolvedXAngle } : {}),
  };
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
  centre: (i: number) => number,
  slotOf: (i: number) => number,
  /** The plot's bottom: where an empty group's data "is". */
  bottomY: number,
  /** No raised bracket's label goes above this; unset = no limit. */
  limit?: number,
): PlacedBracket[] {
  const { theme, plot, groups } = input;
  const log = input.axis?.scale === 'log10';
  const groupTop = groups.map((g) => {
    let top = Number.POSITIVE_INFINITY;
    const r = reach(plot, g);
    for (const v of r.points) if (!log || v > 0) top = Math.min(top, yOf(v) - theme.pointSize / 2);
    for (const v of r.lines) if (!log || v > 0) top = Math.min(top, yOf(v));
    return Number.isFinite(top) ? top : bottomY;
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
    const auto = floor - gap;
    let offset = Math.max(0, b.offset ?? 0);
    if (limit !== undefined) offset = Math.min(offset, Math.max(0, auto - labelH - limit));
    const y = auto - offset;
    const inset = (i: number) => slotOf(i) * 0.12;
    placed.push({
      id: b.id,
      label: b.label,
      x1: centre(b.lo) + inset(b.lo),
      x2: centre(b.hi) - inset(b.hi),
      y,
      top: y - labelH,
      lo: b.lo,
      hi: b.hi,
    });
  }
  return placed;
}

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** A bandwidth for the notes, to 3 significant digits. */
const sigFigs = (v: number) => String(Number(v.toPrecision(3)));
