/**
 * Keeping results live (item 02). Results are stored by content: each
 * one records the input hash it was computed from (`inputs.ts`), and a
 * result is shown only when that hash is current. So:
 *
 * - An edit makes results stale without anything noticing it: their hash
 *   simply stops matching.
 * - A slow run that finishes after the data changed stores a result for
 *   its own, old hash. It never overwrites a fresh one, and it is there
 *   again if the user undoes back to that data.
 *
 * `Recompute` runs what is stale, after the edits have paused (debounced),
 * in dependency order, one analysis at a time on the engine. A superseded
 * run is left to finish unless it has been running for `cancelAfterMs`:
 * cancelling means restarting WebR (~2 s, item 01), which only pays off
 * for long runs.
 */
import { analysisOrder } from './deps';
import type { Id } from './ids';
import { type EngineInfo, inputHashes } from './inputs';
import type { Json } from './json';
import type { Analysis, Project } from './project';

export type ResultEntry =
  | { readonly inputHash: string; readonly ok: true; readonly value: Json }
  /** A plain-language message for the results sheet. */
  | { readonly inputHash: string; readonly ok: false; readonly error: string };

/** Results for the last few input hashes of each analysis, newest first. */
export class ResultStore {
  static readonly KEEP = 8;
  private readonly byAnalysis = new Map<Id, ResultEntry[]>();

  get(analysis: Id, inputHash: string): ResultEntry | undefined {
    return this.byAnalysis.get(analysis)?.find((e) => e.inputHash === inputHash);
  }

  /** The newest result, whatever its input. */
  latest(analysis: Id): ResultEntry | undefined {
    return this.byAnalysis.get(analysis)?.[0];
  }

  put(analysis: Id, entry: ResultEntry): void {
    const rest = (this.byAnalysis.get(analysis) ?? []).filter(
      (e) => e.inputHash !== entry.inputHash,
    );
    this.byAnalysis.set(analysis, [entry, ...rest].slice(0, ResultStore.KEEP));
  }

  forget(analysis: Id, inputHash?: string): void {
    if (inputHash === undefined) {
      this.byAnalysis.delete(analysis);
      return;
    }
    const rest = (this.byAnalysis.get(analysis) ?? []).filter((e) => e.inputHash !== inputHash);
    this.byAnalysis.set(analysis, rest);
  }
}

export type NodeState = 'fresh' | 'stale' | 'running' | 'error' | 'blocked';

export interface NodeStatus {
  readonly state: NodeState;
  /** Why, in plain language, for `error` and `blocked`. */
  readonly message?: string;
}

export interface Job {
  readonly analysis: Analysis;
  readonly inputHash: string;
  /** The project as it was when the job started. */
  readonly project: Project;
  /** The upstream analysis's result, for a chained analysis. */
  readonly upstream: Json | null;
}

/**
 * Computes one analysis. Rejecting gives an error result: the message
 * should be plain language (the analysis module's job). When `signal`
 * aborts, the runner stops as soon as it can; its outcome is ignored.
 */
export type Runner = (job: Job, signal: AbortSignal) => Promise<Json>;

export interface RecomputeOptions {
  readonly runner: Runner;
  readonly engine: EngineInfo;
  /** Why an analysis cannot run on its input as it stands (e.g. a paired test on summary data), or null. */
  readonly check?: (analysis: Analysis, project: Project) => string | null;
  readonly debounceMs?: number;
  readonly cancelAfterMs?: number;
  /** Called whenever a status or result may have changed. */
  readonly onChange?: () => void;
  readonly results?: ResultStore;
}

interface Running {
  readonly id: Id;
  readonly hash: string;
  readonly started: number;
  readonly abort: AbortController;
  cancelTimer?: ReturnType<typeof setTimeout>;
}

export class Recompute {
  readonly results: ResultStore;
  private project: Project | null = null;
  private hashes = new Map<Id, string | null>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Running | null = null;
  private pumping = false;
  private disposed = false;
  private waiters: (() => void)[] = [];
  private readonly debounceMs: number;
  private readonly cancelAfterMs: number;

  constructor(private readonly opts: RecomputeOptions) {
    this.results = opts.results ?? new ResultStore();
    this.debounceMs = opts.debounceMs ?? 300;
    this.cancelAfterMs = opts.cancelAfterMs ?? 3000;
  }

