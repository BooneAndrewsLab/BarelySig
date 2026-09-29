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
  | { readonly kind: 'nested-descriptive'; readonly options: NestedDescriptiveOptions }
  | { readonly kind: 't-test'; readonly options: TTestOptions }
  | { readonly kind: 'nested-t-test'; readonly options: NestedTTestOptions }
  | { readonly kind: 'nested-one-way-anova'; readonly options: NestedOneWayOptions }
  | { readonly kind: 'nested-repeated-anova'; readonly options: RepeatedMeasuresOptions }
  | { readonly kind: 'rank-test'; readonly options: RankTestOptions }
  | { readonly kind: 'one-way-anova'; readonly options: OneWayOptions }
  | { readonly kind: 'kruskal-wallis'; readonly options: KruskalWallisOptions }
  | { readonly kind: 'two-way-anova'; readonly options: TwoWayOptions }
  | { readonly kind: 'repeated-measures-anova'; readonly options: RepeatedMeasuresOptions }
  | { readonly kind: 'repeated-two-way-anova'; readonly options: RepeatedTwoWayOptions }
  | {
      readonly kind: 'repeated-two-way-anova-both';
      readonly options: RepeatedTwoWayBothOptions;
    }
  | { readonly kind: 'friedman'; readonly options: FriedmanOptions }
  | { readonly kind: 'normality'; readonly options: NormalityOptions }
  | { readonly kind: 'nested-normality'; readonly options: NestedNormalityOptions }
  | { readonly kind: 'paired-normality'; readonly options: PairedNormalityOptions }
  | { readonly kind: 'contingency-chi-square'; readonly options: ContingencyChiSquareOptions }
  | { readonly kind: 'contingency-fisher'; readonly options: ContingencyFisherOptions }
  | { readonly kind: 'correlation'; readonly options: CorrelationOptions }
  | { readonly kind: 'linear-regression'; readonly options: LinearRegressionOptions }
  | { readonly kind: 'nonlinear-regression'; readonly options: NonlinearRegressionOptions }
  | { readonly kind: 'growth-curve'; readonly options: GrowthCurveOptions }
  /** Internal: a graph's statistics (note 07), never listed or saved as an analysis. */
  | { readonly kind: 'graph-summary'; readonly options: GraphSummaryOptions };

export type AnalysisKind = AnalysisSpec['kind'];

/** The kinds a user adds from the Analyze dialog (every kind but the internal graph summary). */
export type UserAnalysisKind = Exclude<AnalysisKind, 'graph-summary'>;
export type UserAnalysisSpec = Exclude<AnalysisSpec, { readonly kind: 'graph-summary' }>;

export type DescriptiveOptions = Readonly<Record<string, never>>;

/** Descriptive statistics of a Nested table (item 25, #75). Nothing to choose. */
export type NestedDescriptiveOptions = Readonly<Record<string, never>>;

/** Both tests (D'Agostino-Pearson, Shapiro-Wilk) on every group; nothing to choose (note 06). */
export type NormalityOptions = Readonly<Record<string, never>>;

/**
 * The same two tests, run once per group on its replicate means rather
 * than on every individual value (item 26, #77): what the matched nested
 * t test, matched nested one-way ANOVA and nested-descriptive's group
 * summary actually assume. Nothing to choose.
 */
export type NestedNormalityOptions = Readonly<Record<string, never>>;

/**
 * The same two tests, run once on a paired t test's row-by-row differences
 * rather than on each group (item 18, #53): the paired t test assumes the
 * differences are Gaussian, not the groups themselves. Nothing to choose.
 */
export type PairedNormalityOptions = Readonly<Record<string, never>>;

/**
 * Chi-square test of independence on a Contingency table (item 28, #39):
 * `chisq.test(m, correct = TRUE)`, Prism's default (Yates' continuity
 * correction, which R applies only to a 2×2 table). Nothing to choose.
 */
export type ContingencyChiSquareOptions = Readonly<Record<string, never>>;

/**
 * Fisher's exact test on a Contingency table (item 28, #39):
 * `fisher.test(m)`, two-tailed, any r×c size R's own function handles.
 * Nothing to choose.
 */
export type ContingencyFisherOptions = Readonly<Record<string, never>>;

