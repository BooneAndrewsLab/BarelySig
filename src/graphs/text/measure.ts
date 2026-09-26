/**
 * Text measurement from Arimo's advance widths (note 05): no DOM, the
 * same answer in every browser, in tests and on reopen. Kerning is not
 * applied, and SVG text is drawn with kerning off to match.
 */
import metrics from './metrics.json';

export type Weight = 400 | 700;

const ADVANCES: Readonly<Record<Weight, Readonly<Record<string, number>>>> = {
  400: metrics['400'].advances,
  700: metrics['700'].advances,
};

/** Width of a character missing from the table: the width of "0" (digits are the common case). */
const FALLBACK: Readonly<Record<Weight, number>> = {
  400: ADVANCES[400][String('0'.codePointAt(0))] ?? 1139,
  700: ADVANCES[700][String('0'.codePointAt(0))] ?? 1139,
};

/** Width in points of `text` at `size` points. */
export function textWidth(text: string, size: number, weight: Weight = 400): number {
  let units = 0;
  for (const ch of text) units += ADVANCES[weight][String(ch.codePointAt(0))] ?? FALLBACK[weight];
  return (units / metrics.unitsPerEm) * size;
}

/** Ascent and descent in points, for placing baselines. */
export const ascent = (size: number): number => (metrics.ascender / metrics.unitsPerEm) * size;
export const descent = (size: number): number => (-metrics.descender / metrics.unitsPerEm) * size;

/** Line height used for wrapped labels. */
export const lineHeight = (size: number): number => size * 1.15;

/**
 * A word split into its breakable pieces: after each underscore (a common
 * lab naming convention, `plate_condition_day`), the underscore staying
 * with the piece before it. `first` marks the piece that starts the word,
 * where a line break needs a space before it; later pieces of the same
 * word never get one (they're mid-word).
 */
function pieces(word: string): { text: string; first: boolean }[] {
  return word.split(/(?<=_)/).map((text, i) => ({ text, first: i === 0 }));
}

/**
 * Wraps text at spaces or underscores to fit `width`, at most `maxLines`
 * lines; a piece longer than the width stays whole on its own line (never
 * cut).
 */
export function wrap(
  text: string,
  width: number,
  size: number,
  weight: Weight = 400,
  maxLines = 3,
): string[] {
  const ps = text.split(/\s+/).filter(Boolean).flatMap(pieces);
  if (ps.length === 0) return [];
  const lines: string[] = [];
  let line = '';
  for (const p of ps) {
    const next = line ? `${line}${p.first ? ' ' : ''}${p.text}` : p.text;
    if (line && textWidth(next, size, weight) > width) {
      lines.push(line);
      line = p.text;
    } else line = next;
  }
  lines.push(line);
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
}