  /** The project after an edit. Statuses update at once; runs start once edits pause. */
  setProject(project: Project): void {
    if (project === this.project) return;
    this.project = project;
    this.hashes = inputHashes(project, this.opts.engine);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.pump();
    }, this.debounceMs);
    this.superseded();
    this.changed();
  }

  /** Runs what is stale now, without waiting for the debounce (e.g. on opening a file). */
  flush(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    void this.pump();
  }

  inputHash(id: Id): string | null {
    return this.hashes.get(id) ?? null;
  }

  /** The analysis's current result, if it has one for its current input. */
  result(id: Id): ResultEntry | undefined {
    const h = this.hashes.get(id);
    return h == null ? undefined : this.results.get(id, h);
  }

  /**
   * The last result there was, current or not: shown faded while a new one
   * is calculated, never as if current (item 11).
   */
  previous(id: Id): ResultEntry | undefined {
    return this.result(id) ?? this.results.latest(id);
  }

  /** Every current result, e.g. for saving with the project. */
  currentResults(): Map<Id, ResultEntry> {
    const out = new Map<Id, ResultEntry>();
    this.hashes.forEach((_, id) => {
      const r = this.result(id);
      if (r) out.set(id, r);
    });
    return out;
  }

  status(id: Id): NodeStatus {
    const project = this.project;
    const a = project?.analyses.get(id);
    if (!project || !a) return { state: 'blocked', message: 'This analysis no longer exists.' };
    const hash = this.hashes.get(id) ?? null;
    if (hash === null)
      return { state: 'blocked', message: 'The data this analysis reads no longer exists.' };
    const r = this.results.get(id, hash);
    if (r) return r.ok ? { state: 'fresh' } : { state: 'error', message: r.error };
    if (a.input.kind === 'analysis') {
      const up = this.status(a.input.analysis);
      if (up.state === 'error' || up.state === 'blocked') {
        return { state: 'blocked', message: 'The analysis this one reads from has a problem.' };
      }
      if (up.state !== 'fresh') return { state: 'stale' };
    }
    const why = this.opts.check?.(a, project) ?? null;
    if (why !== null) return { state: 'blocked', message: why };
    if (this.running?.id === id && this.running.hash === hash) return { state: 'running' };
    return { state: 'stale' };
  }

  /** A graph is as good as the worst of the analyses it draws or plots. */
  graphStatus(id: Id): NodeStatus {
    const g = this.project?.graphs.get(id);
    if (!g) return { state: 'blocked', message: 'This graph no longer exists.' };
    const ids = [...(g.source.kind === 'analysis' ? [g.source.analysis] : []), ...g.analyses];
    const rank: Readonly<Record<NodeState, number>> = {
      fresh: 0,
      stale: 1,
      running: 2,
      error: 3,
      blocked: 4,
    };
    let worst: NodeStatus = { state: 'fresh' };
    for (const a of ids) {
      const s = this.status(a);
      if (rank[s.state] > rank[worst.state]) worst = s;
    }
    return worst;
  }

  /**
   * Stops an analysis the user doesn't want to wait for: its current input
   * gets `message` as its result (so it isn't rerun at once), and a run in
   * progress is cancelled. `retry` runs it again.
   */
  stop(id: Id, message: string): void {
    const h = this.hashes.get(id);
    if (h == null) return;
    this.results.put(id, { inputHash: h, ok: false, error: message });
    if (this.running?.id === id) this.running.abort.abort();
    this.changed();
  }

  /** Forgets an error so the analysis runs again (e.g. after the engine was restarted). */
  retry(id: Id): void {
    const h = this.hashes.get(id);
    if (h == null) return;
    const r = this.results.get(id, h);
    if (r && !r.ok) this.results.forget(id, h);
    this.flush();
  }

  /** Resolves once nothing is pending or running. */
  idle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.running) {
      clearTimeout(this.running.cancelTimer);
      this.running.abort.abort();
    }
    this.settle();
  }

  // --- internals --------------------------------------------------------------

  /** Read through a method: `dispose()` can run while `pump()` awaits. */
  private alive(): boolean {
    return !this.disposed;
  }

  private isIdle(): boolean {
    return this.disposed || (this.timer === undefined && this.running === null && !this.pumping);
  }

  private changed(): void {
    this.opts.onChange?.();
    this.settle();
  }

  private settle(): void {
    if (!this.isIdle()) return;
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => {
      f();
    });
  }

  /** If the running job's input is no longer current, cancel it once it has run long enough. */
  private superseded(): void {
    const run = this.running;
    if (!run || this.hashes.get(run.id) === run.hash || run.cancelTimer !== undefined) return;
    const wait = Math.max(0, run.started + this.cancelAfterMs - Date.now());
    run.cancelTimer = setTimeout(() => {
      if (this.running === run && this.hashes.get(run.id) !== run.hash) run.abort.abort();
    }, wait);
  }

  private nextJob(): Job | null {
    const project = this.project;
    if (!project) return null;
    for (const id of analysisOrder(project)) {
      if (this.status(id).state !== 'stale') continue;
      const a = project.analyses.get(id);
      const hash = this.hashes.get(id);
      if (!a || hash == null) continue;
      let upstream: Json | null = null;
      if (a.input.kind === 'analysis') {
        const up = this.result(a.input.analysis);
        if (!up?.ok) continue;
        upstream = up.value;
      }
      return { analysis: a, inputHash: hash, project, upstream };
    }
    return null;
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    try {
      // Stop when edits resume: the debounce timer will pump again.
      for (
        let job = this.nextJob();
        job && this.timer === undefined && this.alive();
        job = this.nextJob()
      ) {
        await this.run(job);
      }
    } finally {
      this.pumping = false;
      this.changed();
    }
  }

  private async run(job: Job): Promise<void> {
    const run: Running = {
      id: job.analysis.id,
      hash: job.inputHash,
      started: Date.now(),
      abort: new AbortController(),
    };
    this.running = run;
    this.changed();
    let entry: ResultEntry | null;
    try {
      const value = await this.opts.runner(job, run.abort.signal);
      entry = { inputHash: job.inputHash, ok: true, value };
    } catch (e: unknown) {
      entry = {
        inputHash: job.inputHash,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    clearTimeout(run.cancelTimer);
    this.running = null;
    // An aborted run's outcome is not a result; it runs again if its input comes back.
    if (!run.abort.signal.aborted && !this.disposed) this.results.put(job.analysis.id, entry);
    this.changed();
  }
}