/**
 * Pearson or Spearman correlation of an XY table's Y data sets against
 * its shared X (item 29, #38), one method per analysis (Prism's own
 * dialog picks one at a time too). No CI for Spearman: rho's sampling
 * distribution has no closed form the way Pearson's Fisher z-transform
 * gives one, and Prism doesn't offer one either.
 */
export interface CorrelationOptions {
  readonly method: 'pearson' | 'spearman';
}

/**
 * Simple linear regression of an XY table's Y data sets against its
 * shared X (item 29, #38): slope, intercept, R², residuals and a runs
 * test for lack of fit, `lm(y ~ x)`. Nothing to choose.
 */
export type LinearRegressionOptions = Readonly<Record<string, never>>;

/**
 * The dose-response models (item 37, #95), Prism's names: agonist or
 * inhibitor (the same curve; only the potency is called EC50 or IC50),
 * variable or standard (HillSlope held at ±1) slope, and raw or normalized
 * (Bottom = 0, Top = 100) response.
 */
export const DOSE_RESPONSE_MODEL_IDS = [
  'log-agonist-variable-slope',
  'log-agonist-standard-slope',
  'log-agonist-normalized-variable-slope',
  'log-agonist-normalized-standard-slope',
  'log-inhibitor-variable-slope',
  'log-inhibitor-standard-slope',
  'log-inhibitor-normalized-variable-slope',
  'log-inhibitor-normalized-standard-slope',
] as const;
export type DoseResponseModelId = (typeof DOSE_RESPONSE_MODEL_IDS)[number];

/**
 * A dose-response curve fit (item 32, #37; models item 37, #95). `model`
 * fixes some parameters (a standard slope, a normalized response) on top of
 * the user's own constraints; `x` says whether the table's X is already
 * log10(dose) (Prism's model) or a dose the fit logs.
 */
export interface NonlinearRegressionOptions {
  readonly model: DoseResponseModelId;
  readonly x: 'log' | 'concentration';
  /** What to do with each curve parameter (item 35, #96): estimate it, hold it at a constant, or keep it inside limits. */
  readonly bottom: ParameterConstraint;
  readonly top: ParameterConstraint;
  readonly hillSlope: ParameterConstraint;
  /** Compare the fit with a simpler model (item 36, #98); null = just fit. */
  readonly compare: SimplerModel | null;
  /**
   * Compare the fit with a different model, or with the same fit with shared
   * parameters unshared (item 39, #105); null = no such comparison. Not
   * combined with `compare`.
   */
  readonly compareWith: ComparisonWith | null;
  /** The F test's cut-off for preferring the more complex model (item 39, #105); Prism's default 0.05. */
  readonly compareAlpha: number;
  /** Parameters that take one value for every chosen data set (item 38, #97); all false = independent fits. */
  readonly shared: SharedParameters;
  /** How much each point counts in the fit (item 40, #100); Prism's default is none. */
  readonly weighting: WeightingId;
  /** Read the unknown Y values (rows with a Y but no X) off the fitted curve (item 40, #100). */
  readonly interpolate: boolean;
  /**
   * How the parameters' 95% CIs are found (item 41, #99): asymptotic
   * (symmetric) or profile likelihood (Prism's default, not ours: note 41).
   */
  readonly ci: CiMethod;
}

export const CI_METHODS = ['wald', 'profile'] as const;
export type CiMethod = (typeof CI_METHODS)[number];

/**
 * Weights for the least-squares fit (item 40, #100): none, 1/Y or 1/Y² (Y
 * being the fitted curve's), 1/X or 1/X², or 1/SD² of the replicates at each X.
 */
export const WEIGHTING_IDS = ['none', 'y', 'y2', 'x', 'x2', 'sd2'] as const;
export type WeightingId = (typeof WEIGHTING_IDS)[number];

/**
 * Which curve parameters are shared across the Y data sets of a global fit
 * (item 38, #97): estimated once from all the data sets together instead of
 * once per data set. A parameter that is held at a constant has nothing to share.
 */
export type SharedParameters = Readonly<{
  bottom: boolean;
  top: boolean;
  hillSlope: boolean;
  logEc50: boolean;
}>;

