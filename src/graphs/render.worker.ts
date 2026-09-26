/**
 * Lays out and paints figures off the main thread (item 11): the page
 * gets a PNG, which browsers decode off the main thread too, with the hit
 * regions and outlines as transferred typed arrays.
 */
import { drawnParts, transferables } from './drawn';
import { layoutColumn } from './layout';
import { PAINT_FONT, paintScene, screenScale } from './paint';
import type { RenderReply, RenderRequest } from './renderer';

const scope = self as unknown as {
  fonts?: FontFaceSet;
  postMessage(message: RenderReply, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
};

let fonts: Promise<boolean> | null = null;

/** Arimo, the layout's metrics, registered in the worker; false where workers have no fonts. */
function loadFonts(): Promise<boolean> {
  fonts ??= (async () => {
    const set = scope.fonts;
    if (!set) return false;
    const faces = (
      [
        ['400', 'arimo-400.woff'],
        ['700', 'arimo-700.woff'],
      ] as const
    ).map(
      ([weight, file]) =>
        new FontFace(PAINT_FONT, `url(${import.meta.env.BASE_URL}fonts/${file})`, { weight }),
    );
    for (const f of faces) set.add(f);
    await Promise.all(faces.map((f) => f.load()));
    return true;
  })().catch(() => false);
  return fonts;
}

async function handle(req: RenderRequest): Promise<void> {
  if (req.type === 'scene') {
    scope.postMessage({ type: 'scene', id: req.id, scene: layoutColumn(req.input) });
    return;
  }
  const unsupported: RenderReply = { type: 'drawn', id: req.id, ok: false, unsupported: true };
  if (!(await loadFonts())) {
    scope.postMessage(unsupported);
    return;
  }
  const scene = layoutColumn(req.input);
  const parts = drawnParts(scene);
  const scale = screenScale(scene, req.dpr);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(scene.width * scale)),
    Math.max(1, Math.round(scene.height * scale)),
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    scope.postMessage(unsupported);
    return;
  }
  paintScene(ctx, scene, canvas.width / scene.width);
  const png = await canvas.convertToBlob({ type: 'image/png' });
  scope.postMessage({ type: 'drawn', id: req.id, ok: true, parts, png }, transferables(parts));
}

scope.onmessage = (e) => {
  const req = e.data;
  handle(req).catch((err: unknown) => {
    console.error(err);
    scope.postMessage(
      req.type === 'scene'
        ? { type: 'scene', id: req.id, scene: null }
        : { type: 'drawn', id: req.id, ok: false, unsupported: false },
    );
  });
};
