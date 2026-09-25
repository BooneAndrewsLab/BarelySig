/**
 * Opening, switching and downloading projects (item 03), on top of the
 * store and the browser's storage. Any pending autosave is written before
 * the project changes, so switching never loses the last edit.
 */
import { BsigError, type SavedProject, readBsig, writeBsig } from '@/io/bsig';
import { download, fileNameFor } from '@/io/files';
import { figureKind, readFigure } from '@/io/recipe';
import { type ProjectStorage, getStorage } from '@/io/storage';
import type { Id } from '@/model/ids';
import { newId } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { Json } from '@/model/json';
import type { ResultEntry } from '@/model/recompute';
import { type Project, createProject } from '@/model/project';

import { analytics } from '../analytics';
import { exampleProject } from '../examples';
import { Autosaver } from './autosave';
import { type ResultsBridge, getResults } from './results';
import { type AppStore, project, store } from './store';

const APP = __APP_VERSION__;

export class Session {
  readonly autosaver: Autosaver;

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

  /** Reopens the project changed most recently in this browser, if any. */
  async restore(): Promise<void> {
    const saved = await this.storage.latest();
    if (!saved) return;
    this.autosaver.markSaved(saved.project);
    this.seed(saved);
    this.appStore.load(saved.project);
  }

  private async replace(p: Project, opts: { fromFile?: boolean } = {}): Promise<void> {
    await this.autosaver.flush();
    this.appStore.load(p, opts);
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
        `Closed “${p.name}”. It’s kept in this browser: open it again from the list or from Projects.`,
      );
    }
  }

  async openExample(): Promise<void> {
    await this.replace(exampleProject());
  }

  async openStored(id: Id): Promise<void> {
    const saved = await this.storage.load(id);
    if (!saved) {
      this.appStore.notify('That project can’t be opened by this version of BarelySig.', 'error');
      return;
    }
    await this.autosaver.flush();
    this.autosaver.markSaved(saved.project);
    this.seed(saved);
    this.appStore.load(saved.project);
  }

  /** Opens a `.bsig` file as a new project in this browser. */
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
      await this.openSaved(saved, { fromFile: figure === null });
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
      await this.openSaved(readBsig(JSON.stringify(recipe)), { fromFile: false });
      this.appStore.notify('Restored the figure as it was exported, as a new project.');
    } catch (e: unknown) {
      if (!(e instanceof BsigError)) throw e;
      this.appStore.notify(e.message, 'error');
    }
  }

  private async openSaved(saved: SavedProject, opts: { fromFile: boolean }): Promise<void> {
    // A project in the browser is a copy of the file: its own id, so
    // opening the same file twice gives two, never one overwriting another.
    this.seed(saved);
    await this.replace({ ...saved.project, id: newId('p') }, { fromFile: opts.fromFile });
    // A figure opens on its graph.
    const graph = saved.project.order.graphs[0];
    if (graph && saved.project.tables.size <= 1 && saved.project.graphs.size === 1) {
      this.appStore.show({ kind: 'graph', id: graph });
    }
  }

  async download(): Promise<void> {
    const p = project(this.appStore.getState());
    const name = fileNameFor(p.name);
    const { results, engine } = this.extras();
    const text = writeBsig({ project: p, results, engine, app: APP });
    if (!(await download(name, text))) return;
    this.appStore.markDownloaded();
    this.appStore.notify(`Downloaded “${name}”.`);
    analytics.trackOnce('file', 'download');
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

let shared: Session | null = null;

export function getSession(): Session {
  shared ??= new Session();
  return shared;
}