/**
 * What a fit is compared with besides a simpler model made by holding values
 * (item 39, #105): another of the dose-response models fitted to the same
 * data, or (for two or more data sets) the same fit with these of its shared
 * parameters unshared, "does the EC50 differ between the data sets?".
 */
export type ComparisonWith =
  | { readonly kind: 'model'; readonly model: DoseResponseModelId }
  | { readonly kind: 'sharing'; readonly test: SharedParameters };

/**
 * The simpler model a dose-response fit is compared with (item 36, #98):
 * the same curve with these parameters held at a constant (null = still
 * estimated). Only a parameter the fit itself estimates freely can be held
 * here, so the simpler model is always nested in the fit.
 */
export type SimplerModel = Readonly<{
  bottom: number | null;
  top: number | null;
  hillSlope: number | null;
}>;

/**
 * A curve parameter's constraint (item 35, #96): `free` is estimated from
 * the data, `fixed` is held at a constant (Prism's "constant equal to"),
 * `bounded` is estimated but kept above `lower` and/or below `upper`
 * (null = no limit on that side; at least one is set).
 */
export type ParameterConstraint =
  | { readonly kind: 'free' }
  | { readonly kind: 'fixed'; readonly value: number }
  | { readonly kind: 'bounded'; readonly lower: number | null; readonly upper: number | null };

/**
 * A growth curve fit (item 33, #94): Zwietering's reparameterized
 * Gompertz growth model, with lag/exponential/stationary phases read off
 * the fit. One model so far.
 */
export interface GrowthCurveOptions {
  readonly model: 'gompertz';
}

/** Box-plot whiskers, as Prism offers them (note 07). */
export const WHISKERS = ['min-max', 'tukey', 'p10-90', 'p5-95', 'p2.5-97.5', 'p1-99'] as const;
export type Whiskers = (typeof WHISKERS)[number];

export interface GraphSummaryOptions {
  /** Box plots: where the whiskers end; null = no box. */
  readonly whiskers: Whiskers | null;
  /** Violins: smoothing (× Silverman's bandwidth), on log₁₀ values for a log axis; null = no violin. */
  readonly kde: { readonly adjust: number; readonly log: boolean } | null;
}

export interface TTestOptions {
  /** Pair by row (paired t-test) rather than compare independent groups. */
  readonly paired: boolean;
  /** Welch's correction for unequal SDs. Prism's default: off. */
  readonly welch: boolean;
  readonly tails: 'two' | 'one';
}

/**
 * Nested t test (item 13): a REML mixed model over a Nested table's two
 * groups and their biological replicates. No Welch variant: the model
 * already separates between- and within-replicate variance.
 */
export interface NestedTTestOptions {
  readonly tails: 'two' | 'one';
  /**
   * Replicate n is the same experiment in both groups (note 14): a paired t
   * test on the replicate means, as Lord et al. 2020 compute a SuperPlot's P.
   */
  readonly matched: boolean;
}

/**
 * Comparisons after a nested one-way ANOVA (item 13): the same tests as
 * an ordinary (equal-SD) ANOVA's — no Welch-style variant, since the
 * mixed model already separates between- and within-replicate variance.
 */
export type NestedComparisons =
  | { readonly kind: 'none' }
  | { readonly kind: 'all'; readonly test: (typeof EQUAL_SD_ALL)[number] }
  | {
      readonly kind: 'control';
      readonly control: Id;
      readonly test: (typeof EQUAL_SD_CONTROL)[number];
    };

