/** A data cell value. Empty cells are `null`, never 0 or NaN. */
export type Cell = number | null;

export const isPresent = (c: Cell): c is number => c !== null;

/** Values of a column with missing cells dropped. */
export const presentValues = (cells: readonly Cell[]): number[] => cells.filter(isPresent);
