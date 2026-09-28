import { describe, expect, it } from 'vitest';

import { hitRegions, pick } from './hit';
import { MODERN } from './theme';
import { layoutXy, type XyGraphInput } from './xy';

// Anscombe-quartet-shaped data (item 31 follow-up): points scattered right
// along the fitted line, so its whole-path bounding box used to overlap
// every point's hit box and the line could never win the pick.
const input: XyGraphInput = {
  plot: { kind: 'xy-scatter', points: true, fit: true, band: 'none' },
  size: { width: 70, height: 60 },
  theme: MODERN,
  xTitle: 'X',
  yTitle: 'Y',
  series: [
    {
      id: 'a',
      title: 'A',
      color: '#1f77b4',
      points: [
        { x: 4, y: 4.26 },
        { x: 5, y: 5.68 },
        { x: 6, y: 7.24 },
        { x: 7, y: 4.82 },
        { x: 8, y: 6.95 },
        { x: 9, y: 8.81 },
        { x: 10, y: 8.04 },
        { x: 11, y: 8.33 },
        { x: 12, y: 10.84 },
        { x: 13, y: 7.58 },
        { x: 14, y: 9.96 },
      ],
      fit: [
        { x: 4, y: 4.6 },
        { x: 14, y: 9.6 },
      ],
    },
  ],
};

describe('picking the fitted line on an XY scatter graph', () => {
  const scene = layoutXy(input);
  const regions = hitRegions(scene, 5);
  const fitRegions = regions.filter((r) => r.element === 'fit-line:a');
  const plotWidth = scene.width;

  it('breaks the line into several small hit regions instead of one spanning most of the plot', () => {
    // A single region for the whole diagonal would be nearly as wide as
    // the plot itself and would always lose an area tie-break against a
    // data point sitting on it, making the line effectively unclickable.
    expect(fitRegions.length).toBeGreaterThan(5);
    for (const r of fitRegions) expect(r.x1 - r.x0).toBeLessThan(plotWidth / 4);
  });

  it('picks the fit line at a point along it that no data point sits on', () => {
    // Midway along the fitted line's own drawn segment, away from any point.
    const line = scene.marks.find((m) => m.role === 'fit-line');
    if (line?.kind !== 'path') throw new Error('shape');
    const match = /M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/.exec(line.d);
    const [, mx = '0', my = '0', lx = '0', ly = '0'] = match ?? [];
    const [x0, y0, x1, y1] = [mx, my, lx, ly].map(Number);
    const points = scene.marks.filter((m) => m.role === 'xy-point');
    // Pick a spot on the line at least 3pt from every point's centre.
    const spot = Array.from({ length: 200 }, (_, i) => i / 199)
      .map(
        (t) =>
          [
            (x0 ?? 0) + ((x1 ?? 0) - (x0 ?? 0)) * t,
            (y0 ?? 0) + ((y1 ?? 0) - (y0 ?? 0)) * t,
          ] as const,
      )
      .find(([x, y]) =>
        points.every((p) => p.kind === 'circle' && Math.hypot(p.cx - x, p.cy - y) > 3),
      );
    if (!spot) throw new Error('no clear spot on the line');
    expect(pick(regions, ...spot)).toBe('fit-line:a');
  });

  it('still prefers a data point over the line when they overlap', () => {
    const point = scene.marks.find((m) => m.role === 'xy-point');
    if (point?.kind !== 'circle') throw new Error('shape');
    expect(pick(regions, point.cx, point.cy)).toBe('series:a');
  });
});
