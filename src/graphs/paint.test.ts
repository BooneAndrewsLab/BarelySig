// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { type GroupInput, type LayoutInput, layoutColumn } from './layout';
import { type Ctx, MAX_PIXELS, PAINT_FONT, paintScene, screenScale } from './paint';
import { COLORBLIND } from './palette';
import type { Mark, Scene } from './scene';
import { sceneToSvg } from './svg';
import { CLASSIC, MODERN } from './theme';

/** What one mark came out as, from the painter's calls or from the SVG's attributes. */
interface Drawing {
  shape: string;
  geometry: number[];
  fill: string | null;
  fillOpacity: number;
  stroke: string | null;
  strokeWidth: number | null;
  dash: number[];
  text?: { text: string; size: number; bold: boolean; anchor: string; rotate: number };
}

const css = (v: unknown): string => (typeof v === 'string' ? v : '(not a colour)');

/** A 2D context that records what is drawn, one `Drawing` per mark. */
class Recorder implements Ctx {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  miterLimit = 10;
  fontKerning: CanvasFontKerning = 'auto';
  transform: number[] = [];
  drawings: Drawing[] = [];
  private shape = '';
  private geometry: number[] = [];
  private dashes: number[] = [];
  private turn = 0;
  private at: [number, number] = [0, 0];
  private current: Drawing | null = null;

  private open(): Drawing {
    this.current ??= {
      shape: this.shape,
      geometry: this.geometry,
      fill: null,
      fillOpacity: 1,
      stroke: null,
      strokeWidth: null,
      dash: [],
    };
    return this.current;
  }
  private close(): void {
    if (this.current) this.drawings.push(this.current);
    this.current = null;
  }

  setTransform(...args: unknown[]): void {
    this.transform = args.map(Number);
  }
  save(): void {
    // Only rotations are saved, and restore() undoes them.
  }
  restore(): void {
    this.turn = 0;
    this.at = [0, 0];
  }
  translate(x: number, y: number): void {
    this.at = [x, y];
  }
  rotate(a: number): void {
    this.turn = (a * 180) / Math.PI;
  }
  beginPath(): void {
    this.close();
    this.geometry = [];
    this.shape = 'path';
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.shape = 'rect';
    this.geometry.push(x, y, w, h);
  }
  arc(x: number, y: number, r: number): void {
    this.shape = 'circle';
    this.geometry.push(x, y, r);
  }
  moveTo(x: number, y: number): void {
    this.geometry.push(x, y);
  }
  lineTo(x: number, y: number): void {
    this.geometry.push(x, y);
  }
  closePath(): void {
    // A closed outline has the same points.
  }
  fill(): void {
    const d = this.open();
    d.fill = css(this.fillStyle);
    d.fillOpacity = this.globalAlpha;
  }
  stroke(): void {
    const d = this.open();
    d.stroke = css(this.strokeStyle);
    d.strokeWidth = this.lineWidth;
    d.dash = this.dashes;
    // The fill's opacity must not reach the stroke.
    expect(this.globalAlpha).toBe(1);
  }
  setLineDash(segments: number[]): void {
    this.dashes = segments;
  }
  fillText(text: string, x: number, y: number): void {
    this.close();
    const m = /^(bold )?([\d.]+)px (.+)$/.exec(this.font);
    expect(m?.[3]).toBe(PAINT_FONT);
    this.drawings.push({
      shape: 'text',
      geometry: this.turn ? this.at : [x, y],
      fill: css(this.fillStyle),
      fillOpacity: this.globalAlpha,
      stroke: null,
      strokeWidth: null,
      dash: [],
      text: {
        text,
        size: Number(m?.[2]),
        bold: m?.[1] !== undefined,
        anchor: { left: 'start', center: 'middle', right: 'end' }[this.textAlign as string] ?? '?',
        rotate: this.turn,
      },
    });
  }
  done(): Drawing[] {
    this.close();
    return this.drawings;
  }
}

const nums = (s: string | null) =>
  s === null || s.trim() === ''
    ? []
    : s
        .trim()
        .split(/[\s,]+/)
        .map(Number);

/** The points of an M/L/H/V/Z path, as the painter traces them. */
function pathPoints(d: string): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd = '', args = ''] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const n = nums(args);
    if (cmd === 'Z') continue;
    if (cmd === 'H') x = n[0] ?? x;
    else if (cmd === 'V') y = n[0] ?? y;
    else [x = x, y = y] = n;
    out.push(x, y);
  }
  return out;
}

