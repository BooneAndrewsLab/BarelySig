/**
 * The statistics engine (item 04): WebR behind a small queue.
 *
 * - Starts on the first job, not at page load.
 * - Runs one job at a time, each in a fresh environment purged afterwards,
 *   so nothing is kept in R between jobs (cancel restarts WebR, note 01).
 * - Every job runs inside R's own `tryCatch`, so R errors and warnings come
 *   back as values; a rejection on the JavaScript side therefore means the
 *   engine itself failed, and it is replaced on the next job.
 * - Analysis R code reports problems with `stop("bs: <message>")`; those
 *   messages reach the user as written.
 */
import type { RObject, WebR } from 'webr';

import { type Plain, type RJs, fromR } from './convert';
import { startWebR } from './webr';

/** An R value to bind: a numeric column (null = NA), or a scalar. */
export type EngineInput = readonly (number | null)[] | number | string | boolean;

export interface EngineJob {
  /** R code evaluated with the inputs bound; its value is the result. */
  readonly code: string;
  readonly inputs: Readonly<Record<string, EngineInput>>;
  /** Packages to load (installed from our own repository on first use). */
  readonly packages: readonly string[];
}

export interface EngineOutput {
  readonly value: Plain;
  /** R warnings raised while running, as R worded them. */
  readonly warnings: readonly string[];
}

export type EngineState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly message: string };

export type EngineErrorKind = 'analysis' | 'cancelled' | 'crashed' | 'internal';

export class EngineError extends Error {
  override readonly name = 'EngineError';
  constructor(
    readonly kind: EngineErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const USER_PREFIX = 'bs: ';

/** Wraps a job's code so R errors and warnings come back as values. */
export function wrap(code: string): string {
  return `local({
  .bs_warnings <- character()
  .bs_out <- tryCatch(
    withCallingHandlers(
      list(ok = TRUE, value = {
${code}
      }),
      warning = function(w) {
        .bs_warnings <<- c(.bs_warnings, conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    ),
    error = function(e) list(ok = FALSE, message = conditionMessage(e))
  )
  .bs_out$warnings <- as.list(.bs_warnings)
  .bs_out
})`;
}

/** The user-facing error for an R error message. */
export function fromRError(message: string): EngineError {
  if (message.startsWith(USER_PREFIX))
    return new EngineError('analysis', message.slice(USER_PREFIX.length));
  return new EngineError(
    'internal',
    `The statistics engine couldn’t run this analysis: ${message}`,
  );
}

export const CRASHED = 'The statistics engine stopped unexpectedly. It restarts on the next run.';
export const CANCELLED = 'Cancelled.';

export class Engine {
  private webR: WebR | null = null;
  private starting: Promise<WebR> | null = null;
  private installed = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private current: EngineState = { kind: 'idle' };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly start: () => Promise<WebR> = () => startWebR()) {}

  get state(): EngineState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs a job after the ones before it. Rejects with `EngineError`. */
  run(job: EngineJob, signal?: AbortSignal): Promise<EngineOutput> {
    const next = this.tail.then(
      () => this.runNow(job, signal),
      () => this.runNow(job, signal),
    );
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Stops WebR; the next job starts a new one. */
  close(): void {
    const w = this.webR;
    this.webR = null;
    this.starting = null;
    this.installed = new Set();
    try {
      w?.close();
    } catch {
      // Already gone.
    }
    this.setState({ kind: 'idle' });
  }

  private setState(s: EngineState): void {
    this.current = s;
    this.listeners.forEach((l) => {
      l();
    });
  }

  private async ready(): Promise<WebR> {
    if (this.webR) return this.webR;
    if (!this.starting) {
      this.setState({ kind: 'starting' });
      this.starting = this.start().then(
        (w) => {
          this.webR = w;
          this.setState({ kind: 'ready' });
          return w;
        },
        (e: unknown) => {
          this.starting = null;
          const message = `The statistics engine couldn’t start: ${e instanceof Error ? e.message : String(e)}`;
          this.setState({ kind: 'failed', message });
          throw new EngineError('crashed', message);
        },
      );
    }
    return this.starting;
  }

  private async runNow(job: EngineJob, signal?: AbortSignal): Promise<EngineOutput> {
    if (signal?.aborted) throw new EngineError('cancelled', CANCELLED);
    let aborted = false;
    const cancelled = new Promise<never>((_, reject) => {
      signal?.addEventListener(
        'abort',
        () => {
          aborted = true;
          // No interrupt without SharedArrayBuffer: restart instead (note 01).
          this.close();
          reject(new EngineError('cancelled', CANCELLED));
        },
        { once: true },
      );
    });
    cancelled.catch(() => undefined);
    const work = this.evaluate(job).catch((e: unknown) => {
      if (aborted) throw new EngineError('cancelled', CANCELLED);
      if (e instanceof EngineError) throw e;
      this.close();
      throw new EngineError('crashed', CRASHED);
    });
    return Promise.race([work, cancelled]);
  }

  private async evaluate(job: EngineJob): Promise<EngineOutput> {
    const webR = await this.ready();
    const missing = job.packages.filter((p) => !this.installed.has(p));
    if (missing.length > 0) {
      await webR.installPackages(missing, { quiet: true });
      missing.forEach((p) => this.installed.add(p));
    }
    const shelter = await new webR.Shelter();
    try {
      const bound: Record<string, RObject> = {};
      for (const [name, v] of Object.entries(job.inputs)) {
        if (typeof v === 'number') bound[name] = await new shelter.RDouble([v]);
        else if (typeof v === 'string') bound[name] = await new shelter.RCharacter([v]);
        else if (typeof v === 'boolean') bound[name] = await new shelter.RLogical([v]);
        else bound[name] = await new shelter.RDouble([...v]);
      }
      const env = await new shelter.REnvironment(bound);
      for (const p of job.packages)
        await shelter.evalR(`suppressPackageStartupMessages(library(${p}))`, { env });
      const result = await shelter.evalR(wrap(job.code), { env });
      const out = fromR((await result.toJs()) as RJs);
      return unwrap(out);
    } finally {
      // Code that assigns globally (`<<-`) must not leave anything for the next job.
      await shelter
        .evalR('rm(list = ls(globalenv(), all.names = TRUE), envir = globalenv())')
        .catch(() => undefined);
      await shelter.purge();
    }
  }
}

function unwrap(out: Plain): EngineOutput {
  if (out === null || typeof out !== 'object' || Array.isArray(out)) {
    throw new EngineError('internal', 'The statistics engine returned something unexpected.');
  }
  const w = out['warnings'];
  const warnings = (Array.isArray(w) ? w : w === null || w === undefined ? [] : [w]).map(String);
  if (out['ok'] === true) return { value: out['value'] ?? null, warnings };
  throw fromRError(typeof out['message'] === 'string' ? out['message'] : 'unknown error');
}
