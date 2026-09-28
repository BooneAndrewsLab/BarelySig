/**
 * Click-to-format (note 07): which element of a graph each mark belongs
 * to, and regions to find it under the pointer. Everything comes from the
 * scene the SVG is drawn from, so a selection can't drift from what is
 * shown; nothing here is ever drawn into the scene.
 */
import type { Mark, Scene } from './scene';
import { textWidth } from './text/measure';

/**
 * 'y-axis', 'y-title', 'x-axis', 'x-title', 'title', 'legend',
 * 'error-bars', `series:<data set>`, `bracket:<bracket key>`,
 * `fit-line:<series>` or `band:<series>` (XY graphs, item 31).
 */
export type ElementId = string;

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface Region extends Box {
  readonly element: ElementId;
}

const SERIES_ROLES = new Set([
  'bar',
  'point',
  'replicate-mean',
  'centre',
  'box',
  'median',
  'whisker',
  'violin',
  'xy-point',
]);

/** The element a mark belongs to, or null for marks that aren't formatted on their own. */
export function elementOf(m: Mark): ElementId | null {
  switch (m.role) {
    case 'axis-y':
    case 'tick-y':
    case 'tick-y-minor':
    case 'tick-label':
    case 'frame':
      return 'y-axis';
    case 'axis-x':
    case 'tick-x':
    case 'tick-x-minor':
    case 'tick-label-x':
    case 'group-label':
    case 'cluster-label':
      return 'x-axis';
    case 'axis-title':
      return 'y-title';
    case 'axis-title-x':
      return 'x-title';
    case 'title':
      return 'title';
    case 'error':
    case 'error-cap':
      return 'error-bars';
    case 'bracket':
    case 'bracket-label':
      return m.ref === undefined ? null : `bracket:${m.ref}`;
    case 'legend-swatch':
    case 'legend-label':
      return 'legend';
    case 'fit-line':
      return m.ref === undefined ? null : `fit-line:${m.ref}`;
    case 'band':
      return m.ref === undefined ? null : `band:${m.ref}`;
    default:
      return SERIES_ROLES.has(m.role) && m.ref !== undefined ? `series:${m.ref}` : null;
  }
}

/** The points of an absolute M/L/H/V/Z path, for its bounding box. */
function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd = '', args = ''] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const n = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    if (cmd === 'H') x = n[0] ?? x;
    else if (cmd === 'V') y = n[0] ?? y;
    else if (cmd === 'M' || cmd === 'L') {
      x = n[0] ?? x;
      y = n[1] ?? y;
    } else continue;
    out.push([x, y]);
  }
  return out;
}

const boxOf = (pts: readonly (readonly [number, number])[]): Box => ({
  x0: Math.min(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  x1: Math.max(...pts.map((p) => p[0])),
  y1: Math.max(...pts.map((p) => p[1])),
});

/**
 * A fit line's own bounding box spans most of the plot, so it would never
 * win the smallest-area tie-break against a data point sitting on it
 * (item 31 follow-up). Break it into short segments instead, each boxed
 * tightly, so a click anywhere along the visible stroke is local to it.
 */
const FIT_LINE_SPAN = 6;

export function fitLineBoxes(d: string): Box[] {
  const pts = pathPoints(d);
  const boxes: Box[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const [x0, y0] = a;
    const [x1, y1] = b;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / FIT_LINE_SPAN));
    let px = x0;
    let py = y0;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const qx = x0 + dx * t;
      const qy = y0 + dy * t;
      boxes.push(
        boxOf([
          [px, py],
          [qx, qy],
        ]),
      );
      px = qx;
      py = qy;
    }
  }
  return boxes;
}

