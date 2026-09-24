/**
 * Selection and keyboard navigation in the grid (item 03), as Excel:
 * pure functions of the grid layout, so they are tested without a DOM.
 */
import { type GridLayout, firstColumn, isFilled, lastFilled, spanOf } from './layout';

export interface Pos {
  readonly row: number;
  readonly col: number;
}

/** The active cell (`focus`) and the corner a Shift-extension started from (`anchor`). */
export interface Selection {
  readonly anchor: Pos;
  readonly focus: Pos;
}

export interface Range {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export interface Bounds {
  readonly minRow: number;
  readonly maxRow: number;
  readonly minCol: number;
  readonly maxCol: number;
}

export const at = (row: number, col: number): Selection => ({
  anchor: { row, col },
  focus: { row, col },
});

export function boundsOf(layout: GridLayout): Bounds {
  return {
    minRow: -1,
    maxRow: layout.rowCount - 1,
    minCol: firstColumn(layout),
    maxCol: layout.columns.length - 1,
  };
}

export function rangeOf(sel: Selection): Range {
  return {
    top: Math.min(sel.anchor.row, sel.focus.row),
    left: Math.min(sel.anchor.col, sel.focus.col),
    bottom: Math.max(sel.anchor.row, sel.focus.row),
    right: Math.max(sel.anchor.col, sel.focus.col),
  };
}

export const inRange = (r: Range, row: number, col: number): boolean =>
  row >= r.top && row <= r.bottom && col >= r.left && col <= r.right;

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Row -1 only exists above data columns; the corner (-1, -1) is not a cell. */
export function clampPos(p: Pos, b: Bounds): Pos {
  const row = clampTo(p.row, b.minRow, b.maxRow);
  let col = clampTo(p.col, b.minCol, b.maxCol);
  if (row === -1 && col === -1) col = 0;
  return { row, col };
}

export function clampSelection(sel: Selection, b: Bounds): Selection {
  return { anchor: clampPos(sel.anchor, b), focus: clampPos(sel.focus, b) };
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const DELTA: Readonly<Record<Direction, Pos>> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

/**
 * Ctrl+arrow, Excel's rule: from a filled cell whose neighbour is filled,
 * go to the last filled cell before a blank; otherwise to the next filled
 * cell; with none, to the edge of the data (or of the grid).
 */
export function jump(layout: GridLayout, from: Pos, dir: Direction, b: Bounds): Pos {
  const d = DELTA[dir];
  const inside = (p: Pos) =>
    p.row >= b.minRow && p.row <= b.maxRow && p.col >= b.minCol && p.col <= b.maxCol;
  const filled = (p: Pos) => isFilled(layout, p.row, p.col);
  const next = (p: Pos): Pos => ({ row: p.row + d.row, col: p.col + d.col });
  let p = next(from);
  if (!inside(p)) return from;
  if (filled(from) && filled(p)) {
    while (inside(next(p)) && filled(next(p))) p = next(p);
    return p;
  }
  while (inside(p) && !filled(p)) {
    const n = next(p);
    if (!inside(n)) break;
    p = n;
  }
  if (!filled(p)) {
    // Nothing further: stop at the edge of the data rather than the far end of the spare area.
    const last = lastFilled(layout);
    if (dir === 'down')
      return { row: Math.max(from.row, Math.min(p.row, Math.max(last.row, 0))), col: from.col };
    if (dir === 'right')
      return { row: from.row, col: Math.max(from.col, Math.min(p.col, Math.max(last.col, 0))) };
  }
  return p;
}

export type NavCommand =
  | {
      readonly type: 'move';
      readonly dir: Direction;
      readonly extend: boolean;
      readonly jump: boolean;
    }
  | { readonly type: 'home'; readonly ctrl: boolean; readonly extend: boolean }
  | { readonly type: 'end'; readonly ctrl: boolean; readonly extend: boolean }
  | { readonly type: 'page'; readonly dir: 'up' | 'down'; readonly extend: boolean }
  | { readonly type: 'tab'; readonly back: boolean }
  | { readonly type: 'enter'; readonly back: boolean }
  | { readonly type: 'selectAll' };

export interface NavState {
  readonly sel: Selection;
  /** Column a run of Tabs started in, so Enter returns there (Excel). */
  readonly tabStart: number | null;
}

function go(state: NavState, focus: Pos, extend: boolean, b: Bounds): NavState {
  const f = clampPos(focus, b);
  return {
    sel: extend ? { anchor: state.sel.anchor, focus: f } : { anchor: f, focus: f },
    tabStart: null,
  };
}

export function navigate(
  state: NavState,
  cmd: NavCommand,
  layout: GridLayout,
  pageRows: number,
): NavState {
  const b = boundsOf(layout);
  const f = state.sel.focus;
  switch (cmd.type) {
    case 'move': {
      const d = DELTA[cmd.dir];
      let to = cmd.jump ? jump(layout, f, cmd.dir, b) : { row: f.row + d.row, col: f.col + d.col };
      // In the title row a data set is one cell, however many subcolumns it spans.
      if (f.row === -1 && to.row === -1 && d.col !== 0 && !cmd.jump) {
        const span = spanOf(layout, f.col);
        if (span) to = { row: -1, col: d.col > 0 ? span.start + span.count : span.start - 1 };
        const target = spanOf(layout, to.col);
        if (target) to = { row: -1, col: target.start };
      }
      return go(state, to, cmd.extend, b);
    }
    case 'home': {
      const to = cmd.ctrl ? { row: 0, col: 0 } : { row: f.row, col: f.row === -1 ? 0 : b.minCol };
      return go(state, to, cmd.extend, b);
    }
    case 'end': {
      const last = lastFilled(layout);
      const to = cmd.ctrl
        ? { row: Math.max(last.row, 0), col: Math.max(last.col, 0) }
        : { row: f.row, col: Math.max(last.col, 0) };
      return go(state, to, cmd.extend, b);
    }
    case 'page':
      return go(
        state,
        { row: f.row + (cmd.dir === 'down' ? pageRows : -pageRows), col: f.col },
        cmd.extend,
        b,
      );
    case 'tab': {
      const next = go(state, { row: f.row, col: f.col + (cmd.back ? -1 : 1) }, false, b);
      return { ...next, tabStart: state.tabStart ?? f.col };
    }
    case 'enter': {
      const col = state.tabStart ?? f.col;
      return go(state, { row: f.row + (cmd.back ? -1 : 1), col }, false, b);
    }
    case 'selectAll': {
      const last = lastFilled(layout);
      const bottom = Math.max(last.row, layout.modelRows - 1, 0);
      const right = Math.max(last.col, 0);
      // The active cell stays top-left, as in Excel.
      return {
        sel: { anchor: { row: bottom, col: right }, focus: { row: 0, col: 0 } },
        tabStart: null,
      };
    }
  }
}
