/**
 * Projects kept in the browser (item 03, "Saving"): IndexedDB via Dexie,
 * as PlasmidPop. Each row holds the `.bsig` text itself, so what is stored
 * is the file format, with its migrations, and a stored project can always
 * be downloaded as it is.
 */
import Dexie, { type EntityTable } from 'dexie';

import type { Id } from '@/model/ids';
import { asId } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { Project } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';

import { type SavedProject, readBsig, writeBsig } from './bsig';

export interface StoredProject {
  readonly id: string;
  readonly name: string;
  /** The `.bsig` text. */
  readonly text: string;
  readonly tables: number;
  /** Missing on rows written before #59. */
  readonly analyses?: number;
  readonly graphs?: number;
  /**
   * The stored project is the one last downloaded or opened from a `.bsig`
   * (item 09): a file of it exists. Missing on older rows, read as false.
   */
  readonly downloaded?: boolean;
  readonly updatedAt: number;
}

/** What the project list shows. */
export interface ProjectSummary {
  readonly id: Id;
  readonly name: string;
  readonly tables: number;
  /** Null for a row written before these were counted. */
  readonly analyses: number | null;
  readonly graphs: number | null;
  readonly downloaded: boolean;
  readonly updatedAt: number;
}

/** A project read back from the browser, with whether a file of it exists. */
export interface KeptProject extends SavedProject {
  readonly downloaded: boolean;
}

export interface SaveOptions {
  readonly now?: number;
  readonly results?: ReadonlyMap<Id, ResultEntry>;
  readonly engine?: EngineInfo | null;
  /** This is the project as last downloaded or opened from a file. */
  readonly downloaded?: boolean;
}

export class BarelySigDb extends Dexie {
  declare projects: EntityTable<StoredProject, 'id'>;

  constructor(name = 'barelysig') {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt' });
  }
}

export class ProjectStorage {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly db: BarelySigDb = new BarelySigDb()) {}

  /** Called after every write or removal, so lists can re-read. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed(): void {
    this.listeners.forEach((l) => {
      l();
    });
  }

  async save(project: Project, app: string, opts: SaveOptions = {}): Promise<void> {
    const text = writeBsig({
      project,
      results: opts.results ?? new Map(),
      engine: opts.engine ?? null,
      app,
    });
    await this.db.projects.put(
      row(project, text, opts.now ?? Date.now(), opts.downloaded ?? false),
    );
    this.changed();
  }

  /** The most recently changed project, or null when there is none (or it can't be read). */
  async latest(): Promise<KeptProject | null> {
    const r = await this.db.projects.orderBy('updatedAt').last();
    return r ? readStored(r) : null;
  }

  async load(id: Id): Promise<KeptProject | null> {
    const r = await this.db.projects.get(id);
    return r ? readStored(r) : null;
  }

  /** Newest change first; every project unless `limit` is given. */
  async list(limit?: number): Promise<ProjectSummary[]> {
    const newest = this.db.projects.orderBy('updatedAt').reverse();
    const rows = await (limit === undefined ? newest : newest.limit(limit)).toArray();
    return rows.map((r) => ({
      id: asId(r.id),
      name: r.name,
      tables: r.tables,
      analyses: r.analyses ?? null,
      graphs: r.graphs ?? null,
      downloaded: r.downloaded === true,
      updatedAt: r.updatedAt,
    }));
  }

  /** The stored `.bsig` text as it is, for a download; null when there is no such project. */
  async text(id: Id): Promise<{ name: string; text: string } | null> {
    const r = await this.db.projects.get(id);
    return r ? { name: r.name, text: r.text } : null;
  }

  /** A file of the stored project now exists. Does nothing when there is no row. */
  async markDownloaded(id: Id): Promise<void> {
    if ((await this.db.projects.update(id, { downloaded: true })) > 0) this.changed();
  }

  /**
   * Renames a stored project without opening it; false when this version
   * can't read it (the row is left alone).
   */
  async rename(id: Id, name: string, app: string, now = Date.now()): Promise<boolean> {
    const saved = await this.load(id);
    if (!saved) return false;
    await this.save({ ...saved.project, name }, app, {
      now,
      results: saved.results,
      engine: saved.engine,
    });
    return true;
  }

  /** Copies a stored project under a new id and name; the copy, or null when it can't be read. */
  async duplicate(
    id: Id,
    copy: { readonly id: Id; readonly name: string },
    app: string,
    now = Date.now(),
  ): Promise<ProjectSummary | null> {
    const saved = await this.load(id);
    if (!saved) return null;
    await this.save({ ...saved.project, ...copy }, app, {
      now,
      results: saved.results,
      engine: saved.engine,
    });
    return (await this.list()).find((r) => r.id === copy.id) ?? null;
  }

  async remove(id: Id): Promise<void> {
    await this.db.projects.delete(id);
    this.changed();
  }
}

function row(project: Project, text: string, now: number, downloaded: boolean): StoredProject {
  return {
    id: project.id,
    name: project.name,
    text,
    tables: project.tables.size,
    analyses: project.analyses.size,
    graphs: project.graphs.size,
    downloaded,
    updatedAt: now,
  };
}

function readStored(r: StoredProject): KeptProject | null {
  try {
    return { ...readBsig(r.text), downloaded: r.downloaded === true };
  } catch {
    // A row this version can't read (written by a newer app, or damaged) is
    // left in place for the newer app, not deleted.
    return null;
  }
}

let shared: ProjectStorage | null = null;

/** The app's storage, created on first use so importing this module has no side effects. */
export function getStorage(): ProjectStorage {
  shared ??= new ProjectStorage();
  return shared;
}
