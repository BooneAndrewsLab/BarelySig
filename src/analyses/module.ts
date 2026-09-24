/**
 * What every analysis module provides (item 04). A module turns an
 * analysis in the project into a typed request (or says, in plain words,
 * why it can't run), the request into an engine job, and the engine's
 * answer into a typed result. Results are JSON, so they can be kept by
 * input hash and saved in the `.bsig`.
 */
import type { EngineJob } from '@/engine/engine';
import type { Plain } from '@/engine/convert';
import type { Analysis, AnalysisKind, Project } from '@/model/project';

export type Prepared<Req> =
  { readonly ok: true; readonly request: Req } | { readonly ok: false; readonly reason: string };

/** `Res` must be plain data (numbers, strings, null, arrays, objects): it is stored as JSON. */
export interface AnalysisModule<K extends AnalysisKind, Req, Res> {
  readonly kind: K;
  /**
   * Bumped whenever the R code or the result's shape changes: part of the
   * input hash, so results computed the old way count as stale.
   */
  readonly version: number;
  /** The R code the module runs, for the fingerprint. */
  readonly code: string;
  prepare(analysis: Extract<Analysis, { kind: K }>, project: Project): Prepared<Req>;
  job(request: Req): EngineJob;
  parse(value: Plain, request: Req, warnings: readonly string[]): Res;
}

/**
 * One module per analysis kind. The methods are bivariant (method syntax),
 * so a module with a specific request type fits.
 */
export type Registry = { readonly [K in AnalysisKind]: AnalysisModule<K, unknown, unknown> };
