/**
 * The dependency graph (item 02), derived from references rather than
 * stored: an analysis depends on its input table or analysis, a graph on
 * its source and on the analyses it draws, a layout on its graphs. One
 * source of truth, so edges can never disagree with the nodes.
 *
 *   table ──▶ analysis ──▶ analysis (chained)
 *     │           │
 *     └─────▶ graph ◀────┘         layout ◀── graphs
 *
 * Only analyses can reference analyses, so cycles can only form among
 * them; edits refuse any that would close one (`wouldCycle`).
 */
import type { Id } from './ids';
import type { Analysis, AnalysisInput, Graph, Layout, Project } from './project';

/** What an analysis reads directly. */
export const analysisSource = (input: AnalysisInput): Id =>
  input.kind === 'table' ? input.table : input.analysis;

export function graphDependencies(graph: Graph): Id[] {
  const src = graph.source.kind === 'table' ? graph.source.table : graph.source.analysis;
  return [src, ...graph.analyses.filter((a) => a !== src)];
}

/** Direct dependencies of a node, in a stable order. */
export function dependenciesOf(project: Project, id: Id): Id[] {
  const analysis = project.analyses.get(id);
  if (analysis) return [analysisSource(analysis.input)];
  const graph = project.graphs.get(id);
  if (graph) return graphDependencies(graph);
  const layout = project.layouts.get(id);
  if (layout) return [...layout.graphs];
  return [];
}

/** Direct dependents of a node. */
export function dependentsOf(project: Project, id: Id): Id[] {
  const out: Id[] = [];
  const visit = (nodeId: Id, deps: readonly Id[]): void => {
    if (deps.includes(id)) out.push(nodeId);
  };
  project.analyses.forEach((a: Analysis) => {
    visit(a.id, [analysisSource(a.input)]);
  });
  project.graphs.forEach((g: Graph) => {
    visit(g.id, graphDependencies(g));
  });
  project.layouts.forEach((l: Layout) => {
    visit(l.id, l.graphs);
  });
  return out;
}

/** Everything downstream of a node, transitively (not the node itself). */
export function downstreamOf(project: Project, id: Id): Set<Id> {
  const seen = new Set<Id>();
  const stack = [id];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    for (const d of dependentsOf(project, next)) {
      if (!seen.has(d) && d !== id) {
        seen.add(d);
        stack.push(d);
      }
    }
  }
  return seen;
}

/**
 * Whether giving `analysisId` this input would close a cycle: the input is
 * the analysis itself, or an analysis that already reads from it.
 */
export function wouldCycle(project: Project, analysisId: Id, input: AnalysisInput): boolean {
  if (input.kind !== 'analysis') return false;
  if (input.analysis === analysisId) return true;
  return downstreamOf(project, analysisId).has(input.analysis);
}

/**
 * Analyses in an order that runs every analysis after the one it reads
 * from, otherwise in navigator order. Analyses caught in a cycle (which
 * edits never allow, but a hand-made file might) are left out.
 */
export function analysisOrder(project: Project): Id[] {
  const out: Id[] = [];
  // true / false: placed / left out (in or behind a cycle, or reads a missing analysis).
  const state = new Map<Id, 'visiting' | boolean>();
  const visit = (id: Id): boolean => {
    const s = state.get(id);
    if (s !== undefined) return s === true;
    const a = project.analyses.get(id);
    if (!a) return false;
    state.set(id, 'visiting');
    const ok = a.input.kind === 'table' || visit(a.input.analysis);
    state.set(id, ok);
    if (ok) out.push(id);
    return ok;
  };
  const ordered = [
    ...project.order.analyses,
    ...[...project.analyses.keys()].filter((k) => !project.order.analyses.includes(k)),
  ];
  ordered.forEach((id) => visit(id));
  return out;
}
