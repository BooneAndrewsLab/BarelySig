/**
 * Experiments (item 08): a data table and everything made from it, the
 * unit the notebook lists and shows as one page. Derived from the
 * dependency graph, never stored.
 */
import { analysisSource } from '@/model/deps';
import type { Id } from '@/model/ids';
import type { Analysis, Graph, Project } from '@/model/project';

import { testName } from '../analysisKinds';
import type { Sheet } from '../state/store';

/** The table an analysis or graph ultimately reads, following chained analyses up. */
export function rootTable(project: Project, id: Id): Id | null {
  const seen = new Set<Id>();
  let at = id;
  while (!seen.has(at)) {
    seen.add(at);
    if (project.tables.has(at)) return at;
    const a = project.analyses.get(at);
    const g = project.graphs.get(at);
    if (a) at = analysisSource(a.input);
    else if (g) at = g.source.kind === 'table' ? g.source.table : g.source.analysis;
    else return null;
  }
  return null;
}

/** The experiment (its table) a sheet belongs to; null for home. */
export function experimentOf(project: Project, sheet: Sheet): Id | null {
  return sheet.kind === 'home' ? null : rootTable(project, sheet.id);
}

export interface Parts {
  readonly analyses: readonly Analysis[];
  readonly graphs: readonly Graph[];
}

/** An experiment's analyses and graphs, each in project order. */
export function partsOf(project: Project, table: Id): Parts {
  const analyses = project.order.analyses.flatMap((id) => {
    const a = project.analyses.get(id);
    return a && a.kind !== 'graph-summary' && rootTable(project, id) === table ? [a] : [];
  });
  const graphs = project.order.graphs.flatMap((id) => {
    const g = project.graphs.get(id);
    return g && rootTable(project, id) === table ? [g] : [];
  });
  return { analyses, graphs };
}

/** One section of an experiment's page, in reading order. */
export type Section =
  | { readonly kind: 'table'; readonly id: Id; readonly title: string }
  | { readonly kind: 'analysis'; readonly id: Id; readonly title: string }
  | { readonly kind: 'graph'; readonly id: Id; readonly title: string };

/** Data first, then the analyses, then the graphs. */
export function sectionsOf(project: Project, table: Id): Section[] {
  const t = project.tables.get(table);
  if (!t) return [];
  const { analyses, graphs } = partsOf(project, table);
  return [
    { kind: 'table', id: t.id, title: 'Data' },
    ...analyses.map((a) => ({ kind: 'analysis' as const, id: a.id, title: a.title })),
    ...graphs.map((g) => ({ kind: 'graph' as const, id: g.id, title: g.title })),
  ];
}

/** The DOM id of a section, so a sheet can be scrolled into view. */
export const sectionDomId = (id: Id): string => `section-${id}`;

/** "One-way ANOVA · 1 graph": what an experiment holds, for the sidebar. */
export function summaryLine(project: Project, table: Id): string {
  const { analyses, graphs } = partsOf(project, table);
  const names = [...new Set(analyses.map((a) => testName(a)))];
  const tests =
    names.length === 0
      ? 'No analysis yet'
      : names.length === 1
        ? (names[0] ?? '')
        : `${String(analyses.length)} analyses`;
  if (graphs.length === 0) return tests;
  return `${tests} · ${graphs.length === 1 ? '1 graph' : `${String(graphs.length)} graphs`}`;
}
