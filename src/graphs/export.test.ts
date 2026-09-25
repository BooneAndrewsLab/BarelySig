import { describe, expect, it } from 'vitest';

import { exportSvg, pixelSize } from './export';
import { layoutColumn } from './layout';
import { MODERN } from './theme';

const scene = layoutColumn({
  plot: { kind: 'bars', error: 'sd', points: true },
  size: { width: 89, height: 60 },
  theme: MODERN,
  yTitle: 'Viability (%)',
  groups: [{ id: 'a', title: 'WT & <KO>', color: '#0173b2', values: [1, 2], summary: null }],
  brackets: [],
});

describe('SVG export', () => {
  it('has its physical size in millimetres and a viewBox in points', () => {
    const svg = exportSvg(scene);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" version="1.1" width="89mm" height="60mm" viewBox="0 0 252.28 170.08"/,
    );
  });

  it('names Arial first, keeps text as text, escapes it, and has no filters or masks', () => {
    const svg = exportSvg(scene, { prolog: '<!-- origin -->', head: '<title>T</title>' });
    expect(svg.startsWith('<!-- origin --><svg')).toBe(true);
    expect(svg).toContain(
      'font-family="Arial, Arimo, &quot;Liberation Sans&quot;, Helvetica, sans-serif"',
    );
    expect(svg).toContain('>WT &amp; &lt;KO&gt;</text>');
    expect(svg).not.toMatch(/<filter|<mask|@font-face|font-kerning/);
    expect(svg).toContain('<title>T</title>');
  });

  it('is the same text every time', () => {
    expect(exportSvg(scene)).toBe(exportSvg(scene));
  });

  it('works out the PNG size from the DPI', () => {
    expect(pixelSize(scene, 300)).toEqual({ width: 1051, height: 709 });
    expect(pixelSize(scene, 600)).toEqual({ width: 2102, height: 1417 });
  });
});
