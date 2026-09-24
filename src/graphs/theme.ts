/**
 * Graph themes as data (note 05). Sizes are in points at the figure's
 * final size; colours are hex. A graph names a theme and may override
 * parts of it; a figure recipe stores the resolved theme, so an exported
 * figure never changes when a default does.
 */
import { COLORBLIND } from './palette';

export interface GraphTheme {
  readonly name: string;
  readonly font: {
    /** Written into exports; the first family is what editors look for. */
    readonly family: string;
    readonly tick: number;
    readonly axisTitle: number;
    readonly title: number;
    readonly bracket: number;
  };
  readonly lines: {
    readonly axis: number;
    readonly tick: number;
    readonly tickLength: number;
    readonly error: number;
    readonly barEdge: number;
    readonly bracket: number;
    readonly pointEdge: number;
  };
  readonly ink: string;
  readonly palette: readonly string[];
  readonly spines: 'left-bottom' | 'box';
  readonly ticks: 'out' | 'in';
  /** Bars: the group colour mixed with white by this much (0 = solid). */
  readonly barLighten: number;
  /** Bars' edge colour; null = the group's colour. */
  readonly barEdge: string | null;
  /** Points: fill opacity, and how much darker than the fill the edge is (0..1). */
  readonly pointOpacity: number;
  readonly pointDarken: number;
  /** Points' colour; null = the group's colour. */
  readonly pointColor: string | null;
  /** Point diameter in points. */
  readonly pointSize: number;
  /** Bar width as a fraction of its slot. */
  readonly barWidth: number;
}

export const FONT_FAMILY = 'Arial, Arimo, "Liberation Sans", Helvetica, sans-serif';

export const MODERN: GraphTheme = {
  name: 'modern',
  font: { family: FONT_FAMILY, tick: 7, axisTitle: 8, title: 8, bracket: 7 },
  lines: {
    axis: 0.75,
    tick: 0.75,
    tickLength: 3,
    error: 0.75,
    barEdge: 0.75,
    bracket: 0.75,
    pointEdge: 0.4,
  },
  ink: '#201e1d',
  palette: COLORBLIND,
  spines: 'left-bottom',
  ticks: 'out',
  barLighten: 0.55,
  barEdge: null,
  pointOpacity: 0.8,
  pointDarken: 0.3,
  pointColor: null,
  pointSize: 4,
  barWidth: 0.62,
};

/** Prism-like: boxed, inward ticks, solid bars with black edges, black points. */
export const CLASSIC: GraphTheme = {
  ...MODERN,
  name: 'classic',
  lines: { ...MODERN.lines, axis: 1, tick: 1, barEdge: 1 },
  ink: '#000000',
  spines: 'box',
  ticks: 'in',
  barLighten: 0,
  barEdge: '#000000',
  pointOpacity: 1,
  pointDarken: 0,
  pointColor: '#000000',
  barWidth: 0.7,
};

export const THEMES = { modern: MODERN, classic: CLASSIC } as const;
export type ThemeName = keyof typeof THEMES;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: readonly number[]) =>
  `#${c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** Mixes a colour with white (amount 0..1). */
export const lighten = (hex: string, amount: number): string =>
  toHex(rgb(hex).map((v) => v + (255 - v) * amount));

/** Mixes a colour with black (amount 0..1). */
export const darken = (hex: string, amount: number): string =>
  toHex(rgb(hex).map((v) => v * (1 - amount)));
