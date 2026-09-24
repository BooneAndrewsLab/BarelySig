/**
 * `runAnalysis` and its wiring into `Recompute` (item 04): the check that
 * tells the navigator why an analysis can't run, the runner that runs it
 * on the engine, and the engine fingerprint that includes each module's
 * code.
 */
import { type Engine, EngineError } from '@/engine/engine';
import { hashString } from '@/model/json';
import type { EngineInfo } from '@/model/inputs';
import type { Json } from '@/model/json';
import type { Analysis, Project } from '@/model/project';
import type { Runner } from '@/model/recompute';

import type { Registry } from './module';

/** Runs one analysis of the project; rejects with a plain-language message. */
export async function runAnalysis(
  engine: Engine,
  registry: Registry,
  analysis: Analysis,
  project: Project,
  signal?: AbortSignal,
): Promise<Json> {
  const mod = registry[analysis.kind];
  const prepared = mod.prepare(analysis as never, project);
  if (!prepared.ok) throw new EngineError('analysis', prepared.reason);
  const out = await engine.run(mod.job(prepared.request), signal);
  return mod.parse(out.value, prepared.request, out.warnings);
}

export const makeRunner =
  (engine: Engine, registry: Registry): Runner =>
  (job, signal) =>
    runAnalysis(engine, registry, job.analysis, job.project, signal);

/** Why an analysis can't run on its input as it stands, or null. */
export function makeCheck(
  registry: Registry,
): (analysis: Analysis, project: Project) => string | null {
  return (analysis, project) => {
    const prepared = registry[analysis.kind].prepare(analysis as never, project);
    return prepared.ok ? null : prepared.reason;
  };
}

/** The engine pin plus a fingerprint of every module's code and result version. */
export function withCode(engine: EngineInfo, registry: Registry): EngineInfo {
  const code: Record<string, string> = {};
  for (const mod of Object.values(registry))
    code[mod.kind] = hashString(`${String(mod.version)}\n${mod.code}`);
  return { ...engine, code };
}
