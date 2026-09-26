/**
 * Graphs drawn from the same input are drawn once (item 10). A graph with
 * thousands of points takes a noticeable moment to lay out and serialise,
 * and the page and the sidebar thumbnail draw it on every render. Inputs
 * are immutable, so each result is kept per input object.
 */
import { elementsOf, hitRegions } from './hit';
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
/** Hit regions at the size the graph section uses. */
export const regionsOf = perObject((scene: Scene) => hitRegions(scene, 5));
export const elementsIn = perObject((scene: Scene) => elementsOf(scene));
/**
 * The graph as an image URL, for thumbnails: drawn once as a picture
 * rather than kept as thousands of live shapes in the page.
 */
export const imageOf = perObject(
  (scene: Scene): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOf(scene))}`,
);
