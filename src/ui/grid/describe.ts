/** The grid's selection in words, for the editor's label and the status line (item 03). */
import { cellKey } from '@/model/table';

import { type GridLayout, cellValue, spanOf } from './layout';
import type { Pos, Range } from './selection';

/** Where the user is, in words: "Group A, row 3", "Group A title", "row 2 title". */
export function describePos(layout: GridLayout, p: Pos): string {
  const span = spanOf(layout, p.col);
  const col = layout.columns[p.col];
  const name = span ? `${span.title}${col?.label ? ` ${col.label}` : ''}` : '';
  if (p.row === -1) return `${span?.title ?? ''} title`;
  if (p.col === -1) return `row ${String(p.row + 1)} title`;
  return `${name}, row ${String(p.row + 1)}`;
}

export function selectionSummary(layout: GridLayout, range: Range): string {
  let cells = 0;
  let values = 0;
  let excluded = 0;
  for (let r = Math.max(range.top, 0); r <= range.bottom; r += 1) {
    for (let c = Math.max(range.left, 0); c <= range.right; c += 1) {
      cells += 1;
      const v = cellValue(layout, r, c);
      if (v === null) continue;
      values += 1;
      const col = layout.columns[c];
      const row = layout.table.rows[r];
      const ds = col ? layout.table.dataSets[col.dataSetIndex] : undefined;
      if (col && row && ds?.excluded.has(cellKey(col.subcolumn, row.id))) excluded += 1;
    }
  }
  if (cells <= 1) return '';
  const ex = excluded ? `, ${String(excluded)} excluded` : '';
  return `${String(cells)} cells selected, ${String(values)} with values${ex}`;
}