export interface NestedOneWayOptions {
  readonly comparisons: NestedComparisons;
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

/**
 * Repeated-measures one-way ANOVA (item 17, #50): a Column table paired
 * by row, with the Geisser-Greenhouse correction. Comparisons are the
 * equal-SD family only (`NestedComparisons`): Tukey, Dunnett, Šidák or
 * Bonferroni, computed one of two ways (FAQ 1609, item 17's #83 follow-up,
 * `assumeSphericity`) -- against the ANOVA's own pooled residual MS and df
 * ("the traditional method", default, matching #50's shipped behaviour),
 * or each pairwise comparison from just its own two groups, exactly the
 * SE and df an ordinary paired t test would give ("the new method", no
 * sphericity assumed). No Welch-style variant either way.
 */
export interface RepeatedMeasuresOptions {
  readonly comparisons: NestedComparisons;
  /** True: the pooled/traditional method (default). False: FAQ 1609's method that doesn't assume sphericity. */
  readonly assumeSphericity: boolean;
}

/**
 * Comparisons after repeated-measures two-way ANOVA (note 24, #85): which
 * levels to compare, and against which error term (a different stratum
 * per family, note 24's own reason for splitting this off from note 22).
 * `main-between` and `main-repeated` compare marginal means (one family,
 * no natural "level" to group by, same as `TwoWayOptions`'
 * `main-columns`/`main-rows`); `simple` compares the between-subjects
 * factor's levels within one repeated level at a time (one family per
 * repeated level, the same shape as `within-rows`/`within-columns`).
 */
export const REPEATED_TWO_WAY_FAMILIES = ['main-between', 'main-repeated', 'simple'] as const;
export type RepeatedTwoWayFamily = (typeof REPEATED_TWO_WAY_FAMILIES)[number];

/**
 * Repeated-measures two-way ANOVA, one factor repeated (note 22, #81): a
 * Grouped table, subject = subcolumn position, matched across the
 * repeated factor's levels; the other factor is between-subjects.
 * Comparisons (note 24, #85) are the equal-SD family only
 * (`NestedComparisons`): no Welch-style variant in any family, since
 * every family's error term already comes from the ANOVA's own fitted
 * decomposition, not raw per-group variances.
 */
export interface RepeatedTwoWayOptions {
  /** Which Grouped-table factor is matched by subcolumn position; the other is between-subjects. */
  readonly repeatedFactor: 'row' | 'column';
  readonly family: RepeatedTwoWayFamily;
  /**
   * `control`'s `Id` refers to whichever factor's levels the chosen
   * family compares: a between-subjects level for `main-between` and
   * `simple`, a repeated level for `main-repeated` (the same
   * context-dependent-`Id` convention `TwoWayOptions.comparisons.control`
   * already uses).
   */
  readonly comparisons: NestedComparisons;
}

/**
 * Repeated-measures two-way ANOVA, both factors repeated (note 23, #84):
 * a Grouped table, subcolumn position is the subject, every subject
 * measured at every row × column cell — no between-subjects factor at
 * all, so unlike `RepeatedTwoWayOptions` there is nothing to choose.
 */
export type RepeatedTwoWayBothOptions = Readonly<Record<string, never>>;

/**
 * Matched nested one-way ANOVA (note 21, #71): note 14's matched nested t
 * test, generalized past two groups. Replicate n is the same experiment in
 * every group, so it is exactly a repeated-measures ANOVA (above) on each
 * group's replicate means; same options, same shape of result, nested
 * wording. No Welch-style variant, as neither nested analysis has one.
 */

/** The Friedman test with Dunn's comparisons (item 17, #50): the nonparametric matched test. */
export interface FriedmanOptions {
  readonly comparisons:
    | { readonly kind: 'none' }
    | { readonly kind: 'all' }
    | { readonly kind: 'control'; readonly control: Id };
  /** Dunn's P multiplied by the number of comparisons (Prism's default), or each on its own. */
  readonly corrected: boolean;
}

export const DEFAULT_OPTIONS: {
  readonly [K in AnalysisKind]: Extract<AnalysisSpec, { kind: K }>['options'];
} = {
  descriptive: {},
  'nested-descriptive': {},
  't-test': { paired: false, welch: false, tails: 'two' },
  'nested-t-test': { tails: 'two', matched: false },
  'nested-one-way-anova': { comparisons: { kind: 'all', test: 'tukey' } },
  'nested-repeated-anova': { comparisons: { kind: 'all', test: 'tukey' }, assumeSphericity: true },
  'rank-test': { paired: false, tails: 'two', zeros: 'wilcoxon' },
  'one-way-anova': { welch: false, comparisons: { kind: 'all', test: 'tukey' } },
  'kruskal-wallis': { comparisons: { kind: 'all' }, corrected: true },
  'two-way-anova': { family: 'within-rows', comparisons: { kind: 'all', test: 'tukey' } },
  'repeated-measures-anova': {
    comparisons: { kind: 'all', test: 'tukey' },
    assumeSphericity: true,
  },
  friedman: { comparisons: { kind: 'all' }, corrected: true },
  'repeated-two-way-anova': {
    repeatedFactor: 'column',
    family: 'simple',
    comparisons: { kind: 'all', test: 'tukey' },
  },
  'repeated-two-way-anova-both': {},
  normality: {},
  'nested-normality': {},
  'paired-normality': {},
  'contingency-chi-square': {},
  'contingency-fisher': {},
  correlation: { method: 'pearson' },
  'linear-regression': {},
  'nonlinear-regression': {
    model: 'log-agonist-variable-slope',
    x: 'log',
    bottom: { kind: 'free' },
    top: { kind: 'free' },
    hillSlope: { kind: 'free' },
    compare: null,
    compareWith: null,
    compareAlpha: 0.05,
    shared: { bottom: false, top: false, hillSlope: false, logEc50: false },
    weighting: 'none',
    interpolate: false,
    ci: 'wald',
  },
  'growth-curve': { model: 'gompertz' },
  'graph-summary': { whiskers: null, kde: null },
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
  | {
      readonly kind: 'dots';
      readonly center: 'mean' | 'median';
      readonly error: ErrorBar;
      /** A SuperPlot (item 13): points coloured by biological replicate, its mean overlaid. Nested tables only. */
      readonly colorByReplicate?: boolean | undefined;
    }
  | {
      readonly kind: 'box';
      readonly whiskers: Whiskers;
      /** Points on top: none, those beyond the whiskers, or every value. */
      readonly points: 'none' | 'outliers' | 'all';
    }
  | {
      readonly kind: 'violin';
      /** Inside the violin: median and quartile lines, a thin box, the points, or nothing. */
      readonly inner: 'quartiles' | 'box' | 'points' | 'none';
      /** × Silverman's bandwidth; 1 = as the rule gives it. */
      readonly smoothing: number;
    };

/** What a graph of a Grouped table plots (note 07). */
export interface GroupedPlot {
  readonly kind: 'grouped-bars';
  /**
   * Interleaved: a cluster per row, a bar per data set in it (Prism's
   * default). Separated: a cluster per data set, a bar per row.
   */
  readonly arrangement: 'interleaved' | 'separated';
  readonly error: ErrorBar;
  readonly points: boolean;
}

export type XyStyle = 'scatter' | 'lines' | 'traces';
export const XY_STYLES: readonly XyStyle[] = ['scatter', 'lines', 'traces'];

/** The spread the `traces` style shades around its mean line (item 42, #104). */
export type XyError = 'none' | 'sd' | 'sem' | 'ci95';
export const XY_ERRORS: readonly XyError[] = ['none', 'sd', 'sem', 'ci95'];

/** What a graph of an XY table plots (item 31, #87). */
export interface XyPlot {
  readonly kind: 'xy-scatter';
  /**
   * How each data set is drawn (item 34, #93): `scatter` the points alone, `lines` the mean
   * Y at each X joined in X order, `traces` one thin line per replicate subcolumn plus the mean line.
   */
  readonly style: XyStyle;
  /** Show each series' (x, y) points. */
  readonly points: boolean;
  /** Draw the fitted line from this graph's linear-regression analysis (graph.analyses[0]), if it has one. */
  readonly fit: boolean;
  /** Band around the fit; meaningless (ignored) unless fit is true. */
  readonly band: 'confidence' | 'prediction' | 'none';
  /**
   * A band of mean ± this around the `traces` style's mean line (item 42, #104); ignored for the
   * other styles.
   */
  readonly error: XyError;
}

/**
 * A graph's plot: Column-table plots, grouped bars for a Grouped table, or
 * an XY scatter for an XY table.
 */
export type GraphPlot = ColumnPlot | GroupedPlot | XyPlot;

/** The plots that draw error bars. */
export const hasErrorBars = (
  plot: GraphPlot,
): plot is Extract<GraphPlot, { kind: 'bars' | 'dots' | 'grouped-bars' }> =>
  plot.kind === 'bars' || plot.kind === 'dots' || plot.kind === 'grouped-bars';

/** A new grouped graph's plot: interleaved bars of the mean with SD and the points. */
export const GROUPED_DEFAULT: GroupedPlot = {
  kind: 'grouped-bars',
  arrangement: 'interleaved',
  error: 'sd',
  points: true,
};

/** A new XY graph's plot: points only; a fitted line is a separate step (note 29's framing). */
export const XY_DEFAULT: XyPlot = {
  kind: 'xy-scatter',
  style: 'scatter',
  points: true,
  fit: false,
  band: 'none',
  error: 'none',
};

/**
 * A new Nested table's graph: a SuperPlot (item 13) — points coloured by replicate, its mean
 * overlaid, and the mean ± SEM of the replicate means, as Lord et al. 2020 draw it.
 */
export const NESTED_DEFAULT: ColumnPlot = {
  kind: 'dots',
  center: 'mean',
  error: 'sem',
  colorByReplicate: true,
};

/**
 * The theme a graph uses: named (follows the app's defaults) or fixed (a
 * resolved theme, as in a figure recipe, which never changes). A fixed
 * theme is kept as plain data here; `src/graphs/theme.ts` reads it.
 */
export type GraphThemeRef =
  | { readonly kind: 'named'; readonly name: 'modern' | 'classic' }
  | { readonly kind: 'fixed'; readonly theme: Json };

/**
 * Theme values a graph can override (note 07), as paths into
 * `GraphTheme`. The codec writes them in this order.
 */
export const STYLE_NUMBERS = [
  'font.tick',
  'font.axisTitle',
  'font.title',
  'font.bracket',
  'font.legend',
  'lines.axis',
  'lines.tick',
  'lines.tickLength',
  'lines.error',
  'lines.barEdge',
  'lines.bracket',
  'lines.pointEdge',
  'lines.fit',
  'pointSize',
  'pointOpacity',
  'barWidth',
  'barLighten',
  'capWidth',
  'bandOpacity',
] as const;
export type StyleNumber = (typeof STYLE_NUMBERS)[number];

export type StyleOverrides = Readonly<Partial<Record<StyleNumber, number>>> & {
  readonly ticks?: 'in' | 'out';
  readonly spines?: 'left-bottom' | 'box';
};

export const POINT_SYMBOLS = ['circle', 'square', 'triangle', 'diamond'] as const;
export type PointSymbol = (typeof POINT_SYMBOLS)[number];

export interface GraphFormat {
  /** Value-axis title; unset = the table's value title and unit. */
  readonly yTitle?: string;
  /** Value-axis range; unset = automatic. */
  readonly yMin?: number;
  readonly yMax?: number;
  /** Logarithmic value axis (base 10); unset = linear. */
  readonly yScale?: 'log10';
  /** Major tick interval of a linear axis; unset = automatic. */
  readonly yStep?: number;
  /** Decimals of the tick labels; unset = what the tick interval needs. */
  readonly yDecimals?: number;
  /**
   * Group labels turned by this many degrees; unset = automatic (level,
   * wrapped at spaces or underscores, turned only if that would still
   * overlap, note 12).
   */
  readonly xAngle?: 45 | 90;
  /** XY graphs' x-axis title; unset = the table's x title and unit. */
  readonly xTitle?: string;
  /** XY graphs' x-axis range; unset = automatic. */
  readonly xMin?: number;
  readonly xMax?: number;
  /** XY graphs' logarithmic x-axis (base 10); unset = linear. */
  readonly xScale?: 'log10';
  /** XY graphs' major tick interval of a linear x-axis; unset = automatic. */
  readonly xStep?: number;
  /** XY graphs' x tick label decimals; unset = what the tick interval needs. */
  readonly xDecimals?: number;
  /** The graph's title drawn above it; unset = not shown. */
  readonly showTitle?: boolean;
  /** Grouped graphs' legend: above the plot or none; unset = at the right. */
  readonly legend?: 'top' | 'none';
  /** Theme values this graph changes; the rest follow its theme. */
  readonly style?: StyleOverrides;
  /** Point symbols by data set; unset = circles. */
  readonly symbols?: Readonly<Record<string, PointSymbol>>;
  /** Brackets moved up (points; negative: down), by bracket key (#45). */
  readonly bracketOffsets?: Readonly<Record<string, number>>;
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
  /** Column plots for a Column table, grouped bars for a Grouped table. */
  readonly plot: GraphPlot;
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
