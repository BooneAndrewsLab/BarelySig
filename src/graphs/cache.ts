/**
 * Graphs drawn from the same input are drawn once (item 10). A graph with
 * thousands of points takes a noticeable moment to lay out and serialise.
 * Inputs are immutable, so each result is kept per input object. Where
 * figures are drawn on the main thread (item 11), this is what draws them.
 */
import { type Drawn, drawnParts } from './drawn';
import { type LayoutInput, layoutColumn } from './layout';
import type { Scene } from './scene';
import { sceneToSvg } from './svg';

function perObject<K extends object, V>(f: (k: K) => V): (k: K) => V {
  const seen = new WeakMap<K, V>();
  return (k) => {
    if (seen.has(k)) return seen.get(k) as V;
    const v = f(k);
    seen.set(k, v);
    return v;
  };
}

export const sceneOf = perObject((input: LayoutInput): Scene => layoutColumn(input));
export const svgOf = perObject((scene: Scene): string => sceneToSvg(scene));
/** The figure drawn on the main thread: the inline SVG. */
export const drawnOf = perObject((input: LayoutInput): Drawn => {
  const scene = sceneOf(input);
  return { ...drawnParts(scene), picture: { kind: 'svg', svg: svgOf(scene) } };
});
/**
 * A drawn figure as an image URL, for thumbnails: a picture rather than
 * thousands of live shapes in the page.
 */
export const imageOf = perObject((d: Drawn): string =>
  d.picture.kind === 'png'
    ? d.picture.url
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.picture.svg)}`,
);
