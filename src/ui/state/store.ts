/**
 * The app's one store (item 03): the project with its history, which sheet
 * is open, and the status-line notice. Read from React with `useAppState`
 * (`useSyncExternalStore`), changed only through the methods here, so
 * every change to the project is a named edit and an undo step.
 */
import { type Edit, EditError, applyEdit, describeEdit } from '@/model/edits';
import {
  type History,
  nextRedo,
  nextUndo,
  record,
  redo,
  startHistory,
  undo,
} from '@/model/history';
import type { Id } from '@/model/ids';
import { type Project, createProject } from '@/model/project';

import { analytics } from '../analytics';

/** What the main area shows. */
export type Sheet = { readonly kind: 'home' } | { readonly kind: 'table'; readonly id: Id };

export const HOME: Sheet = { kind: 'home' };

export type NoticeTone = 'info' | 'warning' | 'error';

/** One message for the status line; `seq` tells a repeated message from the last one. */
export interface Notice {
  readonly text: string;
  readonly tone: NoticeTone;
  readonly seq: number;
}

export interface AppState {
  readonly history: History<Project, Sheet>;
  readonly sheet: Sheet;
  readonly notice: Notice | null;
  /** The project as it was when last downloaded or opened from a file; null if never. */
  readonly downloaded: Project | null;
}

export const project = (s: AppState): Project => s.history.present;

/** Whether a sheet still exists in the project (a table can be undone away). */
function exists(p: Project, sheet: Sheet): boolean {
  return sheet.kind === 'home' || p.tables.has(sheet.id);
}

/** The first table, or home: where to go when the open sheet disappears. */
function fallback(p: Project): Sheet {
  const first = p.order.tables[0];
  return first === undefined ? HOME : { kind: 'table', id: first };
}

export interface EditOptions {
  /**
   * Sheet to show after the edit (e.g. a new table); defaults to the open
   * one. Undo and redo of the edit return there, since that is where its
   * effect is seen.
   */
  readonly show?: Sheet;
}

export class AppStore {
  private state: AppState;
  private readonly listeners = new Set<() => void>();
  private seq = 0;

  constructor(initial: Project = createProject('Untitled project')) {
    this.state = {
      history: startHistory(initial),
      sheet: fallback(initial),
      notice: null,
      downloaded: null,
    };
  }

  readonly getState = (): AppState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Applies an edit as one undo step. A refused edit (`EditError`) changes
   * nothing and puts its message on the status line; returns whether the
   * edit was applied.
   */
  edit(edit: Edit, opts: EditOptions = {}): boolean {
    const before = this.state.history.present;
    let next: Project;
    try {
      next = applyEdit(before, edit);
    } catch (e: unknown) {
      if (!(e instanceof EditError)) throw e;
      this.notify(e.message, 'error');
      return false;
    }
    const wanted = opts.show ?? this.state.sheet;
    const history = record(this.state.history, next, describeEdit(edit), wanted);
    this.set({ history, sheet: exists(next, wanted) ? wanted : fallback(next) });
    return true;
  }

  undo(): void {
    const step = nextUndo(this.state.history);
    if (!step) return;
    this.travel(undo(this.state.history), step.where);
    analytics.trackOnce('history', 'undo');
  }

  redo(): void {
    const step = nextRedo(this.state.history);
    if (!step) return;
    this.travel(redo(this.state.history), step.where);
    analytics.trackOnce('history', 'redo');
  }

  /** "Undo Edit cells", or null when there is nothing to undo. */
  undoLabel(): string | null {
    const s = nextUndo(this.state.history);
    return s ? `Undo ${s.label}` : null;
  }

  redoLabel(): string | null {
    const s = nextRedo(this.state.history);
    return s ? `Redo ${s.label}` : null;
  }

  /** Replaces the project (opening a file or a saved project); history starts afresh. */
  load(p: Project, opts: { readonly fromFile?: boolean } = {}): void {
    this.set({
      history: startHistory(p),
      sheet: fallback(p),
      notice: null,
      downloaded: opts.fromFile === true ? p : null,
    });
  }

  show(sheet: Sheet): void {
    if (!exists(this.state.history.present, sheet)) return;
    this.set({ sheet });
  }

  notify(text: string, tone: NoticeTone = 'info'): void {
    this.seq += 1;
    this.set({ notice: { text, tone, seq: this.seq } });
  }

  clearNotice(): void {
    if (this.state.notice) this.set({ notice: null });
  }

  /** The current project was just downloaded. */
  markDownloaded(): void {
    this.set({ downloaded: this.state.history.present });
  }

  private travel(history: History<Project, Sheet>, where: Sheet): void {
    const p = history.present;
    this.set({
      history,
      sheet: exists(p, where)
        ? where
        : exists(p, this.state.sheet)
          ? this.state.sheet
          : fallback(p),
    });
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => {
      l();
    });
  }
}

export const store = new AppStore();
