/**
 * A laid-out graph (note 05): every mark positioned in points, origin top
 * left, at the figure's final size. The screen and every export draw this
 * one description, so what is shown is what is exported.
 */

/** What a mark is, for click-to-format and tests: 'bar', 'point', 'error', 'axis', 'tick-label', … */
export interface Tagged {
  readonly role: string;
  /** The data set or bracket it belongs to, if any. */
  readonly ref?: string;
}

export interface Stroke {
  readonly stroke: string;
  readonly width: number;
  /** SVG dash pattern in points, e.g. "2 1.5"; unset = solid. */
  readonly dash?: string;
}

export type Mark =
  | (Tagged & {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: string;
      readonly line?: Stroke;
    })
  | (Tagged & {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly line: Stroke;
    })
  | (Tagged & {
      readonly kind: 'path';
      readonly d: string;
      readonly line: Stroke;
      readonly fill?: string;
      /** Fill opacity; unset = 1. */
      readonly opacity?: number;
    })
  | (Tagged & {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: string;
      readonly opacity: number;
      readonly line?: Stroke;
    })
  | (Tagged & {
      readonly kind: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly size: number;
      readonly weight: 400 | 700;
      readonly anchor: 'start' | 'middle' | 'end';
      readonly fill: string;
      /** Degrees, about (x, y); -90 for a y-axis title. */
      readonly rotate?: number;
    });

export interface Scene {
  /** Points. */
  readonly width: number;
  readonly height: number;
  readonly font: string;
  readonly marks: readonly Mark[];
  /** Things the user should know (e.g. a swarm squeezed to fit), for the notes under the graph. */
  readonly notes: readonly string[];
  /**
   * The group-label angle actually drawn with, when the graph's own
   * setting was left automatic (note 12); unset when the graph forced an
   * angle, or drew level with no escalation needed. Frozen into a figure
   * recipe so a later change to the overlap heuristic can't turn an old
   * export's labels.
   */
  readonly resolvedXAngle?: 45 | 90;
}

export const PT_PER_MM = 72 / 25.4;
