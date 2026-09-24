/**
 * Autosave (item 03): the project goes to IndexedDB a second after the
 * last change, and at once when the page is hidden or closed. An empty,
 * untouched project is not saved, so opening the app doesn't fill
 * "Recent projects" with blanks.
 */
import type { Project } from '@/model/project';
import type { ProjectStorage } from '@/io/storage';
import type { Id } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { ResultEntry } from '@/model/recompute';

import { type AppStore, project } from './store';

export const AUTOSAVE_DELAY = 1000;

const worthSaving = (p: Project, edited: boolean) => edited || p.tables.size > 0;

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saved: Project | null = null;
  private pending: Project | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly store: AppStore,
    private readonly storage: ProjectStorage,
    private readonly app: string,
    private readonly onError: (e: unknown) => void = () => undefined,
    /** Results to save with the project, and the engine they came from. */
    private readonly extras: () => {
      results: ReadonlyMap<Id, ResultEntry>;
      engine: EngineInfo | null;
    } = () => ({
      results: new Map(),
      engine: null,
    }),
  ) {
    this.saved = project(store.getState());
    this.unsubscribe = store.subscribe(() => {
      this.changed();
    });
  }

  /** A project that was just restored from storage counts as saved. */
  markSaved(p: Project): void {
    this.saved = p;
  }

  /** Results changed (a run finished): save them with the project. */
  resultsChanged(): void {
    const s = this.store.getState();
    const p = project(s);
    if (!worthSaving(p, true) || this.pending === p) return;
    this.pending = p;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, AUTOSAVE_DELAY);
  }

  private changed(): void {
    const s = this.store.getState();
    const p = project(s);
    if (p === this.saved || p === this.pending) return;
    if (
      !worthSaving(
        p,
        s.history.past.length > 0 || s.history.future.length > 0 || s.downloaded !== null,
      )
    )
      return;
    this.pending = p;
    this.schedule();
  }

  /** Writes a pending change now (page hidden, or before switching project). */
  async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    try {
      const { results, engine } = this.extras();
      await this.storage.save(p, this.app, Date.now(), results, engine);
      this.saved = p;
    } catch (e: unknown) {
      this.onError(e);
    }
  }

  dispose(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.unsubscribe();
  }
}
