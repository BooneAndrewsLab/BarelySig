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
  | { readonly kind: 't-test'; readonly options: TTestOptions }
  | { readonly kind: 'rank-test'; readonly options: RankTestOptions }
  | { readonly kind: 'one-way-anova'; readonly options: OneWayOptions }
  | { readonly kind: 'kruskal-wallis'; readonly options: KruskalWallisOptions }
  | { readonly kind: 'two-way-anova'; readonly options: TwoWayOptions }
  | { readonly kind: 'normality'; readonly options: NormalityOptions };

export type AnalysisKind = AnalysisSpec['kind'];

export type DescriptiveOptions = Readonly<Record<string, never>>;

/** Both tests (D'Agostino-Pearson, Shapiro-Wilk) on every group; nothing to choose (note 06). */
export type NormalityOptions = Readonly<Record<string, never>>;

export interface TTestOptions {
  /** Pair by row (paired t-test) rather than compare independent groups. */
  readonly paired: boolean;
  /** Welch's correction for unequal SDs. Prism's default: off. */
  readonly welch: boolean;
  readonly tails: 'two' | 'one';
}

/** Mann-Whitney (unpaired) or Wilcoxon matched pairs (paired), note 06. */
export interface RankTestOptions {
  readonly paired: boolean;
  readonly tails: 'two' | 'one';
  /** Pairs with no difference: dropped (Wilcoxon's method, Prism's default) or ranked (Pratt's). */
  readonly zeros: 'wilcoxon' | 'pratt';
}

/** Multiple comparisons that assume equal SDs (after ordinary ANOVA), note 06. */
export const EQUAL_SD_ALL = ['tukey', 'bonferroni', 'sidak'] as const;
export const EQUAL_SD_CONTROL = ['dunnett', 'bonferroni', 'sidak'] as const;
/** ... and those that don't (after Welch's ANOVA): each pair's own SDs and df. */
export const WELCH_ALL = ['games-howell', 'dunnett-t3', 'tamhane-t2'] as const;
export const WELCH_CONTROL = ['dunnett-t3', 'tamhane-t2'] as const;

export type AllPairsTest = (typeof EQUAL_SD_ALL)[number] | (typeof WELCH_ALL)[number];
export type ControlTest = (typeof EQUAL_SD_CONTROL)[number] | (typeof WELCH_CONTROL)[number];

/** Which pairs of groups to compare after an ANOVA, and how. */
export type Comparisons =
  | { readonly kind: 'none' }
  | { readonly kind: 'all'; readonly test: AllPairsTest }
  | { readonly kind: 'control'; readonly control: Id; readonly test: ControlTest };

export interface OneWayOptions {
  /** Don't assume equal SDs: Welch's and the Brown-Forsythe ANOVA. Prism's default: off. */
  readonly welch: boolean;
  readonly comparisons: Comparisons;
}

/** Kruskal-Wallis with Dunn's comparisons, note 06. */
export interface KruskalWallisOptions {
  readonly comparisons:
    | { readonly kind: 'none' }
    | { readonly kind: 'all' }
    | { readonly kind: 'control'; readonly control: Id };
  /** Dunn's P multiplied by the number of comparisons (Prism's default), or each on its own. */
  readonly corrected: boolean;
}

/**
 * Which means two-way comparisons compare (note 06): the columns within
 * each row, the rows within each column, the columns' or rows'
 * least-squares means, or every cell with every other.
 */
export const TWO_WAY_FAMILIES = [
  'within-rows',
  'within-columns',
  'main-columns',
  'main-rows',
  'all-cells',
] as const;
export type TwoWayFamily = (typeof TWO_WAY_FAMILIES)[number];

export interface TwoWayOptions {
  readonly family: TwoWayFamily;
  /**
   * Tests that assume equal SDs only. A control is a data set for
   * `within-rows` and `main-columns`, a row for `within-columns` and
   * `main-rows`; `all-cells` has none.
   */
  readonly comparisons: Comparisons;
}

