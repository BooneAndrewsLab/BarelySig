/**
 * The data grid (item 03): a virtualised view over the pure grid logic in
 * this folder. Four layers share one scroll position: the corner, the
 * column headers (titles and subcolumn labels), the row headers (numbers,
 * and row titles in a Grouped table) and the body. Only visible cells are
 * rendered; indices in ARIA attributes are the true ones.
 *
 * Focus stays on the grid element, which points at the active cell with
 * `aria-activedescendant`; the cell editor is a real input while open.
 */
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { paletteColor } from '@/graphs/palette';
import type { Edit } from '@/model/edits';
import { type Table, cellKey, isXyX } from '@/model/table';

import { copyText, describePaste, pasteInto } from './clipboard';
import {
  clearRange,
  deleteDataSets,
  deleteRows,
  fillDown,
  insertDataSet,
  insertRows,
  toggleExcluded,
  typeInto,
} from './commands';
import { analytics } from '../analytics';
import { describePos, selectionSummary } from './describe';
import { GridMenu, type MenuItem } from './GridMenu';
import { type GridAction, editorExit, gridAction } from './keys';
import { cellValue, makeLayout, spanOf } from './layout';
import { type DecimalSeparator, browserDecimalSeparator, editText, formatCell } from './numbers';
import {
  type NavCommand,
  type NavState,
  type Pos,
  at,
  boundsOf,
  clampSelection,
  inRange,
  navigate,
  rangeOf,
} from './selection';

export const ROW_H = 24;
export const COL_W = 96;
const NUM_W = 48;
const TITLE_W = 140;
const HEAD_H = 30;
const SUB_H = 22;
const OVERSCAN = 4;
/** Used until the grid has been measured (and in tests, where nothing has a size). */
const FALLBACK = { width: 960, height: 600 };

export interface GridProps {
  readonly table: Table;
  /** Applies an edit; false when the model refused it. */
  readonly onEdit: (edit: Edit) => boolean;
  /** A message for the status line. */
  readonly onNotice: (text: string, tone: 'info' | 'warning' | 'error') => void;
  /** What the selection holds, for the status line. */
  readonly onSelection?: (summary: string) => void;
  readonly decimal?: DecimalSeparator;
}

interface Editing {
  readonly pos: Pos;
  readonly text: string;
  /** Started by typing: arrow keys commit and move, as Excel's "enter mode". */
  readonly typed: boolean;
  readonly invalid: boolean;
}

interface MenuState {
  readonly x: number;
  readonly y: number;
}

const cellId = (grid: string, p: Pos) => `${grid}-c${String(p.row)}_${String(p.col)}`;

