/**
 * The scene painted on a canvas (item 11), for the figure on screen: the
 * worker paints it off the main thread. Each mark is drawn the way
 * `svg.ts` writes it (fill, fill opacity, stroke, dash, butt caps, miter
 * joins with SVG's limit, anchored and turned text, kerning off), so the
 * picture is the exported SVG's. Exports stay the SVG.
 */
import type { Mark, Scene, Stroke } from './scene';

/** The part of a 2D context the painter uses (a recording fake in tests). */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'beginPath'
  | 'rect'
  | 'arc'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'fillText'
  | 'setLineDash'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineCap'
  | 'lineJoin'
  | 'miterLimit'
  | 'fontKerning'
>;

/** The family the painter's fonts are registered under: Arimo, the layout's metrics. */
export const PAINT_FONT = 'Arimo';

/** A stroke/dash list as SVG reads it: numbers separated by spaces or commas. */
function dashOf(dash: string | undefined): number[] {
  if (dash === undefined) return [];
  const n = dash
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  // SVG ignores a pattern with a negative or non-number entry, or one that sums to 0.
  return n.every((v) => Number.isFinite(v) && v >= 0) && n.some((v) => v > 0) ? n : [];
}

/** Traces an absolute M/L/H/V/Z path (the only commands the layout writes). */
export function tracePath(ctx: Ctx, d: string): void {
  let x = 0;
  let y = 0;
  for (const [, cmd = '', args = ''] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const n = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    if (cmd === 'Z') {
      ctx.closePath();
      continue;
    }
    if (cmd === 'H') x = n[0] ?? x;
    else if (cmd === 'V') y = n[0] ?? y;
    else {
      x = n[0] ?? x;
      y = n[1] ?? y;
    }
    if (cmd === 'M') ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function finish(ctx: Ctx, fill: string | undefined, opacity: number, line: Stroke | undefined) {
  if (fill !== undefined && fill !== 'none' && opacity > 0) {
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // A width of 0 draws nothing in SVG; a canvas would keep the last width.
  if (line && line.stroke !== 'none' && line.width > 0) {
    ctx.strokeStyle = line.stroke;
    ctx.lineWidth = line.width;
    ctx.setLineDash(dashOf(line.dash));
    ctx.stroke();
  }
}

const ALIGN = { start: 'left', middle: 'center', end: 'right' } as const;

function paintMark(ctx: Ctx, m: Mark): void {
  switch (m.kind) {
    case 'rect':
      ctx.beginPath();
      ctx.rect(m.x, m.y, m.w, m.h);
      finish(ctx, m.fill, 1, m.line);
      return;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      finish(ctx, undefined, 1, m.line);
      return;
    case 'path':
      ctx.beginPath();
      tracePath(ctx, m.d);
      finish(ctx, m.fill, m.opacity ?? 1, m.line);
      return;
    case 'circle':
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, m.r, 0, 2 * Math.PI);
      finish(ctx, m.fill, m.opacity, m.line);
      return;
    case 'text':
      ctx.font = `${m.weight === 700 ? 'bold ' : ''}${String(m.size)}px ${PAINT_FONT}`;
      ctx.textAlign = ALIGN[m.anchor];
      ctx.fillStyle = m.fill;
      if (m.rotate) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate((m.rotate * Math.PI) / 180);
        ctx.fillText(m.text, 0, 0);
        ctx.restore();
      } else ctx.fillText(m.text, m.x, m.y);
      return;
  }
}

/** Paints the scene with `scale` canvas pixels per point, on whatever the canvas holds. */
export function paintScene(ctx: Ctx, scene: Scene, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 4;
  ctx.textBaseline = 'alphabetic';
  ctx.fontKerning = 'none';
  for (const m of scene.marks) paintMark(ctx, m);
}

/** Largest picture the worker paints, in pixels (a 183 mm figure at 3× is well under). */
export const MAX_PIXELS = 16_000_000;

/**
 * Canvas pixels per point for the figure on screen: it is shown at up to
 * 3 CSS px per point (2.25× its millimetre size, in a wide section; note
 * 08), times the device pixel ratio.
 */
export function screenScale(scene: Scene, dpr: number): number {
  const want = 3 * Math.max(1, dpr);
  const area = scene.width * scene.height;
  return area * want * want > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / area) : want;
}
