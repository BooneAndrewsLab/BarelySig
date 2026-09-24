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
  readonly updatedAt: number;
}

/** What the "Recent projects" list shows. */
export interface ProjectSummary {
  readonly id: Id;
  readonly name: string;
  readonly tables: number;
  readonly updatedAt: number;
}

export class BarelySigDb extends Dexie {
  declare projects: EntityTable<StoredProject, 'id'>;

  constructor(name = 'barelysig') {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt' });
  }
}

export class ProjectStorage {
  constructor(private readonly db: BarelySigDb = new BarelySigDb()) {}

  async save(
    project: Project,
    app: string,
    now = Date.now(),
    results: ReadonlyMap<Id, ResultEntry> = new Map(),
    engine: EngineInfo | null = null,
  ): Promise<void> {
    const text = writeBsig({ project, results, engine, app });
    await this.db.projects.put({
      id: project.id,
      name: project.name,
      text,
      tables: project.tables.size,
      updatedAt: now,
    });
  }

  /** The most recently changed project, or null when there is none (or it can't be read). */
  async latest(): Promise<SavedProject | null> {
    const row = await this.db.projects.orderBy('updatedAt').last();
    return row ? readStored(row) : null;
  }

  async load(id: Id): Promise<SavedProject | null> {
    const row = await this.db.projects.get(id);
    return row ? readStored(row) : null;
  }

  async list(limit = 20): Promise<ProjectSummary[]> {
    const rows = await this.db.projects.orderBy('updatedAt').reverse().limit(limit).toArray();
    return rows.map((r) => ({
      id: asId(r.id),
      name: r.name,
      tables: r.tables,
      updatedAt: r.updatedAt,
    }));
  }

  async remove(id: Id): Promise<void> {
    await this.db.projects.delete(id);
  }
}

function readStored(row: StoredProject): SavedProject | null {
  try {
    return readBsig(row.text);
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
