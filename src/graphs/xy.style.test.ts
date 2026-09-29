import { describe, expect, it } from 'vitest';

import { hitRegions, pick } from './hit';
import { MODERN } from './theme';
import { layoutXy, type XyGraphInput, type XySeriesInput } from './xy';

const input: XyGraphInput = {
  plot: {
    kind: 'xy-scatter',
    style: 'traces',
    points: false,
    fit: false,
    band: 'none',
    error: 'none',
  },
  size: { width: 70, height: 60 },
  theme: MODERN,
  xTitle: 'X',
  yTitle: 'Y',
  series: [
    {
      id: 'a',
      title: 'A',
      color: '#1f77b4',
      points: [],
      connect: [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 2 },
      ],
      traces: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 4 },
          { x: 2, y: 2 },
        ],
        [
          { x: 0, y: 2 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
        ],
      ],
    },
  ],
};

const BASE_SERIES: XySeriesInput = input.series[0] ?? {
  id: 'a',
  title: 'A',
  color: '#000',
  points: [],
};

describe('XY connected-line and trace styles', () => {
  const scene = layoutXy(input);

  it('draws one trace path per replicate and one mean line', () => {
    expect(scene.marks.filter((m) => m.role === 'trace-line')).toHaveLength(2);
    expect(scene.marks.filter((m) => m.role === 'connect-line')).toHaveLength(1);
  });

  it('draws no points when they are switched off', () => {
    expect(scene.marks.some((m) => m.role === 'xy-point')).toBe(false);
  });

  it('makes the mean line pickable', () => {
    const regions = hitRegions(scene, 5);
    expect(regions.some((r) => r.element === 'connect-line:a')).toBe(true);
    const line = scene.marks.find((m) => m.role === 'connect-line');
    if (line?.kind !== 'path') throw new Error('shape');
    const [x, y] = /M([\d.]+) ([\d.]+)/.exec(line.d)?.slice(1).map(Number) ?? [];
    expect(pick(regions, x ?? 0, y ?? 0)).toBe('connect-line:a');
  });
});

describe('the traces style’s error band (item 42)', () => {
  const withBand = (error: 'sd' | 'ci95', fit = false): XyGraphInput => ({
    ...input,
    plot: { ...input.plot, error, fit },
    series: [
      {
        ...BASE_SERIES,
        errorBand: {
          segments: [
            [
              { x: 0, y0: 0, y1: 2 },
              { x: 1, y0: 2, y1: 4 },
            ],
          ],
          lone: [{ x: 2, y0: 1, y1: 3 }],
          skipped: 1,
        },
        ...(fit
          ? {
              band: [
                { x: 0, y0: 0, y1: 1 },
                { x: 2, y0: 1, y1: 2 },
              ],
            }
          : {}),
      },
    ],
  });

  it('draws a filled band and a bar for a lone X, under the traces', () => {
    const scene = layoutXy(withBand('sd'));
    const roles = scene.marks.map((m) => m.role);
    expect(roles.filter((r) => r === 'error-band')).toHaveLength(2);
    expect(roles.indexOf('error-band')).toBeLessThan(roles.indexOf('trace-line'));
  });

  it('states the error type and the skipped X values on the graph', () => {
    expect(layoutXy(withBand('sd')).notes.join(' ')).toMatch(/mean ± SD.*1 X value has no band/);
    expect(layoutXy(withBand('ci95')).notes.join(' ')).toMatch(/95% CI/);
  });

  it('draws nothing and says nothing when no error is chosen', () => {
    const scene = layoutXy({ ...withBand('sd'), plot: { ...input.plot, error: 'none' } });
    expect(scene.marks.some((m) => m.role === 'error-band')).toBe(false);
    expect(scene.notes.join(' ')).not.toMatch(/band/);
  });

  it('sits lighter and beneath a fit band, and the notes tell them apart', () => {
    const scene = layoutXy(withBand('sd', true));
    const err = scene.marks.find((m) => m.role === 'error-band');
    const fit = scene.marks.find((m) => m.role === 'band');
    expect(scene.marks.indexOf(err as never)).toBeLessThan(scene.marks.indexOf(fit as never));
    if (err?.kind !== 'path' || fit?.kind !== 'path') throw new Error('shape');
    expect(err.opacity ?? 1).toBeLessThan(fit.opacity ?? 0);
    expect(scene.notes.join(' ')).toMatch(/Lighter band.*darker band belongs to the fitted line/);
  });

  it('widens the axis to include the band', () => {
    const wide = withBand('sd');
    const s = BASE_SERIES;
    const tall = {
      ...wide,
      series: [
        { ...s, errorBand: { segments: [], lone: [{ x: 0, y0: -50, y1: 50 }], skipped: 0 } },
      ],
    };
    const line = (g: XyGraphInput) => layoutXy(g).marks.find((m) => m.role === 'connect-line');
    expect(line(tall)).not.toEqual(line(withBand('sd')));
  });
});
