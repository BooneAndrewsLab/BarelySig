/**
 * The default categorical palette: seaborn's `colorblind` (CLAUDE.md,
 * Graphs). A data set without a colour of its own takes the one at its
 * position, in the grid's header and in every graph of it. The graph
 * theme note (#19) owns this list; the grid only reads it.
 */
export const COLORBLIND: readonly string[] = [
  '#0173b2',
  '#de8f05',
  '#029e73',
  '#d55e00',
  '#cc78bc',
  '#ca9161',
  '#fbafe4',
  '#949494',
  '#ece133',
  '#56b4e9',
];

export const paletteColor = (index: number): string =>
  COLORBLIND[index % COLORBLIND.length] ?? '#949494';