/** What the serialiser wrote for one element. */
function fromSvg(el: Element): Drawing {
  const a = (k: string) => el.getAttribute(k);
  const fill = el.tagName === 'line' ? null : a('fill');
  const width = a('stroke-width') === null ? null : Number(a('stroke-width'));
  const stroked = a('stroke') !== null && a('stroke') !== 'none' && width !== null && width > 0;
  const base = {
    fill: fill === 'none' ? null : fill,
    fillOpacity: fill === null || fill === 'none' ? 1 : Number(a('fill-opacity') ?? 1),
    stroke: stroked ? a('stroke') : null,
    strokeWidth: stroked ? width : null,
    dash: stroked ? nums(a('stroke-dasharray')) : [],
  };
  const n = (k: string) => Number(a(k));
  switch (el.tagName) {
    case 'rect':
      return { shape: 'rect', geometry: [n('x'), n('y'), n('width'), n('height')], ...base };
    case 'circle':
      return { shape: 'circle', geometry: [n('cx'), n('cy'), n('r')], ...base };
    case 'line':
      return { shape: 'path', geometry: [n('x1'), n('y1'), n('x2'), n('y2')], ...base };
    case 'path':
      return { shape: 'path', geometry: pathPoints(a('d') ?? ''), ...base };
    case 'text': {
      const rotate = /rotate\(([-\d.]+)/.exec(a('transform') ?? '');
      return {
        shape: 'text',
        geometry: [n('x'), n('y')],
        ...base,
        text: {
          text: el.textContent,
          size: n('font-size'),
          bold: a('font-weight') === 'bold',
          anchor: a('text-anchor') ?? 'start',
          rotate: rotate ? Number(rotate[1]) : 0,
        },
      };
    }
    default:
      throw new Error(el.tagName);
  }
}

function painted(m: Mark): Drawing {
  const ctx = new Recorder();
  paintScene(ctx, { width: 100, height: 100, font: 'x', marks: [m], notes: [] }, 1);
  const out = ctx.done();
  expect(out).toHaveLength(1);
  const [d] = out;
  if (!d) throw new Error('nothing drawn');
  return d;
}

/** Equal but for the serialiser's rounding to 0.01. */
function expectSame(got: Drawing, want: Drawing, what: string): void {
  const round = (d: Drawing) => ({
    ...d,
    geometry: d.geometry.map((v) => Math.round(v * 100) / 100),
    fillOpacity: Math.round(d.fillOpacity * 100) / 100,
    strokeWidth: d.strokeWidth === null ? null : Math.round(d.strokeWidth * 100) / 100,
    text: d.text && { ...d.text, size: Math.round(d.text.size * 100) / 100 },
  });
  const g = round(got);
  const w = round(want);
  g.geometry.forEach((v, i) => {
    expect(Math.abs(v - (w.geometry[i] ?? NaN)), `${what} geometry`).toBeLessThanOrEqual(0.011);
  });
  expect({ ...g, geometry: g.geometry.length }, what).toEqual({
    ...w,
    geometry: w.geometry.length,
  });
}

function dist(i: number, values: readonly number[], symbol?: GroupInput['symbol']): GroupInput {
  const s = [...values].sort((a, b) => a - b);
  const at = (p: number) => s[Math.round(p * (s.length - 1))] ?? 0;
  const lo = s[0] ?? 0;
  const hi = s[s.length - 1] ?? 0;
  const y = Array.from({ length: 12 }, (_, k) => lo + ((hi - lo) * k) / 11);
  return {
    id: `g${String(i)}`,
    title: `Group number ${String(i)}`,
    color: COLORBLIND[i] ?? '#000',
    symbol,
    values,
    summary: {
      n: values.length,
      mean: at(0.5) + 0.3,
      median: at(0.5),
      sd: 4,
      sem: 1.5,
      ciLower: at(0.2),
      ciUpper: at(0.8),
      min: lo,
      max: hi,
      q1: at(0.25),
      q3: at(0.75),
      whiskers: { low: at(0.1), high: at(0.9), beyond: [lo, hi] },
      kde: { bw: 2, y, density: y.map((v) => Math.exp(-(((v - at(0.5)) / 6) ** 2))) },
    },
  };
}

const groups = [
  dist(0, [88, 90, 91, 93, 95, 97, 99, 104]),
  dist(1, [70, 71, 75, 78, 80, 84, 85], 'square'),
  dist(2, [55, 60, 61, 64, 66, 70], 'diamond'),
  dist(3, [40, 45, 47, 52, 53], 'triangle'),
];

const scenes: [string, LayoutInput][] = [
  ...(
    [
      { kind: 'bars', error: 'sd', points: true },
      { kind: 'dots', center: 'median', error: 'ci' },
      { kind: 'box', whiskers: 'tukey', points: 'all' },
      { kind: 'violin', inner: 'quartiles', bandwidth: 1 },
      { kind: 'violin', inner: 'points', bandwidth: 1 },
    ] as unknown as LayoutInput['plot'][]
  ).map((plot): [string, LayoutInput] => [
    plot.kind,
    {
      plot,
      size: { width: 80, height: 60 },
      theme: MODERN,
      yTitle: 'Viability (%)',
      title: 'Everything drawn',
      groups,
      brackets: [
        { id: 'a', from: 0, to: 1, label: '****' },
        { id: 'b', from: 0, to: 3, label: 'P = 0.012' },
      ],
    },
  ]),
  [
    'classic, turned labels, legend',
    {
      plot: { kind: 'bars', error: 'sem', points: false },
      size: { width: 60, height: 50 },
      theme: CLASSIC,
      yTitle: 'Signal',
      xAngle: 45,
      groups,
      brackets: [],
      legend: {
        at: 'right',
        entries: groups.map((g) => ({ id: g.id, title: g.title, color: g.color })),
      },
    },
  ],
];

describe('the painter draws what the SVG shows', () => {
  it.each(scenes)('%s: every mark, in order, as the serialiser writes it', (_, input) => {
    const scene = layoutColumn(input);
    const doc = new DOMParser().parseFromString(sceneToSvg(scene), 'image/svg+xml');
    const elements = [...doc.documentElement.children];
    expect(elements).toHaveLength(scene.marks.length);
    scene.marks.forEach((m, i) => {
      const el = elements[i];
      if (!el) throw new Error('missing element');
      expectSame(painted(m), fromSvg(el), `${String(i)} ${m.role}`);
    });
  });

  it('covers every kind of mark, dashes, turned text and fill opacity', () => {
    const marks = scenes.flatMap(([, input]) => layoutColumn(input).marks);
    expect(new Set(marks.map((m) => m.kind))).toEqual(
      new Set(['rect', 'line', 'path', 'circle', 'text']),
    );
    expect(marks.some((m) => m.kind === 'line' && m.line.dash !== undefined)).toBe(true);
    expect(marks.some((m) => m.kind === 'text' && m.rotate)).toBe(true);
    expect(marks.some((m) => m.kind === 'circle' && m.opacity < 1)).toBe(true);
    expect(marks.some((m) => m.kind === 'rect' && m.fill === 'none')).toBe(true);
  });

  it('sets up the canvas as SVG draws: scale, butt caps, miter limit 4, no kerning', () => {
    const ctx = new Recorder();
    const scene: Scene = { width: 10, height: 10, font: 'x', marks: [], notes: [] };
    paintScene(ctx, scene, 3);
    expect(ctx.transform).toEqual([3, 0, 0, 3, 0, 0]);
    expect([ctx.lineCap, ctx.lineJoin, ctx.miterLimit, ctx.fontKerning]).toEqual([
      'butt',
      'miter',
      4,
      'none',
    ]);
  });

  it('draws no stroke of width 0, and no dash from a pattern SVG would ignore', () => {
    const line = (width: number, dash?: string): Mark => ({
      kind: 'line',
      role: 'x',
      x1: 0,
      y1: 0,
      x2: 5,
      y2: 5,
      line: dash === undefined ? { stroke: '#000', width } : { stroke: '#000', width, dash },
    });
    const ctx = new Recorder();
    paintScene(ctx, { width: 10, height: 10, font: 'x', marks: [line(0)], notes: [] }, 1);
    expect(ctx.done()).toEqual([]);
    expect(painted(line(1, '2 -1')).dash).toEqual([]);
    expect(painted(line(1, '0 0')).dash).toEqual([]);
    expect(painted(line(1, '2,1.5')).dash).toEqual([2, 1.5]);
  });
});

describe('the scale of the picture on screen', () => {
  const scene = (w: number, h: number): Scene => ({
    width: w,
    height: h,
    font: 'x',
    marks: [],
    notes: [],
  });

  it('is 3 px per point times the device pixel ratio', () => {
    expect(screenScale(scene(200, 170), 1)).toBe(3);
    expect(screenScale(scene(200, 170), 2)).toBe(6);
    expect(screenScale(scene(200, 170), 0.5)).toBe(3);
  });

  it('never exceeds the pixel budget', () => {
    const s = scene(1500, 1500);
    const k = screenScale(s, 3);
    expect(1500 * k * 1500 * k).toBeLessThanOrEqual(MAX_PIXELS * 1.0001);
  });
});
