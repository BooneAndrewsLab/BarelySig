/**
 * Opening, switching and downloading projects (item 03), on top of the
 * store and the browser's storage. Any pending autosave is written before
 * the project changes, so switching never loses the last edit.
 */
import { BsigError, type SavedProject, readBsig, writeBsig } from '@/io/bsig';
import { engineDiffers } from '@/io/engineChange';
import { download, fileNameFor } from '@/io/files';
import { figureKind, readFigure } from '@/io/recipe';
import { type KeptProject, type ProjectStorage, getStorage } from '@/io/storage';
import type { Id } from '@/model/ids';
import { newId } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { Json } from '@/model/json';
import type { ResultEntry } from '@/model/recompute';
import { type Project, createProject } from '@/model/project';

import { analytics } from '../analytics';
import { copyName } from '../copyName';
import { exampleProject } from '../examples';
import { Autosaver } from './autosave';
import { keepStorageQuietly } from './storageSafety';
import { type ResultsBridge, getResults } from './results';
import { type AppStore, project, store } from './store';

const APP = __APP_VERSION__;

/**
 * A reopened figure's results as it was exported, kept when this app's
 * engine differs, so the graph can say whether the recomputed numbers
 * are the same (#46, note 07). It holds while the figure's data are
 * unchanged (the same tables and analyses).
 */
export interface Baseline {
  readonly tables: Project['tables'];
  readonly analyses: Project['analyses'];
  readonly engine: EngineInfo;
  readonly app: string;
  readonly results: ReadonlyMap<Id, ResultEntry>;
}

export class Session {
  readonly autosaver: Autosaver;
  /** The last reopened figure's numbers, when a newer engine recomputes them. */
  baseline: Baseline | null = null;

  constructor(
    private readonly appStore: AppStore = store,
    readonly storage: ProjectStorage = getStorage(),
    private readonly results: () => ResultsBridge | null = () => getResults(),
  ) {
    this.autosaver = new Autosaver(
      appStore,
      storage,
      APP,
      () => {
        appStore.notify(
          'Couldn’t save to this browser’s storage. Download the project to keep a copy.',
          'warning',
        );
      },
      () => this.extras(),
      () => {
        void keepStorageQuietly();
      },
    );
  }

  private extras(): { results: ReadonlyMap<Id, ResultEntry>; engine: EngineInfo | null } {
    const bridge = this.results();
    return bridge
      ? { results: bridge.current(), engine: bridge.info }
      : { results: new Map(), engine: null };
  }

  /** Autosaves when results change, so they come back with the project. */
  watchResults(): () => void {
    const bridge = this.results();
    if (!bridge) return () => undefined;
    let seen = bridge.current();
    return bridge.subscribe(() => {
      const now = bridge.current();
      const changed =
        now.size !== seen.size ||
        [...now].some(([id, r]) => seen.get(id)?.inputHash !== r.inputHash);
      seen = now;
      if (changed) this.autosaver.resultsChanged();
    });
  }

  private seed(saved: SavedProject): void {
    this.results()?.seed(saved.results);
  }

  private reopen(saved: KeptProject): void {
    this.autosaver.markSaved(saved.project);
    this.seed(saved);
    this.appStore.load(saved.project, { hasFile: saved.downloaded });
  }

  /** Reopens the project changed most recently in this browser, if any. */
  async restore(): Promise<void> {
    const saved = await this.storage.latest();
    if (saved) this.reopen(saved);
  }

  private async replace(p: Project, opts: { hasFile?: boolean } = {}): Promise<void> {
    await this.autosaver.flush();
    this.appStore.load(p, opts);
  }

  private isOpen(id: Id): boolean {
    return project(this.appStore.getState()).id === id;
  }

  async newProject(): Promise<void> {
    await this.replace(createProject('Untitled project'));
  }

  /**
   * Closes the open project: any pending change is saved to this browser
   * first, then the start screen shows, with the project in its list.
   */
  async closeProject(): Promise<void> {
    const p = project(this.appStore.getState());
    const hadContent = p.tables.size > 0 || p.analyses.size > 0 || p.graphs.size > 0;
    await this.replace(createProject('Untitled project'));
    if (hadContent) {
      this.appStore.notify(
        `Closed “${p.name}”. It’s kept in this browser: open it again from the list.`,
      );
    }
  }

  async openExample(): Promise<void> {
    await this.replace(exampleProject());
  }

  async openStored(id: Id): Promise<void> {
    if (this.isOpen(id)) return;
    await this.autosaver.flush();
    const saved = await this.storage.load(id);
    if (!saved) {
      this.appStore.notify(CANT_READ, 'error');
      return;
    }
    this.reopen(saved);
  }

  /**
   * Deletes a project from this browser for good (item 09). The open one
   * is closed first, and its pending autosave dropped, not written.
   */
  async deleteProject(id: Id, name: string): Promise<void> {
    if (this.isOpen(id)) {
      await this.autosaver.discard();
      this.appStore.load(createProject('Untitled project'));
    }
    await this.storage.remove(id);
    this.appStore.notify(`Deleted “${name}” from this browser.`);
  }

