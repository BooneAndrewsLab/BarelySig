/**
 * Autosave (item 03): the project goes to IndexedDB a second after the
 * last change, and at once when the page is hidden or closed. An empty,
 * untouched project is not saved, so opening the app doesn't fill
 * "Recent projects" with blanks.
 */
import type { Project } from '@/model/project';
import type { ProjectStorage } from '@/io/storage';

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
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, AUTOSAVE_DELAY);
  }

  /** Writes a pending change now (page hidden, or before switching project). */
  async flush(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    try {
      await this.storage.save(p, this.app);
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
