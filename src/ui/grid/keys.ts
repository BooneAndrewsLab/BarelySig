/**
 * The grid's keys (item 03, table in note 03), as Excel. Pure, so the key
 * map is tested apart from the view.
 */
import type { Direction, NavCommand } from './selection';

export type GridAction =
  | { readonly type: 'nav'; readonly cmd: NavCommand }
  /** Start editing with this character, replacing the cell. */
  | { readonly type: 'type'; readonly text: string }
  /** F2: edit, keeping the value. */
  | { readonly type: 'edit' }
  | { readonly type: 'clear' }
  | { readonly type: 'fillDown' }
  | { readonly type: 'exclude' }
  | { readonly type: 'insertRows' }
  | { readonly type: 'deleteRows' };

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** What a key does while the grid (not the cell editor) has focus. */
export function gridAction(e: KeyLike): GridAction | null {
  const mod = e.ctrlKey || e.metaKey;
  const extend = e.shiftKey;
  const dir = ARROWS[e.key];
  if (dir && !e.altKey) return { type: 'nav', cmd: { type: 'move', dir, extend, jump: mod } };
  if (e.altKey) return null;
  switch (e.key) {
    case 'Home':
      return { type: 'nav', cmd: { type: 'home', ctrl: mod, extend } };
    case 'End':
      return { type: 'nav', cmd: { type: 'end', ctrl: mod, extend } };
    case 'PageUp':
      return { type: 'nav', cmd: { type: 'page', dir: 'up', extend } };
    case 'PageDown':
      return { type: 'nav', cmd: { type: 'page', dir: 'down', extend } };
    case 'Tab':
      return { type: 'nav', cmd: { type: 'tab', back: e.shiftKey } };
    case 'Enter':
      return { type: 'nav', cmd: { type: 'enter', back: e.shiftKey } };
    case 'F2':
      return { type: 'edit' };
    case 'Delete':
    case 'Backspace':
      return mod ? null : { type: 'clear' };
    default:
      break;
  }
  if (mod) {
    const k = e.key.toLowerCase();
    if (k === 'a' && !e.shiftKey) return { type: 'nav', cmd: { type: 'selectAll' } };
    if (k === 'd' && !e.shiftKey) return { type: 'fillDown' };
    if (k === 'e' && !e.shiftKey) return { type: 'exclude' };
    // Ctrl+Shift+= reports '+' on most layouts, '=' on some.
    if (e.key === '+' || (e.key === '=' && e.shiftKey)) return { type: 'insertRows' };
    if (e.key === '-' && !e.shiftKey) return { type: 'deleteRows' };
    return null;
  }
  // A printable character starts editing.
  if (e.key.length === 1) return { type: 'type', text: e.key };
  return null;
}

/** Keys that end an edit started by typing ("enter mode") and move on, as Excel. */
export function editorExit(e: KeyLike, typed: boolean): NavCommand | 'cancel' | null {
  if (e.key === 'Escape') return 'cancel';
  if (e.key === 'Enter') return { type: 'enter', back: e.shiftKey };
  if (e.key === 'Tab') return { type: 'tab', back: e.shiftKey };
  const dir = ARROWS[e.key];
  if (typed && dir && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
    return { type: 'move', dir, extend: false, jump: false };
  }
  return null;
}