/** A mark's bounding box in points (text measured with the graph font, turned when rotated). */
export function markBox(m: Mark): Box {
  switch (m.kind) {
    case 'rect':
      return { x0: m.x, y0: m.y, x1: m.x + m.w, y1: m.y + m.h };
    case 'line':
      return boxOf([
        [m.x1, m.y1],
        [m.x2, m.y2],
      ]);
    case 'circle':
      return { x0: m.cx - m.r, y0: m.cy - m.r, x1: m.cx + m.r, y1: m.cy + m.r };
    case 'path':
      return boxOf(pathPoints(m.d));
    case 'text': {
      const w = textWidth(m.text, m.size, m.weight);
      const x0 = m.anchor === 'start' ? m.x : m.anchor === 'middle' ? m.x - w / 2 : m.x - w;
      const flat: [number, number][] = [
        [x0, m.y - m.size * 0.75],
        [x0 + w, m.y - m.size * 0.75],
        [x0, m.y + m.size * 0.2],
        [x0 + w, m.y + m.size * 0.2],
      ];
      if (!m.rotate) return boxOf(flat);
      const a = (m.rotate * Math.PI) / 180;
      return boxOf(
        flat.map(([px, py]) => {
          const dx = px - m.x;
          const dy = py - m.y;
          return [
            m.x + dx * Math.cos(a) - dy * Math.sin(a),
            m.y + dx * Math.sin(a) + dy * Math.cos(a),
          ];
        }),
      );
    }
  }
}

const pad = (b: Box, min: number): Box => {
  const dx = Math.max(0, (min - (b.x1 - b.x0)) / 2);
  const dy = Math.max(0, (min - (b.y1 - b.y0)) / 2);
  return { x0: b.x0 - dx, y0: b.y0 - dy, x1: b.x1 + dx, y1: b.y1 + dy };
};

/**
 * One region per mark (a frame, which has no fill, gives its four
 * edges), each at least `min` points across so thin lines can be hit.
 */
export function hitRegions(scene: Scene, min: number): Region[] {
  const out: Region[] = [];
  for (const m of scene.marks) {
    const element = elementOf(m);
    if (element === null) continue;
    if (m.kind === 'rect' && m.fill === 'none') {
      const { x, y, w, h } = m;
      const edges: [Box, ElementId][] = [
        [{ x0: x, y0: y, x1: x, y1: y + h }, 'y-axis'],
        [{ x0: x + w, y0: y, x1: x + w, y1: y + h }, 'y-axis'],
        [{ x0: x, y0: y, x1: x + w, y1: y }, 'y-axis'],
        [{ x0: x, y0: y + h, x1: x + w, y1: y + h }, 'x-axis'],
      ];
      for (const [b, e] of edges) out.push({ ...pad(b, min), element: e });
      continue;
    }
    if (m.kind === 'path' && m.role === 'fit-line') {
      for (const b of fitLineBoxes(m.d)) out.push({ ...pad(b, min), element });
      continue;
    }
    out.push({ ...pad(markBox(m), min), element });
  }
  return out;
}

const area = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);

/** The element under a point: the smallest region containing it, or null for the background. */
export function pick(regions: readonly Region[], x: number, y: number): ElementId | null {
  let best: Region | null = null;
  for (const r of regions) {
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
    if (!best || area(r) < area(best)) best = r;
  }
  return best?.element ?? null;
}

/**
 * Boxes outlining a selected element: each mark of a data set or of the
 * error bars (they are scattered over the plot), one box around the
 * marks of anything else (an axis with its ticks and labels).
 */
export function elementBoxes(scene: Scene, element: ElementId): Box[] {
  const marks = scene.marks.filter((m) => elementOf(m) === element);
  const boxes = marks.flatMap((m) =>
    m.kind === 'path' && m.role === 'fit-line' ? fitLineBoxes(m.d) : [markBox(m)],
  );
  if (
    element.startsWith('series:') ||
    element.startsWith('fit-line:') ||
    element === 'error-bars' ||
    boxes.length === 0
  )
    return boxes;
  return [
    {
      x0: Math.min(...boxes.map((b) => b.x0)),
      y0: Math.min(...boxes.map((b) => b.y0)),
      x1: Math.max(...boxes.map((b) => b.x1)),
      y1: Math.max(...boxes.map((b) => b.y1)),
    },
  ];
}

/** The elements a scene has, in drawing order, each once. */
export function elementsOf(scene: Scene): ElementId[] {
  const seen = new Set<ElementId>();
  for (const m of scene.marks) {
    const e = elementOf(m);
    if (e !== null) seen.add(e);
  }
  return [...seen];
}