export function DataGrid({ table, onEdit, onNotice, onSelection, decimal }: GridProps) {
  const dec = useMemo(() => decimal ?? browserDecimalSeparator(), [decimal]);
  const gridRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [view, setView] = useState(FALLBACK);
  const [nav, setNav] = useState<NavState>({ sel: at(0, 0), tabStart: null });
  const [editing, setEditingState] = useState<Editing | null>(null);
  // The open edit, read by the editor's blur handler: committing or
  // cancelling moves focus back to the grid, which blurs the editor, and
  // that blur must not commit the same edit again.
  const openEdit = useRef<Editing | null>(null);
  const setEditing = (e: Editing | null) => {
    openEdit.current = e;
    setEditingState(e);
  };
  const [menu, setMenu] = useState<MenuState | null>(null);
  const dragging = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu)
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [menu]);
  const gridId = `grid-${table.id}`;

  const perSet = Math.max(1, table.dataSets[0]?.subcolumns.length ?? 1);
  const layout = useMemo(
    () =>
      makeLayout(table, {
        minRows: Math.max(Math.ceil((scroll.y + view.height) / ROW_H), nav.sel.focus.row + 1),
        minDataSets: Math.ceil((scroll.x + view.width) / COL_W / perSet) + 1,
      }),
    [table, scroll.x, scroll.y, view.width, view.height, nav.sel.focus.row, perSet],
  );
  const bounds = boundsOf(layout);
  const sel = clampSelection(nav.sel, bounds);
  const range = rangeOf(sel);
  const focus = sel.focus;
  const rowHeadW = NUM_W + (layout.rowTitles ? TITLE_W : 0);
  const headH = HEAD_H + (layout.subHeaders ? SUB_H : 0);
  const headerRows = layout.subHeaders ? 2 : 1;

  // Measure the body; jsdom has no ResizeObserver, so tests keep the fallback size.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0)
        setView({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    onSelection?.(selectionSummary(layout, range));
  }, [layout, range.top, range.left, range.bottom, range.right, onSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Keeps the active cell in view. */
  const reveal = useCallback(
    (p: Pos) => {
      const el = bodyRef.current;
      if (!el) return;
      const w = el.clientWidth || view.width;
      const h = el.clientHeight || view.height;
      if (p.row >= 0) {
        const y = p.row * ROW_H;
        if (y < el.scrollTop) el.scrollTop = y;
        else if (y + ROW_H > el.scrollTop + h) el.scrollTop = y + ROW_H - h;
      }
      if (p.col >= 0) {
        const x = p.col * COL_W;
        if (x < el.scrollLeft) el.scrollLeft = x;
        else if (x + COL_W > el.scrollLeft + w) el.scrollLeft = x + COL_W - w;
      }
    },
    [view.width, view.height],
  );

  const focusGrid = () => {
    gridRef.current?.focus({ preventScroll: true });
  };

  const moveTo = (next: NavState) => {
    setNav(next);
    reveal(next.sel.focus);
  };

  const runNav = (cmd: NavCommand) => {
    moveTo(
      navigate(
        { sel, tabStart: nav.tabStart },
        cmd,
        layout,
        Math.max(1, Math.floor(view.height / ROW_H) - 1),
      ),
    );
  };

  const apply = (edit: Edit | null) => {
    if (edit) onEdit(edit);
  };

  const startEdit = (text: string | null) => {
    const p = focus;
    let initial = text ?? '';
    if (text === null) {
      if (p.row === -1)
        initial =
          spanOf(layout, p.col)?.spare === false ? (spanOf(layout, p.col)?.title ?? '') : '';
      else if (p.col === -1) initial = table.rows[p.row]?.title ?? '';
      else {
        const v = cellValue(layout, p.row, p.col);
        initial = v === null ? '' : editText(v, dec);
      }
    }
    setEditing({ pos: p, text: initial, typed: text !== null, invalid: false });
  };

  /** Commits the editor; returns false (and keeps it open) when the text isn't a number. */
  const commit = (e: Editing): boolean => {
    const result = typeInto(layout, e.pos, e.text, dec);
    if (!result.ok) {
      setEditing({ ...e, invalid: true });
      onNotice(result.message, 'error');
      return false;
    }
    if (result.edit && !onEdit(result.edit)) return false;
    setEditing(null);
    return true;
  };

  const act = (a: GridAction) => {
    switch (a.type) {
      case 'nav':
        runNav(a.cmd);
        return;
      case 'type':
        startEdit(a.text);
        return;
      case 'edit':
        startEdit(null);
        return;
      case 'clear':
        apply(clearRange(layout, range));
        return;
      case 'fillDown':
        apply(fillDown(layout, range));
        analytics.trackOnce('data', 'fill-down');
        return;
      case 'exclude': {
        const edit = toggleExcluded(layout, range);
        if (edit) {
          apply(edit);
          analytics.trackOnce('data', 'exclude');
        } else onNotice('Select values to exclude; empty cells have nothing to exclude.', 'info');
        return;
      }
      case 'insertRows':
        if (!layout.growsRows) onNotice('A table of summary data has one row per group.', 'info');
        else apply(insertRows(layout, range));
        return;
      case 'deleteRows':
        apply(deleteRows(layout, range));
        return;
    }
  };

  // Clipboard events go to the document when the focused element isn't
  // editable (the grid), so the grid listens there while it has focus.
  const clipboardHandler = useRef<(e: ClipboardEvent) => void>(() => undefined);
  const onClipboard = (e: ClipboardEvent) => {
    if (editing || document.activeElement !== gridRef.current || !e.clipboardData) return;
    const data = e.clipboardData;
    e.preventDefault();
    if (e.type === 'copy' || e.type === 'cut') {
      data.setData('text/plain', copyText(layout, range));
      if (e.type === 'cut') apply(clearRange(layout, range));
      return;
    }
    const clip: Record<string, string> = {};
    for (const type of data.types) clip[type] = data.getData(type);
    const result = pasteInto(table, focus, clip, dec, range);
    if (!result.edit) {
      onNotice('The clipboard holds nothing to paste here.', 'info');
      return;
    }
    if (!onEdit(result.edit)) return;
    const said = describePaste(result.notes);
    onNotice(said.text, said.warning ? 'warning' : 'info');
    analytics.trackOnce('data', 'paste');
    const r = result.range;
    if (r)
      setNav({
        sel: { anchor: { row: r.bottom, col: r.right }, focus: { row: r.top, col: r.left } },
        tabStart: null,
      });
  };
  useEffect(() => {
    clipboardHandler.current = onClipboard;
  });
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      clipboardHandler.current(e);
    };
    for (const type of ['copy', 'cut', 'paste'] as const) document.addEventListener(type, handler);
    return () => {
      for (const type of ['copy', 'cut', 'paste'] as const)
        document.removeEventListener(type, handler);
    };
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing || e.target !== e.currentTarget) return;
    const a = gridAction(e);
    if (!a) return;
    e.preventDefault();
    act(a);
  };

  const onEditorKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!editing) return;
    const exit = editorExit(e, editing.typed);
    if (!exit) return;
    e.preventDefault();
    e.stopPropagation();
    if (exit === 'cancel') {
      setEditing(null);
      focusGrid();
      return;
    }
    if (commit(editing)) {
      runNav(exit);
      focusGrid();
    }
  };

  const posFrom = (target: EventTarget | null): Pos | null => {
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-row]') : null;
    if (!el) return null;
    return { row: Number(el.dataset['row']), col: Number(el.dataset['col']) };
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const p = posFrom(e.target);
    if (!p) return;
    if (editing) {
      if (editing.pos.row === p.row && editing.pos.col === p.col) return;
      if (!commit(editing)) return;
    }
    e.preventDefault();
    focusGrid();
    setMenu(null);
    const row = (e.target as Element).closest('[data-whole-row]');
    if (row) {
      const last = Math.max(layout.columns.length - 1, 0);
      setNav({
        sel: { anchor: { row: p.row, col: last }, focus: { row: p.row, col: bounds.minCol } },
        tabStart: null,
      });
      return;
    }
    setNav({
      sel: e.shiftKey ? { anchor: sel.anchor, focus: p } : at(p.row, p.col),
      tabStart: null,
    });
    dragging.current = true;
  };

  const onMouseOver = (e: ReactMouseEvent) => {
    if (!dragging.current || e.buttons !== 1) {
      dragging.current = false;
      return;
    }
    const p = posFrom(e.target);
    if (p) setNav({ sel: { anchor: sel.anchor, focus: p }, tabStart: null });
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    const p = posFrom(e.target);
    if (!p) return;
    e.preventDefault();
    if (!inRange(range, p.row, p.col)) setNav({ sel: at(p.row, p.col), tabStart: null });
    focusGrid();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // --- what is visible ------------------------------------------------------
  const firstRow = Math.max(0, Math.floor(scroll.y / ROW_H) - OVERSCAN);
  const lastRow = Math.min(
    layout.rowCount - 1,
    Math.ceil((scroll.y + view.height) / ROW_H) + OVERSCAN,
  );
  const firstCol = Math.max(0, Math.floor(scroll.x / COL_W) - OVERSCAN);
  const lastCol = Math.min(
    layout.columns.length - 1,
    Math.ceil((scroll.x + view.width) / COL_W) + OVERSCAN,
  );
  const rows: number[] = [];
  for (let r = firstRow; r <= lastRow; r += 1) rows.push(r);
  const cols: number[] = [];
  for (let c = firstCol; c <= lastCol; c += 1) cols.push(c);
  const spans = layout.spans.filter((s) => s.start + s.count > firstCol && s.start <= lastCol);

  const isSelected = (r: number, c: number) =>
    inRange(range, r, c) && !(range.top === range.bottom && range.left === range.right);
  const isFocus = (r: number, c: number) => focus.row === r && focus.col === c;
  const focusSpan = focus.row === -1 ? spanOf(layout, focus.col) : undefined;

  const editorFor = (p: Pos) =>
    editing?.pos.row === p.row && editing.pos.col === p.col ? (
      <input
        className={editing.invalid ? 'cell-editor invalid' : 'cell-editor'}
        aria-label={describePos(layout, p)}
        aria-invalid={editing.invalid}
        value={editing.text}
        autoFocus
        onFocus={(e) => {
          if (!editing.typed) e.currentTarget.select();
        }}
        onChange={(e) => {
          setEditing({ ...editing, text: e.currentTarget.value, invalid: false });
        }}
        onKeyDown={onEditorKey}
        onBlur={() => {
          // Clicking elsewhere commits; a refused value keeps the editor.
          const open = openEdit.current;
          if (!open || open.invalid) return;
          commit(open);
        }}
      />
    ) : null;

  const focusedDataSet = spanOf(layout, Math.max(focus.col, 0))?.dataSet;
  const focusIsXyX = focusedDataSet != null && isXyX(table, focusedDataSet);
  const menuItems: MenuItem[] = [
    {
      label: 'Insert rows above',
      run: () => {
        act({ type: 'insertRows' });
      },
      disabled: !layout.growsRows,
    },
    {
      label: 'Delete rows',
      run: () => {
        act({ type: 'deleteRows' });
      },
      disabled: !layout.growsRows || range.top >= layout.modelRows,
    },
    {
      label: 'Insert group before',
      run: () => {
        apply(insertDataSet(layout, Math.max(focus.col, 0), false));
      },
      // An XY table's X column always stays first (item 29, #38).
      disabled: focusIsXyX,
    },
    {
      label: 'Insert group after',
      run: () => {
        apply(insertDataSet(layout, Math.max(focus.col, 0), true));
      },
    },
    {
      label: 'Delete group',
      run: () => {
        apply(deleteDataSets(layout, range));
      },
      disabled: !focusedDataSet || focusIsXyX,
    },
    {
      label: 'Exclude or include values (Ctrl+E)',
      run: () => {
        act({ type: 'exclude' });
      },
      disabled: focusIsXyX,
    },
    {
      label: 'Fill down (Ctrl+D)',
      run: () => {
        act({ type: 'fillDown' });
      },
    },
  ];

  const totalW = layout.columns.length * COL_W;
  const totalH = layout.rowCount * ROW_H;
  const excludedAt = (r: number, c: number) => {
    const col = layout.columns[c];
    const row = table.rows[r];
    const ds = col ? table.dataSets[col.dataSetIndex] : undefined;
    return col && row && ds ? ds.excluded.has(cellKey(col.subcolumn, row.id)) : false;
  };

  return (
    <div
      ref={gridRef}
      id={gridId}
      className="grid"
      role="grid"
      tabIndex={0}
      aria-label={`${table.title} data`}
      aria-multiselectable="true"
      aria-rowcount={layout.rowCount + headerRows}
      aria-colcount={layout.columns.length + (layout.rowTitles ? 2 : 1)}
      aria-activedescendant={editing ? undefined : cellId(gridId, focus)}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onMouseOver={onMouseOver}
      onMouseUp={() => {
        dragging.current = false;
      }}
      onContextMenu={onContextMenu}
      style={{
        ['--row-head' as string]: `${String(rowHeadW)}px`,
        ['--head' as string]: `${String(headH)}px`,
      }}
    >
      <div className="grid-corner" style={{ width: rowHeadW, height: headH }}>
        {layout.rowTitles && (
          <span className="corner-label" style={{ left: NUM_W, width: TITLE_W }}>
            Row titles
          </span>
        )}
      </div>

      <div className="grid-cols" style={{ left: rowHeadW, height: headH }}>
        <div
          className="layer"
          style={{ width: totalW, transform: `translateX(${String(-scroll.x)}px)` }}
        >
          <div role="row" aria-rowindex={1} className="contents">
            {spans.map((s) => {
              const p = { row: -1, col: s.start };
              const color = table.dataSets[s.dataSetIndex]?.color ?? paletteColor(s.dataSetIndex);
              const active = focusSpan?.dataSetIndex === s.dataSetIndex;
              return (
                <div
                  key={s.dataSetIndex}
                  id={cellId(gridId, p)}
                  role="columnheader"
                  aria-colindex={s.start + (layout.rowTitles ? 3 : 2)}
                  aria-colspan={s.count}
                  aria-selected={active}
                  data-row={-1}
                  data-col={s.start}
                  className={`title-cell${s.spare ? ' spare' : ''}${active ? ' focus' : ''}`}
                  style={{ left: s.start * COL_W, width: s.count * COL_W, height: HEAD_H }}
                >
                  <span
                    className="swatch"
                    style={{ background: s.spare ? 'transparent' : color }}
                  />
                  <span className="title-text">
                    {s.spare
                      ? s.dataSetIndex === table.dataSets.length
                        ? 'Add group'
                        : ''
                      : s.title}
                  </span>
                  {editorFor(p)}
                </div>
              );
            })}
          </div>
          {layout.subHeaders && (
            <div role="row" aria-rowindex={2} className="contents">
              {cols.map((c) => (
                <div
                  key={c}
                  role="columnheader"
                  aria-colindex={c + (layout.rowTitles ? 3 : 2)}
                  className={`sub-cell${c >= range.left && c <= range.right ? ' in-range' : ''}`}
                  style={{ left: c * COL_W, top: HEAD_H, width: COL_W, height: SUB_H }}
                >
                  {layout.columns[c]?.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-rows" style={{ top: headH, width: rowHeadW }}>
        <div
          className="layer"
          style={{ height: totalH, transform: `translateY(${String(-scroll.y)}px)` }}
        >
          {rows.map((r) => {
            const spare = r >= layout.modelRows;
            const inRows = r >= range.top && r <= range.bottom;
            return (
              <div key={r} className="contents">
                <div
                  id={`${gridId}-rh${String(r)}`}
                  role="rowheader"
                  aria-colindex={1}
                  data-row={r}
                  data-col={bounds.minCol}
                  data-whole-row=""
                  className={`num-cell${spare ? ' spare' : ''}${inRows ? ' in-range' : ''}`}
                  style={{ top: r * ROW_H, width: NUM_W, height: ROW_H }}
                >
                  {r + 1}
                </div>
                {layout.rowTitles && (
                  <div
                    id={cellId(gridId, { row: r, col: -1 })}
                    role="gridcell"
                    aria-colindex={2}
                    aria-selected={isSelected(r, -1)}
                    data-row={r}
                    data-col={-1}
                    className={`rowtitle-cell${isSelected(r, -1) ? ' selected' : ''}${isFocus(r, -1) ? ' focus' : ''}`}
                    style={{ top: r * ROW_H, left: NUM_W, width: TITLE_W, height: ROW_H }}
                  >
                    {table.rows[r]?.title ?? ''}
                    {editorFor({ row: r, col: -1 })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={bodyRef}
        className="grid-body"
        style={{ left: rowHeadW, top: headH }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll({ x: el.scrollLeft, y: el.scrollTop });
        }}
      >
        <div className="layer" style={{ width: totalW, height: totalH }}>
          {rows.map((r) => (
            <div
              key={r}
              role="row"
              aria-rowindex={r + headerRows + 1}
              aria-owns={`${gridId}-rh${String(r)}${layout.rowTitles ? ` ${cellId(gridId, { row: r, col: -1 })}` : ''}`}
              className="contents"
            >
              {cols.map((c) => {
                const v = cellValue(layout, r, c);
                const col = layout.columns[c];
                const first = col?.subcolumn === 0;
                const cls = [
                  'cell',
                  first ? 'set-start' : '',
                  isSelected(r, c) ? 'selected' : '',
                  isFocus(r, c) ? 'focus' : '',
                  v !== null && excludedAt(r, c) ? 'excluded' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const ds = col ? table.dataSets[col.dataSetIndex] : undefined;
                return (
                  <div
                    key={c}
                    id={cellId(gridId, { row: r, col: c })}
                    role="gridcell"
                    aria-colindex={c + (layout.rowTitles ? 3 : 2)}
                    aria-selected={isSelected(r, c) || isFocus(r, c)}
                    data-row={r}
                    data-col={c}
                    className={cls}
                    style={{ top: r * ROW_H, left: c * COL_W, width: COL_W, height: ROW_H }}
                    onDoubleClick={() => {
                      startEdit(null);
                    }}
                  >
                    {v === null ? '' : formatCell(v, dec, ds?.decimals)}
                    {editorFor({ row: r, col: c })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {menu && (
        <GridMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => {
            setMenu(null);
            focusGrid();
          }}
        />
      )}
    </div>
  );
}
