/**
 * Exporting a graph (note 05): SVG at its physical size, for editors;
 * PNG rasterised from the same SVG with the font embedded, at 300 or 600
 * DPI, with the resolution recorded. Metadata (origin, recipe) is passed
 * in by the caller (#43).
 */
import { pHYs, withChunks } from './png';
import type { Scene } from './scene';
import { sceneToSvg } from './svg';

/** Nature's figure widths in millimetres (note 05, decision 7). */
export const PRESETS: readonly (readonly [string, number])[] = [
  ['Single column (89 mm)', 89],
  ['1.5 columns (120 mm)', 120],
  ['Double column (183 mm)', 183],
];

export interface ExportMeta {
  /** Before the root element: the origin comment. */
  readonly prolog?: string;
  /** Inside the root: <title>, <desc>, <metadata>. */
  readonly head?: string;
  /** Extra PNG chunks (text, recipe). */
  readonly pngChunks?: readonly Uint8Array[];
}

export function exportSvg(scene: Scene, meta: ExportMeta = {}): string {
  return sceneToSvg(scene, {
    physical: true,
    ...(meta.prolog === undefined ? {} : { prolog: meta.prolog }),
    ...(meta.head === undefined ? {} : { head: meta.head }),
  });
}

/** Pixel size of a scene at a DPI (points are 1/72 inch). */
export const pixelSize = (scene: Scene, dpi: number) => ({
  width: Math.round((scene.width / 72) * dpi),
  height: Math.round((scene.height / 72) * dpi),
});

let fontFaces: Promise<string> | null = null;

async function dataUri(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:font/woff;base64,${btoa(bin)}`;
}

/** Arimo as @font-face rules with data URIs: an SVG drawn as an image can't use the page's fonts. */
export function embeddedFonts(base: string = import.meta.env.BASE_URL): Promise<string> {
  fontFaces ??= Promise.all([
    dataUri(`${base}fonts/arimo-400.woff`),
    dataUri(`${base}fonts/arimo-700.woff`),
  ]).then(
    ([regular, bold]) =>
      `@font-face{font-family:Arial;src:url(${regular}) format("woff");font-weight:400}` +
      `@font-face{font-family:Arial;src:url(${bold}) format("woff");font-weight:700}`,
  );
  return fontFaces;
}

export async function exportPng(
  scene: Scene,
  dpi: number,
  meta: ExportMeta = {},
): Promise<Uint8Array> {
  // Arimo registered under the name the SVG asks for first, so the image
  // uses Arimo even where Arial is installed: the same metrics, and the same
  // pixels on every machine.
  const svg = sceneToSvg(scene, { physical: true, fontFaces: await embeddedFonts() });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { width, height } = pixelSize(scene, dpi);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser can’t draw images for export.');
    // Journals expect an opaque figure.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!blob) throw new Error('The PNG couldn’t be made.');
    return withChunks(new Uint8Array(await blob.arrayBuffer()), [
      pHYs(dpi),
      ...(meta.pngChunks ?? []),
    ]);
  } finally {
    URL.revokeObjectURL(url);
  }
}