export const DEFAULT_OPTIONS: {
  readonly [K in AnalysisKind]: Extract<AnalysisSpec, { kind: K }>['options'];
} = {
  descriptive: {},
  't-test': { paired: false, welch: false, tails: 'two' },
  'rank-test': { paired: false, tails: 'two', zeros: 'wilcoxon' },
  'one-way-anova': { welch: false, comparisons: { kind: 'all', test: 'tukey' } },
  'kruskal-wallis': { comparisons: { kind: 'all' }, corrected: true },
  'two-way-anova': { family: 'within-rows', comparisons: { kind: 'all', test: 'tukey' } },
  normality: {},
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

// --- Graphs (note 05) ---------------------------------------------------------

/** What a graph plots. Column tables only, for now. */
export type GraphSource =
  | { readonly kind: 'table'; readonly table: Id }
  | { readonly kind: 'analysis'; readonly analysis: Id };

export type ErrorBar = 'sd' | 'sem' | 'ci95' | 'range' | 'none';

export type ColumnPlot =
  | { readonly kind: 'bars'; readonly error: ErrorBar; readonly points: boolean }
  | { readonly kind: 'dots'; readonly center: 'mean' | 'median'; readonly error: ErrorBar };

/**
 * The theme a graph uses: named (follows the app's defaults) or fixed (a
 * resolved theme, as in a figure recipe, which never changes). A fixed
 * theme is kept as plain data here; `src/graphs/theme.ts` reads it.
 */
export type GraphThemeRef =
  | { readonly kind: 'named'; readonly name: 'modern' | 'classic' }
  | { readonly kind: 'fixed'; readonly theme: Json };

export interface GraphFormat {
  /** Value-axis title; unset = the table's value title and unit. */
  readonly yTitle?: string;
  /** Value-axis range; unset = automatic. */
  readonly yMin?: number;
  readonly yMax?: number;
  readonly bracketLabels: 'stars' | 'exact';
  /** Asterisk thresholds; unset = Prism's (up to ****), 'apa' stops at ***. */
  readonly starScheme?: 'apa';
  readonly showNs: boolean;
  /**
   * Brackets the user hid, by key: an analysis id (all of its brackets), or
   * `<analysis>/<data set A>/<data set B>` for one of its comparisons (note 06).
   */
  readonly hiddenBrackets: readonly string[];
}

export interface Graph {
  readonly id: Id;
  readonly title: string;
  readonly source: GraphSource;
  /** Data sets plotted, in order; null = all of the table's, in table order. */
  readonly dataSets: readonly Id[] | null;
  /** Analyses whose results the graph draws, e.g. significance brackets. */
  readonly analyses: readonly Id[];
  readonly plot: ColumnPlot;
  /** The figure's final size, in millimetres. */
  readonly size: { readonly width: number; readonly height: number };
  readonly theme: GraphThemeRef;
  readonly format: GraphFormat;
}

/** A new graph's settings: bars of the mean with SD and the points, 70 × 60 mm, Modern (note 05). */
export const GRAPH_DEFAULTS: Pick<Graph, 'dataSets' | 'plot' | 'size' | 'theme' | 'format'> = {
  dataSets: null,
  plot: { kind: 'bars', error: 'sd', points: true },
  size: { width: 70, height: 60 },
  theme: { kind: 'named', name: 'modern' },
  format: { bracketLabels: 'stars', showNs: true, hiddenBrackets: [] },
};

// --- Layouts, exports (provisional) --------------------------------------------
//
// Only what the dependency graph and the file need; Phase 2 and #43 extend them.

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
  readonly fileName: string;
  readonly format: 'svg' | 'png';
  /** PNG only. */
  readonly dpi: number | null;
  /** Millimetres. */
  readonly size: { readonly width: number; readonly height: number };
  /** The recipe: a `.bsig` document of the figure as it was exported. */
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
