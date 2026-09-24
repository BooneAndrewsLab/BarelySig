/**
 * The project (item 02): tables, analyses, graphs and layouts, each stored
 * once and referenced by id. Results are not part of it; they live in a
 * result store keyed by content hash (`recompute.ts`), so an edit never
 * has to touch results by hand.
 *
 * A project is an immutable value. Every edit (`edits.ts`) returns a new
 * one that shares whatever did not change, so undo is a list of past
 * projects and `===` says whether anything changed.
 */
import { type Id, newId } from './ids';
import type { Json } from './json';
import type { Table } from './table';

// --- Analyses ---------------------------------------------------------------

/** Options of each analysis kind, as the analysis dialog sets them. Defaults match Prism's. */
export type AnalysisSpec =
  | { readonly kind: 'descriptive'; readonly options: DescriptiveOptions }
  | { readonly kind: 't-test'; readonly options: TTestOptions };

export type AnalysisKind = AnalysisSpec['kind'];

export type DescriptiveOptions = Readonly<Record<string, never>>;

export interface TTestOptions {
  /** Pair by row (paired t-test) rather than compare independent groups. */
  readonly paired: boolean;
  /** Welch's correction for unequal SDs. Prism's default: off. */
  readonly welch: boolean;
  readonly tails: 'two' | 'one';
}

export const DEFAULT_OPTIONS: {
  readonly [K in AnalysisKind]: Extract<AnalysisSpec, { kind: K }>['options'];
} = {
  descriptive: {},
  't-test': { paired: false, welch: false, tails: 'two' },
};

/** What an analysis reads: data sets of a table, or another analysis's results. */
export type AnalysisInput =
  | { readonly kind: 'table'; readonly table: Id; readonly dataSets: readonly Id[] }
  | { readonly kind: 'analysis'; readonly analysis: Id };

export type Analysis = AnalysisSpec & {
  readonly id: Id;
  readonly title: string;
  readonly input: AnalysisInput;
};

// --- Graphs, layouts, exports (provisional) -----------------------------------
//
// Only what the dependency graph and the file need. Their full shape comes
// with the graph design note (#19, #20) and #43; those extend these types.

/** What a graph plots. */
export type GraphSource =
  | { readonly kind: 'table'; readonly table: Id }
  | { readonly kind: 'analysis'; readonly analysis: Id };

export interface Graph {
  readonly id: Id;
  readonly title: string;
  readonly source: GraphSource;
  /** Analyses whose results the graph draws, e.g. significance brackets. */
  readonly analyses: readonly Id[];
}

export interface Layout {
  readonly id: Id;
  readonly title: string;
  readonly graphs: readonly Id[];
}

/** A frozen figure recipe, kept for every export (#43). */
export interface ExportRecord {
  readonly id: Id;
  readonly graph: Id;
  /** ISO 8601. */
  readonly exportedAt: string;
  readonly recipe: Json;
}

// --- Project ----------------------------------------------------------------

export interface ProjectOrder {
  readonly tables: readonly Id[];
  readonly analyses: readonly Id[];
  readonly graphs: readonly Id[];
  readonly layouts: readonly Id[];
}

export interface Project {
  readonly id: Id;
  readonly name: string;
  readonly tables: ReadonlyMap<Id, Table>;
  readonly analyses: ReadonlyMap<Id, Analysis>;
  readonly graphs: ReadonlyMap<Id, Graph>;
  /** Phase 2; empty for now. */
  readonly layouts: ReadonlyMap<Id, Layout>;
  /** Navigator order per section; the maps themselves are unordered. */
  readonly order: ProjectOrder;
  readonly exports: readonly ExportRecord[];
}

export function createProject(name: string): Project {
  return {
    id: newId('p'),
    name,
    tables: new Map(),
    analyses: new Map(),
    graphs: new Map(),
    layouts: new Map(),
    order: { tables: [], analyses: [], graphs: [], layouts: [] },
    exports: [],
  };
}
