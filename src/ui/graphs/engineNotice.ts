/**
 * What the graph sheet says about a reopened figure whose numbers were
 * recomputed by a newer engine (#46, note 07): still recomputing, every
 * number the same, or which changed and by how much.
 */
import { summaryId } from '@/graphs/data';
import { type NumberChange, changedNumbers, engineName, shown } from '@/io/engineChange';
import type { Id } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { Graph, Project } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';

import type { Baseline } from '../state/session';

export type EngineNotice =
  | { readonly kind: 'waiting'; readonly text: string }
  | { readonly kind: 'same'; readonly text: string }
  | { readonly kind: 'changed'; readonly text: string; readonly changes: readonly string[] };

const SHOW = 8;

export function engineNotice(
  baseline: Baseline | null,
  project: Project,
  graph: Graph,
  engine: EngineInfo,
  current: (id: Id) => ResultEntry | undefined,
): EngineNotice | null {
  // Only for the figure as it was reopened: once its data change, numbers change for other reasons.
  if (baseline?.tables !== project.tables || baseline.analyses !== project.analyses) return null;
  const ids = [summaryId(graph.id), ...graph.analyses].filter((id) => baseline.results.has(id));
  if (ids.length === 0) return null;
  const was = `BarelySig ${baseline.app} (${engineName(baseline.engine)})`;
  const now = `this version (${engineName(engine)})`;
  const changes: string[] = [];
  let count = 0;
  for (const id of ids) {
    const old = baseline.results.get(id);
    const fresh = current(id);
    if (!fresh || fresh.inputHash === old?.inputHash)
      return { kind: 'waiting', text: `Recomputing this figure’s numbers with ${now}…` };
    if (!old?.ok || !fresh.ok) continue;
    const name = id === summaryId(graph.id) ? 'Graph statistics' : project.analyses.get(id)?.title;
    const found: NumberChange[] = changedNumbers(old.value, fresh.value);
    count += found.length;
    for (const c of found)
      changes.push(
        c.old === null && c.now === null
          ? `${name ?? id}: ${c.what} changed`
          : `${name ?? id}: ${c.what} was ${shown(c.old)}, now ${shown(c.now)}`,
      );
  }
  if (count === 0)
    return {
      kind: 'same',
      text: `This figure was made with ${was} and recomputed with ${now}: every number is the same.`,
    };
  return {
    kind: 'changed',
    text: `This figure was made with ${was} and recomputed with ${now}: ${String(count)} ${count === 1 ? 'number differs' : 'numbers differ'} from the exported figure.`,
    changes:
      changes.length > SHOW
        ? [...changes.slice(0, SHOW), `…and ${String(changes.length - SHOW)} more.`]
        : changes,
  };
}
