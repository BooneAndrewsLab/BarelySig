/**
 * A scene as SVG text (note 05): the one serialisation used on screen and
 * in every export, so they can't differ. Deterministic (fixed number
 * format, fixed attribute order), plain SVG 1.1 that Illustrator and
 * Inkscape read: no filters, masks or CSS beyond an optional @font-face.
 */
import type { Mark, Scene } from './scene';

export interface SvgOptions {
  /** Physical size attributes (width="70mm"); off for on-screen use, where CSS sizes it. */
  readonly physical?: boolean;
  /** `@font-face` rules to embed (data URIs), for rasterising; exports for editors leave it out. */
  readonly fontFaces?: string;
  /** Written first, before the root element (e.g. the origin comment). */
  readonly prolog?: string;
  /** Inside the root, before the marks: <title>, <desc>, <metadata>. */
  readonly head?: string;
}

const num = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function stroke(line: { stroke: string; width: number } | undefined): string {
  return line ? ` stroke="${line.stroke}" stroke-width="${num(line.width)}"` : '';
}

const tag = (m: Mark): string =>
  ` data-role="${m.role}"${m.ref === undefined ? '' : ` data-ref="${escapeXml(m.ref)}"`}`;

function mark(m: Mark): string {
  switch (m.kind) {
    case 'rect':
      return `<rect${tag(m)} x="${num(m.x)}" y="${num(m.y)}" width="${num(m.w)}" height="${num(m.h)}" fill="${m.fill}"${stroke(m.line)}/>`;
    case 'line':
      return `<line${tag(m)} x1="${num(m.x1)}" y1="${num(m.y1)}" x2="${num(m.x2)}" y2="${num(m.y2)}"${stroke(m.line)} stroke-linecap="butt"/>`;
    case 'path':
      return `<path${tag(m)} d="${m.d}" fill="${m.fill ?? 'none'}"${stroke(m.line)} stroke-linejoin="miter"/>`;
    case 'circle':
      return `<circle${tag(m)} cx="${num(m.cx)}" cy="${num(m.cy)}" r="${num(m.r)}" fill="${m.fill}"${m.opacity < 1 ? ` fill-opacity="${num(m.opacity)}"` : ''}${stroke(m.line)}/>`;
    case 'text': {
      const rotate = m.rotate
        ? ` transform="rotate(${num(m.rotate)} ${num(m.x)} ${num(m.y)})"`
        : '';
      const weight = m.weight === 700 ? ' font-weight="bold"' : '';
      return `<text${tag(m)} x="${num(m.x)}" y="${num(m.y)}" font-size="${num(m.size)}"${weight} text-anchor="${m.anchor}" fill="${m.fill}"${rotate}>${escapeXml(m.text)}</text>`;
    }
  }
}

export function sceneToSvg(scene: Scene, opts: SvgOptions = {}): string {
  const size = opts.physical
    ? ` width="${num((scene.width * 25.4) / 72)}mm" height="${num((scene.height * 25.4) / 72)}mm"`
    : '';
  const style = opts.fontFaces ? `<style>${opts.fontFaces}</style>` : '';
  // Kerning off where a browser draws it (screen, PNG), to match the
  // measured layout; editors ignore the property, so exports leave it out.
  const kerning = opts.physical && !opts.fontFaces ? '' : ' style="font-kerning:none"';
  return [
    opts.prolog ?? '',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"${size} viewBox="0 0 ${num(scene.width)} ${num(scene.height)}" font-family="${escapeXml(scene.font)}"${kerning}>`,
    opts.head ?? '',
    style,
    ...scene.marks.map(mark),
    '</svg>',
  ].join('');
}
