/**
 * Draws figures for the page (item 11): in a worker where there is a
 * worker canvas, so a graph of thousands of points never freezes the
 * page; on the main thread otherwise (and in unit tests), as the inline
 * SVG. Each figure asks under a slot (a graph's section, its thumbnail);
 * one render runs at a time and the latest request of each slot wins.
 */
import { drawnOf, sceneOf } from './cache';
import type { Drawn, DrawnParts } from './drawn';
import type { LayoutInput } from './layout';
import type { Scene } from './scene';

export interface FigureView {
  /** The latest picture of this figure; while `busy`, of an earlier version. */
  readonly drawn: Drawn | null;
  /** A newer version is being drawn. */
  readonly busy: boolean;
  readonly error: string | null;
}

export interface GraphRenderer {
  /** What to show for `input` in `slot` now; asks for it to be drawn if it isn't. Stable while unchanged. */
  view(slot: string, input: LayoutInput): FigureView;
  readonly subscribe: (listener: () => void) => () => void;
  /** The scene itself, for exports. */
  scene(input: LayoutInput): Promise<Scene>;
}

export type RenderRequest =
  | {
      readonly type: 'draw';
      readonly id: number;
      readonly input: LayoutInput;
      readonly dpr: number;
    }
  | { readonly type: 'scene'; readonly id: number; readonly input: LayoutInput };

export type RenderReply =
  | {
      readonly type: 'drawn';
      readonly id: number;
      readonly ok: true;
      readonly parts: DrawnParts;
      readonly png: Blob;
    }
  | {
      readonly type: 'drawn';
      readonly id: number;
      readonly ok: false;
      readonly unsupported: boolean;
    }
  | { readonly type: 'scene'; readonly id: number; readonly scene: Scene | null };

