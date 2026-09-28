/**
 * A figure as drawn (item 11): its picture and what the page needs to
 * work with it (size, notes, element list, hit regions, outlines), with
 * no scene. Hit regions and outlines are typed arrays, so they cross from
 * the worker without copying and a click is a loop over numbers.
 */
import { type ElementId, elementOf, elementsOf, fitLineBoxes, hitRegions, markBox } from './hit';
import type { Scene } from './scene';

export interface PackedRegions {
  /** x0, y0, x1, y1 of each region, in points. */
  readonly boxes: Float32Array;
  /** Index into `elements` of each region. */
  readonly owner: Uint16Array;
  readonly elements: readonly ElementId[];
}

export interface DrawnParts {
  /** Points. */
  readonly width: number;
  readonly height: number;
  readonly notes: readonly string[];
  /** The elements it has, in drawing order. */
  readonly elements: readonly ElementId[];
  readonly regions: PackedRegions;
  /** Boxes (x0, y0, x1, y1, …) outlining each element when selected. */
  readonly outlines: ReadonlyMap<ElementId, Float32Array>;
}

export type Picture =
  /** Painted by the worker. */
  | { readonly kind: 'png'; readonly url: string }
  /** Drawn on the main thread, where there is no worker canvas: the SVG itself. */
  | { readonly kind: 'svg'; readonly svg: string };

export interface Drawn extends DrawnParts {
  readonly picture: Picture;
}

/** Hit regions at the size the graph section uses. */
const HIT_MIN = 5;

export function drawnParts(scene: Scene): DrawnParts {
  const elements = elementsOf(scene);
  const index = new Map(elements.map((e, i) => [e, i]));
  const regions = hitRegions(scene, HIT_MIN);
  const boxes = new Float32Array(regions.length * 4);
  const owner = new Uint16Array(regions.length);
  regions.forEach((r, i) => {
    boxes.set([r.x0, r.y0, r.x1, r.y1], i * 4);
    owner[i] = index.get(r.element) ?? 0;
  });
  return {
    width: scene.width,
    height: scene.height,
    notes: scene.notes,
    elements,
    regions: { boxes, owner, elements },
    outlines: outlinesOf(scene),
  };
}

/**
 * What `elementBoxes` gives for every element at once: each mark of a
 * data set or of the error bars, one box around anything else.
 */
export function outlinesOf(scene: Scene): Map<ElementId, Float32Array> {
  const lists = new Map<ElementId, number[]>();
  for (const m of scene.marks) {
    const e = elementOf(m);
    if (e === null) continue;
    const boxes = m.kind === 'path' && m.role === 'fit-line' ? fitLineBoxes(m.d) : [markBox(m)];
    let list = lists.get(e);
    if (!list) lists.set(e, (list = []));
    for (const b of boxes) list.push(b.x0, b.y0, b.x1, b.y1);
  }
  const out = new Map<ElementId, Float32Array>();
  for (const [e, list] of lists) {
    if (e.startsWith('series:') || e.startsWith('fit-line:') || e === 'error-bars') {
      out.set(e, Float32Array.from(list));
      continue;
    }
    const u = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < list.length; i += 4) {
      u[0] = Math.min(u[0] ?? 0, list[i] ?? 0);
      u[1] = Math.min(u[1] ?? 0, list[i + 1] ?? 0);
      u[2] = Math.max(u[2] ?? 0, list[i + 2] ?? 0);
      u[3] = Math.max(u[3] ?? 0, list[i + 3] ?? 0);
    }
    out.set(e, Float32Array.from(u));
  }
  return out;
}

/** The element under a point: the smallest region containing it, or null for the background. */
export function pickIn(regions: PackedRegions, x: number, y: number): ElementId | null {
  const b = regions.boxes;
  let best = -1;
  let bestArea = Infinity;
  for (let i = 0; i < regions.owner.length; i += 1) {
    const x0 = b[i * 4] ?? 0;
    const y0 = b[i * 4 + 1] ?? 0;
    const x1 = b[i * 4 + 2] ?? 0;
    const y1 = b[i * 4 + 3] ?? 0;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const area = (x1 - x0) * (y1 - y0);
    if (area < bestArea) {
      best = i;
      bestArea = area;
    }
  }
  return best < 0 ? null : (regions.elements[regions.owner[best] ?? 0] ?? null);
}

/** Outline boxes as one path (a data set of thousands of points is one element, not thousands). */
export function outlinePath(boxes: Float32Array, pad: number): string {
  const f = (v: number) => String(Math.round(v * 100) / 100);
  let d = '';
  for (let i = 0; i + 3 < boxes.length; i += 4) {
    const x0 = (boxes[i] ?? 0) - pad;
    const y0 = (boxes[i + 1] ?? 0) - pad;
    const x1 = (boxes[i + 2] ?? 0) + pad;
    const y1 = (boxes[i + 3] ?? 0) + pad;
    d += `M${f(x0)} ${f(y0)}H${f(x1)}V${f(y1)}H${f(x0)}Z`;
  }
  return d;
}

/** The transferable buffers of the parts, for postMessage. */
export function transferables(parts: DrawnParts): ArrayBuffer[] {
  return [
    parts.regions.boxes.buffer as ArrayBuffer,
    parts.regions.owner.buffer as ArrayBuffer,
    ...[...parts.outlines.values()].map((a) => a.buffer as ArrayBuffer),
  ];
}