  /** Renames a project in the list; the open one is renamed as an edit (so undo works). */
  async renameStored(id: Id, name: string): Promise<void> {
    if (this.isOpen(id)) {
      this.appStore.edit({ op: 'renameProject', name });
      return;
    }
    if (!(await this.storage.rename(id, name, APP))) this.appStore.notify(CANT_READ, 'error');
  }

  /** Copies a project in the list, as “Name (copy)”. */
  async duplicateStored(id: Id, name: string): Promise<void> {
    if (this.isOpen(id)) await this.autosaver.flush();
    const taken = new Set((await this.storage.list()).map((r) => r.name));
    const copy = await this.storage.duplicate(
      id,
      { id: newId('p'), name: copyName(name, taken) },
      APP,
    );
    if (copy) this.appStore.notify(`Made a copy: “${copy.name}”.`);
    else this.appStore.notify(CANT_READ, 'error');
  }

  /** Downloads a project in the list without opening it: its stored `.bsig` as it is. */
  async downloadStored(id: Id): Promise<boolean> {
    if (this.isOpen(id)) return this.download();
    const kept = await this.storage.text(id);
    if (!kept) return false;
    const name = fileNameFor(kept.name);
    if (!(await download(name, kept.text))) return false;
    await this.storage.markDownloaded(id);
    this.appStore.notify(`Downloaded “${name}”.`);
    analytics.trackOnce('file', 'download');
    return true;
  }

  /** Opens a `.bsig` project, or an exported figure's recipe (#43), as a new project in this browser. */
  async openFile(file: File): Promise<void> {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      this.appStore.notify(`Couldn’t read “${file.name}”.`, 'error');
      return;
    }
    try {
      const figure = figureKind(file.name, bytes.subarray(0, 512));
      const saved = figure
        ? await readFigure(figure, bytes)
        : readBsig(new TextDecoder().decode(bytes));
      await this.openSaved(saved, { hasFile: figure === null, figure: figure !== null });
      this.appStore.notify(
        figure
          ? `Opened the figure “${file.name}” with the data and settings that made it.`
          : `Opened “${file.name}”.`,
      );
      analytics.trackOnce('file', 'open', figure ?? 'bsig');
    } catch (e: unknown) {
      if (!(e instanceof BsigError)) throw e;
      this.appStore.notify(`“${file.name}”: ${e.message}`, 'error');
    }
  }

  /** Reopens a figure from the project's export history (#43). */
  async openRecipe(recipe: Json): Promise<void> {
    try {
      await this.openSaved(readBsig(JSON.stringify(recipe)), { hasFile: false, figure: true });
      this.appStore.notify('Restored the figure as it was exported, as a new project.');
    } catch (e: unknown) {
      if (!(e instanceof BsigError)) throw e;
      this.appStore.notify(e.message, 'error');
    }
  }

  private async openSaved(
    saved: SavedProject,
    opts: { hasFile: boolean; figure?: boolean },
  ): Promise<void> {
    // A project in the browser is a copy of the file: its own id, so
    // opening the same file twice gives two, never one overwriting another.
    this.seed(saved);
    const info = this.results()?.info;
    this.baseline =
      opts.figure && saved.engine && info && engineDiffers(saved.engine, info)
        ? {
            tables: saved.project.tables,
            analyses: saved.project.analyses,
            engine: saved.engine,
            app: saved.app,
            results: saved.results,
          }
        : null;
    await this.replace({ ...saved.project, id: newId('p') }, { hasFile: opts.hasFile });
    // A figure opens on its graph.
    const graph = saved.project.order.graphs[0];
    if (graph && saved.project.tables.size <= 1 && saved.project.graphs.size === 1) {
      this.appStore.show({ kind: 'graph', id: graph });
    }
  }

  /** Downloads the open project; false when the save dialog was cancelled. */
  async download(): Promise<boolean> {
    const p = project(this.appStore.getState());
    const name = fileNameFor(p.name);
    const { results, engine } = this.extras();
    const text = writeBsig({ project: p, results, engine, app: APP });
    if (!(await download(name, text))) return false;
    this.appStore.markDownloaded();
    // The row says a file of it exists now (item 09); a pending save writes that itself.
    await this.autosaver.flush();
    await this.storage.markDownloaded(p.id);
    this.appStore.notify(`Downloaded “${name}”.`);
    analytics.trackOnce('file', 'download');
    return true;
  }

  /** Writes a pending autosave when the page is hidden or closed. */
  listen(target: Window = window): () => void {
    const flush = () => {
      void this.autosaver.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    target.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      target.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }
}

const CANT_READ = 'That project can’t be opened by this version of BarelySig.';

let shared: Session | null = null;

export function getSession(): Session {
  shared ??= new Session();
  return shared;
}
