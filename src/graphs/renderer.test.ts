import { afterEach, describe, expect, it, vi } from 'vitest';

import { drawnParts } from './drawn';
import { type LayoutInput, layoutColumn } from './layout';
import { COLORBLIND } from './palette';
import {
  DRAW_FAILED,
  type RenderReply,
  type RenderRequest,
  WorkerRenderer,
  type WorkerLike,
} from './renderer';
import { MODERN } from './theme';

const input = (title: string): LayoutInput => ({
  plot: { kind: 'bars', error: 'sd', points: true },
  size: { width: 70, height: 60 },
  theme: MODERN,
  yTitle: title,
  groups: [
    {
      id: 'A',
      title: 'A',
      color: COLORBLIND[0] ?? '#000',
      values: [1, 2, 3],
      summary: null,
    },
  ],
  brackets: [],
});

/** A worker that answers only when told to. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<RenderReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  sent: RenderRequest[] = [];
  terminated = false;
  postMessage(req: RenderRequest): void {
    this.sent.push(req);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(r: RenderReply): void {
    this.onmessage?.({ data: r } as MessageEvent<RenderReply>);
  }
  /** Answers the last draw request with a picture of its input. */
  draw(): LayoutInput {
    const req = this.sent.at(-1);
    if (req?.type !== 'draw') throw new Error('no draw request');
    this.reply({
      type: 'drawn',
      id: req.id,
      ok: true,
      parts: drawnParts(layoutColumn(req.input)),
      png: new Blob(['png'], { type: 'image/png' }),
    });
    return req.input;
  }
  draws(): RenderRequest[] {
    return this.sent.filter((r) => r.type === 'draw');
  }
}

function setup() {
  const worker = new FakeWorker();
  const r = new WorkerRenderer(
    () => worker,
    () => 2,
  );
  const changes = vi.fn();
  r.subscribe(changes);
  return { worker, r, changes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('drawing in a worker (item 11)', () => {
  it('asks for a picture, shows it when it comes, and keeps the view stable in between', () => {
    const { worker, r, changes } = setup();
    const a = input('a');
    const first = r.view('g1', a);
    expect(first).toEqual({ drawn: null, busy: true, error: null });
    expect(r.view('g1', a)).toBe(first);
    expect(worker.draws()).toMatchObject([{ type: 'draw', input: a, dpr: 2 }]);
    worker.draw();
    expect(changes).toHaveBeenCalledTimes(1);
    const done = r.view('g1', a);
    expect(done.busy).toBe(false);
    expect(done.drawn?.picture.kind).toBe('png');
    expect(done.drawn?.width).toBe(layoutColumn(a).width);
    expect(r.view('g1', a)).toBe(done);
  });

  it('keeps the old picture while a newer one is drawn', () => {
    const { worker, r } = setup();
    const a = input('a');
    const b = input('b');
    r.view('g1', a);
    worker.draw();
    const old = r.view('g1', a).drawn;
    const next = r.view('g1', b);
    expect(next.busy).toBe(true);
    expect(next.drawn).toBe(old);
  });

  it('draws only the latest request of a figure: one at a time, the superseded ones dropped', () => {
    const { worker, r } = setup();
    const [a, b, c] = [input('a'), input('b'), input('c')];
    r.view('g1', a);
    r.view('g1', b);
    r.view('g1', c);
    expect(worker.draws()).toHaveLength(1);
    expect(worker.draw()).toBe(a);
    expect(worker.draws().map((x) => x.input)).toEqual([a, c]);
    worker.draw();
    expect(r.view('g1', c)).toMatchObject({ busy: false });
    expect(worker.draws()).toHaveLength(2);
    // Asked again, the dropped one is drawn then.
    r.view('g1', b);
    expect(worker.draws().at(-1)?.input).toBe(b);
  });

  it('draws a figure shown twice (page and thumbnail) once, and reuses finished pictures', () => {
    const { worker, r } = setup();
    const a = input('a');
    r.view('g1', a);
    r.view('thumb:g1', a);
    worker.draw();
    expect(worker.draws()).toHaveLength(1);
    expect(r.view('thumb:g1', a).drawn).toBe(r.view('g1', a).drawn);
    r.view('g1', input('b'));
    worker.draw();
    r.view('g1', a);
    expect(worker.draws()).toHaveLength(2);
    expect(r.view('g1', a).busy).toBe(false);
  });

  it('says so when a picture fails, keeping the last one', () => {
    const { worker, r } = setup();
    const [a, b] = [input('a'), input('b')];
    r.view('g1', a);
    worker.draw();
    const old = r.view('g1', a).drawn;
    r.view('g1', b);
    const req = worker.draws().at(-1);
    worker.reply({ type: 'drawn', id: req?.id ?? 0, ok: false, unsupported: false });
    expect(r.view('g1', b)).toEqual({ drawn: old, busy: false, error: DRAW_FAILED });
  });

  it('draws on the main thread from then on where the worker can’t draw', () => {
    const { worker, r, changes } = setup();
    const a = input('a');
    r.view('g1', a);
    worker.reply({ type: 'drawn', id: worker.draws()[0]?.id ?? 0, ok: false, unsupported: true });
    expect(worker.terminated).toBe(true);
    expect(changes).toHaveBeenCalled();
    const v = r.view('g1', a);
    expect(v.busy).toBe(false);
    expect(v.drawn?.picture.kind).toBe('svg');
  });

  it('draws on the main thread when the worker fails to start', () => {
    const { worker, r } = setup();
    const a = input('a');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    r.view('g1', a);
    worker.onerror?.({ message: 'failed to load' } as ErrorEvent);
    expect(r.view('g1', a).drawn?.picture.kind).toBe('svg');
  });

  it('gets the scene for an export from the worker', async () => {
    const { worker, r } = setup();
    const a = input('a');
    const scene = r.scene(a);
    const req = worker.sent.at(-1);
    expect(req).toMatchObject({ type: 'scene', input: a });
    worker.reply({ type: 'scene', id: req?.id ?? 0, scene: layoutColumn(a) });
    expect((await scene).width).toBe(layoutColumn(a).width);
    const failed = r.scene(a);
    worker.reply({ type: 'scene', id: worker.sent.at(-1)?.id ?? 0, scene: null });
    await expect(failed).rejects.toThrow(DRAW_FAILED);
  });

  it('lets go of old pictures, never of one on show', () => {
    const { worker, r } = setup();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const shown = input('shown');
    r.view('page', shown);
    worker.draw();
    const url = r.view('page', shown).drawn;
    for (let i = 0; i < 40; i += 1) {
      r.view('other', input(String(i)));
      worker.draw();
    }
    expect(revoke).toHaveBeenCalled();
    const revoked = revoke.mock.calls.map((c) => c[0]);
    expect(url?.picture.kind === 'png' && revoked.includes(url.picture.url)).toBe(false);
    expect(r.view('page', shown).drawn).toBe(url);
  });
});
