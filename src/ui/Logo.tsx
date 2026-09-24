import { WORDMARK_ACCENT, WORDMARK_INK, WORDMARK_WIDTH } from './logoWordmark';

/**
 * The BarelySig lockup: the asterisked "b" mark standing in for the first
 * letter of the outlined "arelysig" wordmark (design/logo/README.md).
 *
 * Geometry follows the design's 64 px lockup: mark 84 px tall (1.32 × font
 * size), 2 px gap, the wordmark baseline at y = 0 and the bottom of the
 * mark's stem on it. Ink parts use currentColor so the logo follows the
 * surrounding text colour.
 */

const ACCENT = '#ec3013';
/** The mark's own viewBox is "4 4 57 60". */
const MARK_SCALE = 84 / 60;
/** Stem bottom (y = 58 in mark units) on the baseline. */
const MARK_Y = -(58 - 4) * MARK_SCALE;
const TEXT_X = 57 * MARK_SCALE + 2;
const VIEW_TOP = -76;
const VIEW_HEIGHT = 90;
const VIEW_WIDTH = TEXT_X + WORDMARK_WIDTH;

interface Props {
  /** Rendered height in CSS pixels. */
  readonly height?: number;
}

export function Logo({ height = 26 }: Props) {
  return (
    <svg
      className="logo"
      role="img"
      viewBox={`0 ${VIEW_TOP} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      height={height}
      width={(height * VIEW_WIDTH) / VIEW_HEIGHT}
    >
      <title>BarelySig</title>
      <g transform={`translate(0 ${MARK_Y}) scale(${MARK_SCALE}) translate(-4 -4)`} fill="none">
        <rect x="4" y="13" width="11" height="45" fill="currentColor" />
        <circle cx="32" cy="41" r="17" stroke="currentColor" strokeWidth="11" />
        <g transform="rotate(18 50 13.5)" stroke={ACCENT} strokeWidth="4.5" strokeLinecap="square">
          <line x1="50" y1="7.5" x2="50" y2="19.5" />
          <line x1="44.8" y1="10.5" x2="55.2" y2="16.5" />
          <line x1="55.2" y1="10.5" x2="44.8" y2="16.5" />
        </g>
      </g>
      <g transform={`translate(${TEXT_X} 0)`}>
        <path d={WORDMARK_INK} fill="currentColor" />
        <path d={WORDMARK_ACCENT} fill={ACCENT} />
      </g>
    </svg>
  );
}
