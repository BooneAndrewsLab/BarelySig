/**
 * Keeping results live in the app (item 04): the store's project goes to
 * `Recompute`, which runs analyses on the engine; saved results are fed
 * back in when a project is opened; the sheets re-render when anything
 * changes (a result, a status, the engine starting).
 */
import { type Engine as EngineClass, Engine, type EngineState } from '@/engine/engine';
import { ENGINE } from '@/engine/engineInfo';
import { REGISTRY } from '@/analyses/registry';
import { makeCheck, makeRunner, withCode } from '@/analyses/runner';
import type { Id } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import { Recompute, type ResultEntry, type Runner } from '@/model/recompute';
import type { Analysis, Project } from '@/model/project';

import { type AppStore, project, store } from './store';

export const STOPPED = 'Stopped. Run it again when you’re ready.';

export interface ResultsOptions {
  readonly runner?: Runner;
  readonly check?: (a: Analysis, p: Project) => string | null;
  readonly engine?: EngineClass;
  readonly info?: EngineInfo;
  readonly debounceMs?: number;
}

export class ResultsBridge {
  readonly recompute: Recompute;
  readonly engine: EngineClass | null;
  readonly info: EngineInfo;
  private version = 0;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(appStore: AppStore, opts: ResultsOptions = {}) {
    this.engine = opts.engine ?? (opts.runner ? null : new Engine());
    this.info = opts.info ?? withCode(ENGINE, REGISTRY);
    const runner = opts.runner ?? makeRunner(this.engine ?? new Engine(), REGISTRY);
    this.recompute = new Recompute({
      runner,
      engine: this.info,
      check: opts.check ?? makeCheck(REGISTRY),
      ...(opts.debounceMs === undefined ? {} : { debounceMs: opts.debounceMs }),
      onChange: () => {
        this.bump();
      },
    });
    if (this.engine) {
      this.unsubscribe.push(
        this.engine.subscribe(() => {
          this.bump();
        }),
      );
    }
    this.recompute.setProject(project(appStore.getState()));
    this.unsubscribe.push(
      appStore.subscribe(() => {
        this.recompute.setProject(project(appStore.getState()));
      }),
    );
  }

  /** Stops following the store and cancels anything pending. */
  dispose(): void {
    this.unsubscribe.forEach((u) => {
      u();
    });
    this.recompute.dispose();
  }

  readonly getVersion = (): number => this.version;

  readonly subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  engineState(): EngineState {
    return this.engine?.state ?? { kind: 'ready' };
  }

  /** Results read from a file or from storage, shown at once when their input still matches. */
  seed(results: ReadonlyMap<Id, ResultEntry>): void {
    results.forEach((entry, id) => {
      this.recompute.results.put(id, entry);
    });
    this.bump();
  }

  current(): Map<Id, ResultEntry> {
    return this.recompute.currentResults();
  }

  stop(id: Id): void {
    this.recompute.stop(id, STOPPED);
  }

  retry(id: Id): void {
    this.recompute.retry(id);
  }

  private bump(): void {
    this.version += 1;
    this.listeners.forEach((l) => {
      l();
    });
  }
}

let shared: ResultsBridge | null = null;

export function getResults(): ResultsBridge {
  shared ??= new ResultsBridge(store);
  return shared;
}

/** For tests: a bridge with a stand-in runner, no WebR. */
export function setResults(bridge: ResultsBridge): void {
  shared?.dispose();
  shared = bridge;
}