/** What a renderer needs of a worker (a fake in tests). */
export interface WorkerLike {
  postMessage(message: RenderRequest): void;
  onmessage: ((e: MessageEvent<RenderReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminate(): void;
}

export const DRAW_FAILED = 'The graph couldn’t be drawn.';

/** Draws on the main thread, synchronously: the figure is the inline SVG. */
export class MainThreadRenderer implements GraphRenderer {
  private readonly views = new WeakMap<LayoutInput, FigureView>();

  view(_slot: string, input: LayoutInput): FigureView {
    let v = this.views.get(input);
    if (!v) {
      try {
        v = { drawn: drawnOf(input), busy: false, error: null };
      } catch (e: unknown) {
        console.error(e);
        v = { drawn: null, busy: false, error: DRAW_FAILED };
      }
      this.views.set(input, v);
    }
    return v;
  }

  subscribe = (): (() => void) => () => undefined;

  scene(input: LayoutInput): Promise<Scene> {
    return Promise.resolve(sceneOf(input));
  }
}

interface Slot {
  readonly want: LayoutInput;
  view: FigureView;
}

/** Pictures kept, besides those on show. */
const KEEP = 32;

export class WorkerRenderer implements GraphRenderer {
  private worker: WorkerLike | null = null;
  /** Most recently asked last. */
  private readonly slots = new Map<string, Slot>();
  /** Finished pictures by input, oldest first. */
  private readonly done = new Map<LayoutInput, Drawn>();
  private readonly failed = new WeakMap<LayoutInput, string>();
  private inFlight: { readonly id: number; readonly input: LayoutInput } | null = null;
  private readonly scenes = new Map<
    number,
    { resolve: (s: Scene) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  /** Set when the worker can't draw here (no fonts in workers, no worker canvas). */
  private fallback: MainThreadRenderer | null = null;

  constructor(
    private readonly spawn: () => WorkerLike,
    private readonly dpr: () => number = () => globalThis.devicePixelRatio || 1,
  ) {}

  view(slot: string, input: LayoutInput): FigureView {
    if (this.fallback) return this.fallback.view(slot, input);
    const s = this.slots.get(slot);
    if (s?.want === input) return s.view;
    const view = this.viewOf(input, s?.view.drawn ?? null);
    this.slots.delete(slot);
    this.slots.set(slot, { want: input, view });
    // Posting a message changes nothing a component reads, so this may run during render.
    if (view.busy) this.pump();
    return view;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  scene(input: LayoutInput): Promise<Scene> {
    if (this.fallback) return this.fallback.scene(input);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.scenes.set(id, { resolve, reject });
      this.post({ type: 'scene', id, input });
    });
  }

  private viewOf(input: LayoutInput, previous: Drawn | null): FigureView {
    const d = this.done.get(input);
    if (d) {
      this.done.delete(input);
      this.done.set(input, d);
      return { drawn: d, busy: false, error: null };
    }
    const error = this.failed.get(input);
    if (error !== undefined) return { drawn: previous, busy: false, error };
    return { drawn: previous, busy: true, error: null };
  }

  private post(req: RenderRequest): void {
    if (!this.worker) {
      const w = this.spawn();
      w.onmessage = (e) => {
        this.receive(e.data);
      };
      w.onerror = (e) => {
        console.error(e.message);
        this.giveUp();
      };
      this.worker = w;
    }
    this.worker.postMessage(req);
  }

  /** Starts the most recently asked render, if none is running. */
  private pump(): void {
    if (this.inFlight || this.fallback) return;
    const next = [...this.slots.values()].reverse().find((s) => s.view.busy);
    if (!next) return;
    const id = this.nextId++;
    this.inFlight = { id, input: next.want };
    this.post({ type: 'draw', id, input: next.want, dpr: this.dpr() });
  }

  private receive(reply: RenderReply): void {
    if (reply.type === 'scene') {
      const p = this.scenes.get(reply.id);
      this.scenes.delete(reply.id);
      if (reply.scene) p?.resolve(reply.scene);
      else p?.reject(new Error(DRAW_FAILED));
      return;
    }
    const f = this.inFlight;
    if (f?.id !== reply.id) return;
    this.inFlight = null;
    if (!reply.ok && reply.unsupported) {
      this.giveUp();
      return;
    }
    if (reply.ok) {
      this.done.set(f.input, {
        ...reply.parts,
        picture: { kind: 'png', url: URL.createObjectURL(reply.png) },
      });
    } else this.failed.set(f.input, DRAW_FAILED);
    for (const s of this.slots.values()) {
      if (s.want === f.input) s.view = this.viewOf(f.input, s.view.drawn);
    }
    this.evict();
    this.notify();
    this.pump();
  }

  /** Drops the oldest pictures beyond KEEP that nothing shows. */
  private evict(): void {
    const shown = new Set([...this.slots.values()].map((s) => s.view.drawn));
    let extra = this.done.size - KEEP;
    for (const [input, d] of this.done) {
      if (extra <= 0) break;
      if (shown.has(d)) continue;
      if (d.picture.kind === 'png') URL.revokeObjectURL(d.picture.url);
      this.done.delete(input);
      extra -= 1;
    }
  }

  /** Draws on the main thread from now on. */
  private giveUp(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = null;
    this.fallback = new MainThreadRenderer();
    for (const p of this.scenes.values()) p.reject(new Error(DRAW_FAILED));
    this.scenes.clear();
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

/** Whether this browser can paint in a worker. */
function workerCanvas(): boolean {
  try {
    return (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof OffscreenCanvas.prototype.convertToBlob === 'function' &&
      new OffscreenCanvas(1, 1).getContext('2d') !== null
    );
  } catch {
    return false;
  }
}

let renderer: GraphRenderer | null = null;

export function getRenderer(): GraphRenderer {
  renderer ??= workerCanvas()
    ? new WorkerRenderer(
        () =>
          new Worker(new URL('./render.worker.ts', import.meta.url), {
            type: 'module',
          }),
      )
    : new MainThreadRenderer();
  return renderer;
}

/** For tests. */
export function setRenderer(r: GraphRenderer | null): void {
  renderer = r;
}
