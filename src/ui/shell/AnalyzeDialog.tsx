/**
 * Choosing an analysis (items 04, 06): what to do, which groups, and the
 * options in plain words. Creates the analysis, or changes an existing
 * one, as one undo step.
 */
import { type ReactNode, useState } from 'react';

import { comparisonProblem, optionsProblem } from '@/analyses/nonlinear-regression/constraints';
import { type Id, newId } from '@/model/ids';
import {
  type Analysis,
  type AnalysisKind,
  type UserAnalysisKind,
  type UserAnalysisSpec,
  type AnalysisSpec,
  type AllPairsTest,
  type Comparisons,
  type ControlTest,
  type CorrelationOptions,
  DEFAULT_OPTIONS,
  EQUAL_SD_ALL,
  EQUAL_SD_CONTROL,
  type KruskalWallisOptions,
  type NestedComparisons,
  type NestedTTestOptions,
  type NonlinearRegressionOptions,
  type OneWayOptions,
  type ParameterConstraint,
  type RankTestOptions,
  REPEATED_TWO_WAY_FAMILIES,
  type RepeatedTwoWayFamily,
  type RepeatedTwoWayOptions,
  TWO_WAY_FAMILIES,
  type TTestOptions,
  type TwoWayFamily,
  type TwoWayOptions,
  WELCH_ALL,
  WELCH_CONTROL,
} from '@/model/project';
import type { Table, TableType } from '@/model/table';

import { KIND_ICON } from '../analysisKinds';
import { analytics } from '../analytics';
import { Icon } from '../Icon';
import { store } from '../state/store';
import { Dialog } from './Dialog';
import { Guide } from './Guide';
import { analysisTitle } from './tables';

interface Props {
  readonly table: Table;
  /** When given, the dialog changes this analysis instead of creating one. */
  readonly analysis?: Analysis;
  readonly onClose: () => void;
}

interface KindInfo {
  readonly kind: UserAnalysisKind;
  readonly name: string;
  readonly blurb: string;
  readonly tables: readonly TableType[];
  /** How many groups it compares, when fixed. */
  readonly groups?: number;
}

const KINDS: readonly KindInfo[] = [
  {
    kind: 'descriptive',
    name: 'Descriptive statistics',
    blurb: 'Describe each group: n, mean, SD, SEM, 95% CI, median and quartiles.',
    // Grouped tables, too (item 18, #54): per cell, and per data set pooled over rows.
    tables: ['column', 'grouped'],
  },
  {
    kind: 'normality',
    name: 'Normality tests',
    blurb: 'Check whether each group’s values look like they come from a bell-shaped distribution.',
    tables: ['column'],
  },
  {
    kind: 't-test',
    name: 't test',
    blurb: 'Compare the means of two groups.',
    tables: ['column'],
    groups: 2,
  },
  {
    kind: 'paired-normality',
    name: 'Normality of the differences',
    blurb:
      'Check whether the row-by-row differences behind a paired comparison look bell-shaped — the actual assumption pairing by row makes, not each group’s own shape.',
    tables: ['column'],
    groups: 2,
  },
  {
    kind: 'nested-descriptive',
    name: 'Descriptive statistics',
    blurb:
      'Describe each group: n, mean, SD, SEM and 95% CI of the replicate means, plus each replicate’s own numbers.',
    tables: ['nested'],
  },
  {
    kind: 'nested-normality',
    name: 'Normality tests',
    blurb:
      'Check whether each group’s replicate means look bell-shaped — with the usual few replicates, these tests have little power to tell.',
    tables: ['nested'],
  },
  {
    kind: 'nested-t-test',
    name: 'Nested t test',
    blurb: 'Compare two groups, weighing each biological replicate by how many values it has.',
    tables: ['nested'],
    groups: 2,
  },
  {
    kind: 'nested-one-way-anova',
    name: 'Nested one-way ANOVA',
    blurb:
      'Compare three or more groups, weighing each biological replicate by how many values it has.',
    tables: ['nested'],
  },
  {
    kind: 'nested-repeated-anova',
    name: 'Matched nested one-way ANOVA',
    blurb:
      'Compare three or more groups whose replicates are the same experiment split between them: a repeated-measures ANOVA on the replicate means.',
    tables: ['nested'],
  },
  {
    kind: 'contingency-chi-square',
    name: 'Chi-square test',
    blurb:
      'Test whether the row and column categories are associated (Yates’ correction for a 2×2 table).',
    tables: ['contingency'],
  },
  {
    kind: 'contingency-fisher',
    name: 'Fisher’s exact test',
    blurb:
      'The exact version of the same question, best for small counts or a table chi-square shouldn’t be trusted on.',
    tables: ['contingency'],
  },
  {
    kind: 'correlation',
    name: 'Correlation',
    blurb: 'How closely X and Y move together, per Y data set: Pearson’s r or Spearman’s rho.',
    tables: ['xy'],
  },
  {
    kind: 'linear-regression',
    name: 'Linear regression',
    blurb: 'Fit a straight line to X and Y, per Y data set: slope, intercept, R² and a fit check.',
    tables: ['xy'],
  },
  {
    kind: 'nonlinear-regression',
    name: 'Dose-response curve',
    blurb:
      'Fit an S-shaped dose-response curve, per Y data set: EC50 with its CI, Hill slope, bottom and top.',
    tables: ['xy'],
  },
  {
    kind: 'growth-curve',
    name: 'Growth curve',
    blurb:
      'Fit a bacterial or yeast growth curve, per Y data set: lag phase, growth rate and doubling time, and the plateau.',
    tables: ['xy'],
  },
  {
    kind: 'rank-test',
    name: 'Mann-Whitney / Wilcoxon',
    blurb: 'Compare two groups by ranks, without assuming a bell-shaped distribution.',
    tables: ['column'],
    groups: 2,
  },
  {
    kind: 'one-way-anova',
    name: 'One-way ANOVA',
    blurb: 'Compare the means of three or more groups, then which pairs differ.',
    tables: ['column'],
  },
  {
    kind: 'repeated-measures-anova',
    name: 'Repeated-measures ANOVA',
    blurb:
      'Compare two or more groups measured on the same rows (subjects), then which pairs differ.',
    tables: ['column'],
  },
  {
    kind: 'two-way-anova',
    name: 'Two-way ANOVA',
    blurb:
      'How the rows and the data sets (two factors) each affect the values, and whether they interact.',
    tables: ['grouped'],
  },
  {
    kind: 'repeated-two-way-anova',
    name: 'Repeated-measures two-way ANOVA',
    blurb:
      'How the rows and data sets (two factors) each affect the values, when one factor is measured on the same subjects.',
    tables: ['grouped'],
  },
  {
    kind: 'repeated-two-way-anova-both',
    name: 'Repeated-measures two-way ANOVA (both factors repeated)',
    blurb:
      'How the rows and data sets (two factors) each affect the values, when every subject is measured at every row-column combination — no between-subjects factor left.',
    tables: ['grouped'],
  },
  {
    kind: 'kruskal-wallis',
    name: 'Kruskal-Wallis',
    blurb: 'Compare three or more groups by ranks, without assuming a bell-shaped distribution.',
    tables: ['column'],
  },
  {
    kind: 'friedman',
    name: 'Friedman test',
    blurb:
      'Compare three or more groups measured on the same rows (subjects) by ranks, without assuming a bell-shaped distribution.',
    tables: ['column'],
  },
];

type Options = { -readonly [K in AnalysisKind]: Extract<AnalysisSpec, { kind: K }>['options'] };

/** A companion analysis offered alongside the main one (note 06, item 18): both normality tests. */
type CompanionKind = 'normality' | 'paired-normality';

function initialOptions(analysis: Analysis | undefined): Options {
  const o: Options = { ...DEFAULT_OPTIONS };
  if (analysis) (o as Record<AnalysisKind, unknown>)[analysis.kind] = analysis.options;
  return o;
}

function Radio(props: {
  readonly name: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onPick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <label className="option">
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onPick}
      />
      {props.children}
    </label>
  );
}

function PairedChoice(props: {
  readonly paired: boolean;
  readonly summary: boolean;
  readonly onChange: (paired: boolean) => void;
}) {
  return (
    <fieldset>
      <legend>How were the data collected?</legend>
      <Radio
        name="paired"
        checked={!props.paired}
        onPick={() => {
          props.onChange(false);
        }}
      >
        Unpaired: different subjects (samples, animals, wells) in each group
      </Radio>
      <Radio
        name="paired"
        checked={props.paired}
        disabled={props.summary}
        onPick={() => {
          props.onChange(true);
        }}
      >
        Paired: each row is one subject measured in both groups (before and after, matched pairs)
      </Radio>
      {props.summary && (
        <p className="hint">Paired tests need the individual values, not summary data.</p>
      )}
    </fieldset>
  );
}

function TailsChoice(props: {
  readonly tails: 'two' | 'one';
  readonly onChange: (tails: 'two' | 'one') => void;
}) {
  return (
    <fieldset>
      <legend>P value</legend>
      <Radio
        name="tails"
        checked={props.tails === 'two'}
        onPick={() => {
          props.onChange('two');
        }}
      >
        Two-tailed (recommended)
      </Radio>
      <Radio
        name="tails"
        checked={props.tails === 'one'}
        onPick={() => {
          props.onChange('one');
        }}
      >
        One-tailed: only if you predicted which group would be higher before collecting the data
      </Radio>
    </fieldset>
  );
}

function TTestFields(props: {
  readonly o: TTestOptions;
  readonly summary: boolean;
  readonly set: (o: TTestOptions) => void;
}) {
  const { o, set } = props;
  return (
    <>
      <PairedChoice
        paired={o.paired}
        summary={props.summary}
        onChange={(paired) => {
          set({ ...o, paired });
        }}
      />
      {!o.paired && (
        <fieldset>
          <legend>Standard deviations</legend>
          <label className="option">
            <input
              type="checkbox"
              checked={o.welch}
              onChange={(e) => {
                set({ ...o, welch: e.currentTarget.checked });
              }}
            />
            Don’t assume both groups have the same SD (Welch’s correction)
          </label>
          <p className="hint">
            Off by default, as in Prism. The results include a test of whether the SDs differ.
          </p>
        </fieldset>
      )}
      <TailsChoice
        tails={o.tails}
        onChange={(tails) => {
          set({ ...o, tails });
        }}
      />
    </>
  );
}

/** A nested t test: separate or matched replicates (note 14), and tails. */
function NestedTTestFields(props: {
  readonly o: NestedTTestOptions;
  /** What the first replicate is called, e.g. "Day 1". */
  readonly first: string;
  readonly set: (o: NestedTTestOptions) => void;
}) {
  const { o, set } = props;
  return (
    <>
      <fieldset>
        <legend>How were the replicates run?</legend>
        <Radio
          name="matched"
          checked={!o.matched}
          onPick={() => {
            set({ ...o, matched: false });
          }}
        >
          Separately: each group’s replicates are independent (even if run on the same day)
        </Radio>
        <Radio
          name="matched"
          checked={o.matched}
          onPick={() => {
            set({ ...o, matched: true });
          }}
        >
          Matched: “{props.first}” is one sample split between both groups (the same culture, animal
          or batch of cells, handled in parallel)
        </Radio>
        <p className="hint">
          {o.matched
            ? 'A paired t test on the replicate means, as in the SuperPlots paper (Lord et al. 2020). A replicate with values in only one group is left out.'
            : 'A mixed model, as Prism’s nested t test: it weighs each replicate by how many values it has.'}
        </p>
      </fieldset>
      <TailsChoice
        tails={o.tails}
        onChange={(tails) => {
          set({ ...o, tails });
        }}
      />
    </>
  );
}

function RankTestFields(props: {
  readonly o: RankTestOptions;
  readonly set: (o: RankTestOptions) => void;
}) {
  const { o, set } = props;
  return (
    <>
      <PairedChoice
        paired={o.paired}
        summary={false}
        onChange={(paired) => {
          set({ ...o, paired });
        }}
      />
      <p className="hint">
        {o.paired
          ? 'Wilcoxon matched-pairs signed-rank test: ranks the differences within each row.'
          : 'Mann-Whitney test: ranks all the values together and compares the ranks of the two groups.'}
      </p>
      {o.paired && (
        <fieldset>
          <legend>Rows where both values are the same</legend>
          <Radio
            name="zeros"
            checked={o.zeros === 'wilcoxon'}
            onPick={() => {
              set({ ...o, zeros: 'wilcoxon' });
            }}
          >
            Leave them out (Wilcoxon’s method, as Prism by default)
          </Radio>
          <Radio
            name="zeros"
            checked={o.zeros === 'pratt'}
            onPick={() => {
              set({ ...o, zeros: 'pratt' });
            }}
          >
            Rank them, but count them for neither side (Pratt’s method)
          </Radio>
        </fieldset>
      )}
      <TailsChoice
        tails={o.tails}
        onChange={(tails) => {
          set({ ...o, tails });
        }}
      />
    </>
  );
}

/** Which correlation to run (item 29, #38): Pearson's r or Spearman's rho, one at a time (Prism's own dialog). */
function CorrelationFields(props: {
  readonly o: CorrelationOptions;
  readonly set: (o: CorrelationOptions) => void;
}) {
  const { o, set } = props;
  return (
    <fieldset>
      <legend>Method</legend>
      <Radio
        name="correlation-method"
        checked={o.method === 'pearson'}
        onPick={() => {
          set({ ...o, method: 'pearson' });
        }}
      >
        Pearson (assumes a straight-line relationship; gives a CI)
      </Radio>
      <Radio
        name="correlation-method"
        checked={o.method === 'spearman'}
        onPick={() => {
          set({ ...o, method: 'spearman' });
        }}
      >
        Spearman (ranks only, no shape assumed; no CI)
      </Radio>
    </fieldset>
  );
}

/** How the table's X relates to dose (item 32, #37): already log10 (Prism's model), or a dose to log. */
function DoseResponseFields(props: {
  readonly o: NonlinearRegressionOptions;
  readonly set: (o: NonlinearRegressionOptions) => void;
}) {
  const { o, set } = props;
  return (
    <fieldset>
      <legend>My X values are</legend>
      <Radio
        name="dose-response-x"
        checked={o.x === 'log'}
        onPick={() => {
          set({ ...o, x: 'log' });
        }}
      >
        Logs of the dose (e.g. −9 for 1 nM)
      </Radio>
      <Radio
        name="dose-response-x"
        checked={o.x === 'concentration'}
        onPick={() => {
          set({ ...o, x: 'concentration' });
        }}
      >
        Doses or concentrations (e.g. 1e-9); a zero dose is left out, since it has no log
      </Radio>
    </fieldset>
  );
}

/** A number typed into a limit or a constant; empty is `null`, text that isn't a number is `NaN`. */
function parseTyped(text: string): number | null {
  const t = text.trim().replace(',', '.').replace('−', '-');
  return t === '' ? null : Number(t);
}

function TypedNumber(props: {
  readonly label: string;
  readonly value: number | null;
  readonly onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(
    props.value === null || Number.isNaN(props.value) ? '' : String(props.value),
  );
  return (
    <label className="constraint-number">
      <span>{props.label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={props.label}
        value={text}
        onChange={(e) => {
          setText(e.currentTarget.value);
          props.onChange(parseTyped(e.currentTarget.value));
        }}
      />
    </label>
  );
}

const CONSTRAINT_STARTS: Readonly<Record<'bottom' | 'top' | 'hillSlope', ParameterConstraint>> = {
  bottom: { kind: 'bounded', lower: 0, upper: null },
  top: { kind: 'bounded', lower: null, upper: 100 },
  hillSlope: { kind: 'bounded', lower: 0, upper: null },
};
const FIXED_STARTS = { bottom: 0, top: 100, hillSlope: 1 } as const;

/** One curve parameter: estimate it, hold it at a constant, or keep it within limits (item 35, #96). */
function ConstraintField(props: {
  readonly name: 'bottom' | 'top' | 'hillSlope';
  readonly label: string;
  readonly c: ParameterConstraint;
  readonly set: (c: ParameterConstraint) => void;
}) {
  const { name, label, c, set } = props;
  const mode = (kind: ParameterConstraint['kind']) => {
    if (kind === c.kind) return;
    set(
      kind === 'free'
        ? { kind }
        : kind === 'fixed'
          ? { kind, value: FIXED_STARTS[name] }
          : CONSTRAINT_STARTS[name],
    );
  };
  return (
    <div className="constraint-row">
      <label className="constraint-name">
        <span>{label}</span>
        <select
          aria-label={`${label}: how to treat it`}
          value={c.kind}
          onChange={(e) => {
            mode(e.currentTarget.value as ParameterConstraint['kind']);
          }}
        >
          <option value="free">Estimate from the data</option>
          <option value="fixed">Hold at a constant</option>
          <option value="bounded">Estimate, within limits</option>
        </select>
      </label>
      {c.kind === 'fixed' && (
        <TypedNumber
          key="fixed"
          label={`${label} equals`}
          value={c.value}
          onChange={(v) => {
            set({ kind: 'fixed', value: v ?? Number.NaN });
          }}
        />
      )}
      {c.kind === 'bounded' && (
        <>
          <TypedNumber
            key="lower"
            label={`${label} at least`}
            value={c.lower}
            onChange={(v) => {
              set({ ...c, lower: v });
            }}
          />
          <TypedNumber
            key="upper"
            label={`${label} at most`}
            value={c.upper}
            onChange={(v) => {
              set({ ...c, upper: v });
            }}
          />
        </>
      )}
    </div>
  );
}

/** Fixing or bounding Bottom, Top and HillSlope: the usual cure when the data miss a plateau. */
function ConstraintFields(props: {
  readonly o: NonlinearRegressionOptions;
  readonly set: (o: NonlinearRegressionOptions) => void;
}) {
  const { o, set } = props;
  const problem = optionsProblem(o);
  return (
    <fieldset>
      <legend>Curve parameters</legend>
      <ConstraintField
        name="bottom"
        label="Bottom"
        c={o.bottom}
        set={(bottom) => {
          set({ ...o, bottom });
        }}
      />
      <ConstraintField
        name="top"
        label="Top"
        c={o.top}
        set={(top) => {
          set({ ...o, top });
        }}
      />
      <ConstraintField
        name="hillSlope"
        label="HillSlope"
        c={o.hillSlope}
        set={(hillSlope) => {
          set({ ...o, hillSlope });
        }}
      />
      <p className="hint">
        If your data don’t reach a plateau, hold it at the value you know (Bottom = 0 after
        subtracting a baseline, Top = 100 for percent-of-control data, HillSlope = 1 for simple
        binding). Each held parameter is one less to estimate, so the fit needs fewer points and its
        intervals get tighter. A limit that the best fit runs into is treated as a held value.
      </p>
      {problem && (
        <p className="hint" role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Comparing the fit with a simpler model that holds some parameters at a
 * constant (item 36, #98): "is Bottom really 0?", "is the slope really 1?".
 * Only a parameter the fit itself estimates can be held here.
 */
function ComparisonFields(props: {
  readonly o: NonlinearRegressionOptions;
  readonly set: (o: NonlinearRegressionOptions) => void;
}) {
  const { o, set } = props;
  const c = o.compare;
  const problem = comparisonProblem(o);
  const names = [
    ['bottom', 'Bottom'],
    ['top', 'Top'],
    ['hillSlope', 'HillSlope'],
  ] as const;
  return (
    <fieldset>
      <legend>Compare with a simpler model</legend>
      <label className="option">
        <input
          type="checkbox"
          checked={c !== null}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            const first = names.find(([k]) => o[k].kind === 'free');
            set({
              ...o,
              compare: on
                ? {
                    bottom: null,
                    top: null,
                    hillSlope: null,
                    ...(first ? { [first[0]]: FIXED_STARTS[first[0]] } : {}),
                  }
                : null,
            });
          }}
        />
        Ask whether the extra parameters are worth having
      </label>
      {c !== null && (
        <>
          {names.map(([k, label]) => {
            const v = c[k];
            const free = o[k].kind === 'free';
            return (
              <div className="constraint-row" key={k}>
                <label className="option">
                  <input
                    type="checkbox"
                    disabled={!free}
                    checked={free && v !== null}
                    onChange={(e) => {
                      set({
                        ...o,
                        compare: { ...c, [k]: e.currentTarget.checked ? FIXED_STARTS[k] : null },
                      });
                    }}
                  />
                  In the simpler model, hold {label} at a constant
                  {free ? '' : ' (already held or limited above)'}
                </label>
                {free && v !== null && (
                  <TypedNumber
                    key={k}
                    label={`Simpler model: ${label} equals`}
                    value={v}
                    onChange={(n) => {
                      set({ ...o, compare: { ...c, [k]: n ?? Number.NaN } });
                    }}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
      <p className="hint">
        Fits the same curve twice: once with everything estimated, once with the parameters you tick
        held at the values you give. The extra sum-of-squares F test asks whether the flexible fit
        is better than the simpler one by more than chance would give (its P value assumes the
        simpler model is right); AICc weighs the better fit against the extra parameters and gives
        the chance that each model is the better one.
      </p>
      {problem && (
        <p className="hint" role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}

const TEST_LABEL: Readonly<Record<AllPairsTest | ControlTest, string>> = {
  tukey: 'Tukey (recommended)',
  dunnett: 'Dunnett (recommended)',
  bonferroni: 'Bonferroni',
  sidak: 'Šidák',
  'games-howell': 'Games-Howell (recommended for large samples)',
  'dunnett-t3': 'Dunnett T3 (recommended with fewer than 50 per group)',
  'tamhane-t2': 'Tamhane T2',
};

/** The comparisons after a change of SD assumption or goal: the recommended test when the old one no longer fits. */
function fitComparisons(welch: boolean, c: Comparisons): Comparisons {
  if (c.kind === 'all') {
    const ok: readonly AllPairsTest[] = welch ? WELCH_ALL : EQUAL_SD_ALL;
    return ok.includes(c.test) ? c : { kind: 'all', test: welch ? 'dunnett-t3' : 'tukey' };
  }
  if (c.kind === 'control') {
    const ok: readonly ControlTest[] = welch ? WELCH_CONTROL : EQUAL_SD_CONTROL;
    return ok.includes(c.test) ? c : { ...c, test: welch ? 'dunnett-t3' : 'dunnett' };
  }
  return c;
}

function OneWayFields(props: {
  readonly o: OneWayOptions;
  readonly groups: readonly { readonly id: Id; readonly title: string }[];
  readonly set: (o: OneWayOptions) => void;
}) {
  const { o, set, groups } = props;
  const c = o.comparisons;
  const firstId = groups[0]?.id;
  const controlId = c.kind === 'control' ? c.control : firstId;
  const tests: readonly (AllPairsTest | ControlTest)[] =
    c.kind === 'all'
      ? o.welch
        ? WELCH_ALL
        : EQUAL_SD_ALL
      : o.welch
        ? WELCH_CONTROL
        : EQUAL_SD_CONTROL;
  const goal = (kind: Comparisons['kind']) => {
    const next: Comparisons =
      kind === 'none'
        ? { kind }
        : kind === 'all'
          ? { kind, test: o.welch ? 'dunnett-t3' : 'tukey' }
          : { kind, control: controlId ?? ('' as Id), test: o.welch ? 'dunnett-t3' : 'dunnett' };
    set({ ...o, comparisons: next });
  };
  return (
    <>
      <fieldset>
        <legend>Standard deviations</legend>
        <label className="option">
          <input
            type="checkbox"
            checked={o.welch}
            onChange={(e) => {
              const welch = e.currentTarget.checked;
              set({ welch, comparisons: fitComparisons(welch, o.comparisons) });
            }}
          />
          Don’t assume all groups have the same SD (Welch’s and Brown-Forsythe ANOVA)
        </label>
        <p className="hint">
          Off by default, as in Prism. The results include tests of whether the SDs differ.
        </p>
      </fieldset>
      <fieldset>
        <legend>Which groups differ? (multiple comparisons)</legend>
        <Radio
          name="goal"
          checked={c.kind === 'all'}
          onPick={() => {
            goal('all');
          }}
        >
          Compare every group with every other group
        </Radio>
        <Radio
          name="goal"
          checked={c.kind === 'control'}
          onPick={() => {
            goal('control');
          }}
        >
          Compare every group with a control group
        </Radio>
        <Radio
          name="goal"
          checked={c.kind === 'none'}
          onPick={() => {
            goal('none');
          }}
        >
          Only the overall ANOVA
        </Radio>
        {c.kind === 'control' && (
          <label className="option">
            Control group{' '}
            <select
              value={c.control}
              onChange={(e) => {
                set({ ...o, comparisons: { ...c, control: e.currentTarget.value as Id } });
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title || '(untitled)'}
                </option>
              ))}
            </select>
          </label>
        )}
        {c.kind !== 'none' && (
          <label className="option">
            Test{' '}
            <select
              aria-label="Multiple comparisons test"
              value={c.test}
              onChange={(e) => {
                const test = e.currentTarget.value;
                set({
                  ...o,
                  comparisons:
                    c.kind === 'all'
                      ? { kind: 'all', test: test as AllPairsTest }
                      : { ...c, test: test as ControlTest },
                });
              }}
            >
              {tests.map((t) => (
                <option key={t} value={t}>
                  {TEST_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="hint">
          Each P value is adjusted for the number of comparisons, so the 5% chance of a false
          “significant” applies to the whole set, not to each pair.
        </p>
      </fieldset>
    </>
  );
}

function NestedOneWayFields<O extends { readonly comparisons: NestedComparisons }>(props: {
  readonly o: O;
  readonly groups: readonly { readonly id: Id; readonly title: string }[];
  readonly set: (o: O) => void;
  /**
   * Only the repeated-measures kinds have this (#83): a second field
   * alongside `comparisons`, so the checkbox appears only for them.
   */
  readonly sphericity?: { readonly assume: boolean; readonly set: (assume: boolean) => void };
}) {
  const { o, set, groups, sphericity } = props;
  const c = o.comparisons;
  const firstId = groups[0]?.id;
  const controlId = c.kind === 'control' ? c.control : firstId;
  const tests: readonly (AllPairsTest | ControlTest)[] =
    c.kind === 'all' ? EQUAL_SD_ALL : EQUAL_SD_CONTROL;
  const goal = (kind: NestedComparisons['kind']) => {
    const next: NestedComparisons =
      kind === 'none'
        ? { kind }
        : kind === 'all'
          ? { kind, test: 'tukey' }
          : { kind, control: controlId ?? ('' as Id), test: 'dunnett' };
    set({ ...o, comparisons: next });
  };
  return (
    <fieldset>
      <legend>Which groups differ? (multiple comparisons)</legend>
      <Radio
        name="goal"
        checked={c.kind === 'all'}
        onPick={() => {
          goal('all');
        }}
      >
        Compare every group with every other group
      </Radio>
      <Radio
        name="goal"
        checked={c.kind === 'control'}
        onPick={() => {
          goal('control');
        }}
      >
        Compare every group with a control group
      </Radio>
      <Radio
        name="goal"
        checked={c.kind === 'none'}
        onPick={() => {
          goal('none');
        }}
      >
        Only the overall ANOVA
      </Radio>
      {c.kind === 'control' && (
        <label className="option">
          Control group{' '}
          <select
            value={c.control}
            onChange={(e) => {
              set({ ...o, comparisons: { ...c, control: e.currentTarget.value as Id } });
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title || '(untitled)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {c.kind !== 'none' && (
        <label className="option">
          Test{' '}
          <select
            aria-label="Multiple comparisons test"
            value={c.test}
            onChange={(e) => {
              const test = e.currentTarget.value;
              set({
                ...o,
                comparisons:
                  c.kind === 'all'
                    ? { kind: 'all', test: test as (typeof EQUAL_SD_ALL)[number] }
                    : { ...c, test: test as (typeof EQUAL_SD_CONTROL)[number] },
              });
            }}
          >
            {tests.map((t) => (
              <option key={t} value={t}>
                {TEST_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      )}
      {sphericity && c.kind !== 'none' && (
        <label className="option">
          <input
            type="checkbox"
            checked={!sphericity.assume}
            onChange={(e) => {
              sphericity.set(!e.currentTarget.checked);
            }}
          />
          Don’t assume sphericity for these comparisons (each pair from just its own two groups, FAQ
          1609’s method)
        </label>
      )}
      <p className="hint">
        Each P value is adjusted for the number of comparisons, so the 5% chance of a false
        “significant” applies to the whole set, not to each pair.
        {sphericity &&
          c.kind !== 'none' &&
          (sphericity.assume
            ? ' Assuming sphericity (Prism’s traditional method, on by default) pools every group’s variability into one residual.'
            : ' Not assuming sphericity (Prism’s other method): each comparison uses only its own two groups’ pairing, so it has less power, but isn’t thrown off if the groups don’t vary together the same way.')}
      </p>
    </fieldset>
  );
}

function KruskalFields(props: {
  readonly o: KruskalWallisOptions;
  readonly groups: readonly { readonly id: Id; readonly title: string }[];
  readonly set: (o: KruskalWallisOptions) => void;
}) {
  const { o, set, groups } = props;
  const c = o.comparisons;
  const first = groups[0]?.id ?? ('' as Id);
  return (
    <fieldset>
      <legend>Which groups differ? (Dunn’s multiple comparisons)</legend>
      <Radio
        name="goal"
        checked={c.kind === 'all'}
        onPick={() => {
          set({ ...o, comparisons: { kind: 'all' } });
        }}
      >
        Compare every group with every other group
      </Radio>
      <Radio
        name="goal"
        checked={c.kind === 'control'}
        onPick={() => {
          set({ ...o, comparisons: { kind: 'control', control: first } });
        }}
      >
        Compare every group with a control group
      </Radio>
      <Radio
        name="goal"
        checked={c.kind === 'none'}
        onPick={() => {
          set({ ...o, comparisons: { kind: 'none' } });
        }}
      >
        Only the overall test
      </Radio>
      {c.kind === 'control' && (
        <label className="option">
          Control group{' '}
          <select
            value={c.control}
            onChange={(e) => {
              set({ ...o, comparisons: { kind: 'control', control: e.currentTarget.value as Id } });
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title || '(untitled)'}
              </option>
            ))}
          </select>
        </label>
      )}
      {c.kind !== 'none' && (
        <label className="option">
          <input
            type="checkbox"
            checked={o.corrected}
            onChange={(e) => {
              set({ ...o, corrected: e.currentTarget.checked });
            }}
          />
          Adjust each P for the number of comparisons (recommended, as Prism)
        </label>
      )}
    </fieldset>
  );
}

const FAMILY_LABEL: Readonly<Record<TwoWayFamily, string>> = {
  'within-rows': 'Within each row, compare the data sets (simple effects)',
  'within-columns': 'Within each data set, compare the rows (simple effects)',
  'main-columns': 'Compare the data sets, averaged over rows (main column effect)',
  'main-rows': 'Compare the rows, averaged over data sets (main row effect)',
  'all-cells': 'Compare every cell with every other cell',
};

const REPEATED_TWO_WAY_FAMILY_LABEL: Readonly<Record<RepeatedTwoWayFamily, string>> = {
  'main-between':
    'Compare the between-subjects groups, averaged over the repeated levels (main effect)',
  'main-repeated':
    'Compare the repeated levels, averaged over the between-subjects groups (main effect)',
  simple: 'Within each repeated level, compare the between-subjects groups (simple effects)',
};

function RepeatedTwoWayFields(props: {
  readonly o: RepeatedTwoWayOptions;
  readonly columns: readonly { readonly id: Id; readonly title: string }[];
  readonly rows: readonly { readonly id: Id; readonly title: string }[];
  readonly set: (o: RepeatedTwoWayOptions) => void;
}) {
  const { o, set } = props;
  const c = o.comparisons;
  const between = o.repeatedFactor === 'column' ? props.rows : props.columns;
  const repeated = o.repeatedFactor === 'column' ? props.columns : props.rows;
  const levels = o.family === 'main-repeated' ? repeated : between;
  const first = levels[0]?.id ?? ('' as Id);
  const tests: readonly (AllPairsTest | ControlTest)[] =
    c.kind === 'control' ? EQUAL_SD_CONTROL : EQUAL_SD_ALL;
  return (
    <>
      <fieldset>
        <legend>Which factor is repeated</legend>
        <Radio
          name="repeated-factor"
          checked={o.repeatedFactor === 'column'}
          onPick={() => {
            set({ ...o, repeatedFactor: 'column' });
          }}
        >
          The data sets — matched by subcolumn within each row
        </Radio>
        <Radio
          name="repeated-factor"
          checked={o.repeatedFactor === 'row'}
          onPick={() => {
            set({ ...o, repeatedFactor: 'row' });
          }}
        >
          The rows — matched by subcolumn within each data set
        </Radio>
      </fieldset>
      <fieldset>
        <legend>Multiple comparisons</legend>
        <Radio
          name="repeated-compare"
          checked={c.kind === 'none'}
          onPick={() => {
            set({ ...o, comparisons: { kind: 'none' } });
          }}
        >
          Only the ANOVA table
        </Radio>
        {REPEATED_TWO_WAY_FAMILIES.map((fam) => (
          <Radio
            key={fam}
            name="repeated-compare"
            checked={c.kind !== 'none' && o.family === fam}
            onPick={() => {
              const control = c.kind === 'control';
              const lv = fam === 'main-repeated' ? repeated : between;
              set({
                ...o,
                family: fam,
                comparisons: control
                  ? { kind: 'control', control: lv[0]?.id ?? ('' as Id), test: 'dunnett' }
                  : { kind: 'all', test: c.kind === 'all' ? c.test : 'tukey' },
              });
            }}
          >
            {REPEATED_TWO_WAY_FAMILY_LABEL[fam]}
          </Radio>
        ))}
        {c.kind !== 'none' && (
          <>
            <label className="option">
              <select
                aria-label="Which pairs"
                value={c.kind === 'control' ? 'control' : 'all'}
                onChange={(e) => {
                  set({
                    ...o,
                    comparisons:
                      e.currentTarget.value === 'control'
                        ? { kind: 'control', control: first, test: 'dunnett' }
                        : { kind: 'all', test: 'tukey' },
                  });
                }}
              >
                <option value="all">Every pair</option>
                <option value="control">Each against a control</option>
              </select>
            </label>
            {c.kind === 'control' && (
              <label className="option">
                Control{' '}
                <select
                  value={c.control}
                  onChange={(e) => {
                    set({ ...o, comparisons: { ...c, control: e.currentTarget.value as Id } });
                  }}
                >
                  {levels.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title || '(untitled)'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="option">
              Test{' '}
              <select
                aria-label="Multiple comparisons test"
                value={c.test}
                onChange={(e) => {
                  const test = e.currentTarget.value;
                  set({
                    ...o,
                    comparisons:
                      c.kind === 'all'
                        ? { kind: 'all', test: test as (typeof EQUAL_SD_ALL)[number] }
                        : { ...c, test: test as (typeof EQUAL_SD_CONTROL)[number] },
                  });
                }}
              >
                {tests.map((t) => (
                  <option key={t} value={t}>
                    {TEST_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </fieldset>
    </>
  );
}

function TwoWayFields(props: {
  readonly o: TwoWayOptions;
  readonly columns: readonly { readonly id: Id; readonly title: string }[];
  readonly rows: readonly { readonly id: Id; readonly title: string }[];
  readonly set: (o: TwoWayOptions) => void;
}) {
  const { o, set } = props;
  const c = o.comparisons;
  const levels =
    o.family === 'within-rows' || o.family === 'main-columns' ? props.columns : props.rows;
  const first = levels[0]?.id ?? ('' as Id);
  const tests: readonly (AllPairsTest | ControlTest)[] =
    c.kind === 'control' ? EQUAL_SD_CONTROL : EQUAL_SD_ALL;
  return (
    <fieldset>
      <legend>Multiple comparisons</legend>
      <Radio
        name="compare"
        checked={c.kind === 'none'}
        onPick={() => {
          set({ ...o, comparisons: { kind: 'none' } });
        }}
      >
        Only the ANOVA table
      </Radio>
      {TWO_WAY_FAMILIES.map((f) => (
        <Radio
          key={f}
          name="compare"
          checked={c.kind !== 'none' && o.family === f}
          onPick={() => {
            const control = c.kind === 'control' && f !== 'all-cells';
            const lv = f === 'within-rows' || f === 'main-columns' ? props.columns : props.rows;
            set({
              family: f,
              comparisons: control
                ? { kind: 'control', control: lv[0]?.id ?? ('' as Id), test: c.test }
                : { kind: 'all', test: c.kind === 'all' ? c.test : 'tukey' },
            });
          }}
        >
          {FAMILY_LABEL[f]}
        </Radio>
      ))}
      {c.kind !== 'none' && (
        <>
          <label className="option">
            <select
              aria-label="Which pairs"
              value={c.kind === 'control' ? 'control' : 'all'}
              onChange={(e) => {
                set({
                  ...o,
                  comparisons:
                    e.currentTarget.value === 'control'
                      ? { kind: 'control', control: first, test: 'dunnett' }
                      : { kind: 'all', test: 'tukey' },
                });
              }}
            >
              <option value="all">Every pair</option>
              {o.family !== 'all-cells' && <option value="control">Each against a control</option>}
            </select>
          </label>
          {c.kind === 'control' && (
            <label className="option">
              Control{' '}
              <select
                value={c.control}
                onChange={(e) => {
                  set({ ...o, comparisons: { ...c, control: e.currentTarget.value as Id } });
                }}
              >
                {levels.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title || '(untitled)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="option">
            Test{' '}
            <select
              aria-label="Multiple comparisons test"
              value={c.test}
              onChange={(e) => {
                const test = e.currentTarget.value;
                set({
                  ...o,
                  comparisons:
                    c.kind === 'all'
                      ? { kind: 'all', test: test as AllPairsTest }
                      : { ...c, test: test as ControlTest },
                });
              }}
            >
              {tests.map((t) => (
                <option key={t} value={t}>
                  {TEST_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            One family of comparisons per row or data set, as Prism recommends; each P is adjusted
            for the comparisons in its family.
          </p>
        </>
      )}
    </fieldset>
  );
}

type Mode = 'guide' | 'pick';
const MODE_KEY = 'barelysig.analyze';

/** The last way a new analysis was chosen in this browser (item 15); the guide at first. */
function readMode(): Mode {
  try {
    return globalThis.localStorage.getItem(MODE_KEY) === 'pick' ? 'pick' : 'guide';
  } catch {
    return 'guide';
  }
}

function keepMode(mode: Mode): void {
  try {
    globalThis.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered; the dialog still switches for this visit.
  }
}

export function AnalyzeDialog({ table, analysis, onClose }: Props) {
  const summary = table.format.kind === 'summary';
  const kinds = KINDS.filter((k) => k.tables.includes(table.type));
  const [kind, setKind] = useState<UserAnalysisKind>(
    analysis && analysis.kind !== 'graph-summary' ? analysis.kind : 'descriptive',
  );
  const [mode, setModeState] = useState<Mode>(() => (analysis ? 'pick' : readMode()));
  const choosing = mode === 'guide';
  const setMode = (m: Mode) => {
    setModeState(m);
    keepMode(m);
  };
  // An XY table's X column (dataSets[0]) is never a Y data set to tick (item 29, #38).
  const pickable = table.type === 'xy' ? table.dataSets.slice(1) : table.dataSets;
  const [chosen, setChosen] = useState<readonly Id[]>(
    analysis?.input.kind === 'table' ? analysis.input.dataSets : pickable.map((d) => d.id),
  );
  const [options, setOptions] = useState<Options>(() => initialOptions(analysis));
  // Prism offers normality tests before a parametric test; so does the dialog (note 06).
  const [alsoNormality, setAlsoNormality] = useState(true);
  // A paired t test assumes Gaussian differences within rows, not groups (#33): it offers a
  // normality test of the differences instead of one on each group (#53).
  const pairedT = kind === 't-test' && options['t-test'].paired;
  // A new t test, one-way ANOVA or repeated-measures ANOVA on values offers a companion
  // normality analysis too (note 06, item 18): each group's for an unpaired test or ANOVA,
  // the row-by-row differences' for a paired t test.
  const companionForKind = (k: UserAnalysisKind, paired: boolean): CompanionKind | null => {
    if (k === 't-test') return paired ? 'paired-normality' : 'normality';
    if (k === 'one-way-anova' || k === 'repeated-measures-anova') return 'normality';
    return null;
  };
  const offersNormalityFor = (s: UserAnalysisSpec): CompanionKind | null =>
    analysis || summary ? null : companionForKind(s.kind, s.kind === 't-test' && s.options.paired);
  const companionKind = analysis || summary ? null : companionForKind(kind, pairedT);
  const offersNormality = companionKind !== null;
  const picked = pickable.filter((d) => chosen.includes(d.id)).map((d) => d.id);
  const info = KINDS.find((k) => k.kind === kind);
  const groups = info?.groups;

  const set = <K extends AnalysisKind>(k: K, o: Options[K]) => {
    setOptions((cur) => ({ ...cur, [k]: o }));
  };

  const pickKind = (k: UserAnalysisKind) => {
    setKind(k);
    // A test of two groups starts with the first two chosen.
    const n = KINDS.find((x) => x.kind === k)?.groups;
    if (n !== undefined && !analysis && picked.length > n) setChosen(picked.slice(0, n));
  };

  const spec = (): UserAnalysisSpec => {
    switch (kind) {
      case 'descriptive':
        return { kind, options: options.descriptive };
      case 'nested-descriptive':
        return { kind, options: options['nested-descriptive'] };
      case 'normality':
        return { kind, options: options.normality };
      case 'nested-normality':
        return { kind, options: options['nested-normality'] };
      case 'paired-normality':
        return { kind, options: options['paired-normality'] };
      case 't-test':
        return {
          kind,
          options: summary ? { ...options['t-test'], paired: false } : options['t-test'],
        };
      case 'nested-t-test':
        return { kind, options: options['nested-t-test'] };
      case 'rank-test':
        return { kind, options: options['rank-test'] };
      case 'two-way-anova': {
        const o = options['two-way-anova'];
        const c = o.comparisons;
        const byColumn = o.family === 'within-rows' || o.family === 'main-columns';
        const levels = byColumn ? picked : table.rows.map((r) => r.id);
        const control = c.kind === 'control' && !levels.includes(c.control) ? levels[0] : undefined;
        return {
          kind,
          options:
            control !== undefined && c.kind === 'control'
              ? { ...o, comparisons: { ...c, control } }
              : o,
        };
      }
      case 'kruskal-wallis': {
        const o = options['kruskal-wallis'];
        const c = o.comparisons;
        const control = c.kind === 'control' && !picked.includes(c.control) ? picked[0] : undefined;
        return {
          kind,
          options: control !== undefined ? { ...o, comparisons: { kind: 'control', control } } : o,
        };
      }
      case 'friedman': {
        const o = options.friedman;
        const c = o.comparisons;
        const control = c.kind === 'control' && !picked.includes(c.control) ? picked[0] : undefined;
        return {
          kind,
          options: control !== undefined ? { ...o, comparisons: { kind: 'control', control } } : o,
        };
      }
      case 'one-way-anova': {
        const o = options['one-way-anova'];
        const c = o.comparisons;
        // A control must be one of the groups analysed; the first, unless another was picked.
        const control = c.kind === 'control' && !picked.includes(c.control) ? picked[0] : undefined;
        return {
          kind,
          options:
            control !== undefined && c.kind === 'control'
              ? { ...o, comparisons: { ...c, control } }
              : o,
        };
      }
      case 'nested-one-way-anova': {
        const o = options['nested-one-way-anova'];
        const c = o.comparisons;
        const control = c.kind === 'control' && !picked.includes(c.control) ? picked[0] : undefined;
        return {
          kind,
          options:
            control !== undefined && c.kind === 'control' ? { comparisons: { ...c, control } } : o,
        };
      }
      case 'repeated-measures-anova': {
        const o = options['repeated-measures-anova'];
        const c = o.comparisons;
        const control = c.kind === 'control' && !picked.includes(c.control) ? picked[0] : undefined;
        return {
          kind,
          options:
            control !== undefined && c.kind === 'control'
              ? { ...o, comparisons: { ...c, control } }
              : o,
        };
      }
      case 'nested-repeated-anova': {
        const o = options['nested-repeated-anova'];
        const c = o.comparisons;
        const control = c.kind === 'control' && !picked.includes(c.control) ? picked[0] : undefined;
        return {
          kind,
          options:
            control !== undefined && c.kind === 'control'
              ? { ...o, comparisons: { ...c, control } }
              : o,
        };
      }
      case 'repeated-two-way-anova':
        return { kind, options: options['repeated-two-way-anova'] };
      case 'repeated-two-way-anova-both':
        return { kind, options: options['repeated-two-way-anova-both'] };
      case 'contingency-chi-square':
        return { kind, options: options['contingency-chi-square'] };
      case 'contingency-fisher':
        return { kind, options: options['contingency-fisher'] };
      case 'correlation':
        return { kind, options: options.correlation };
      case 'linear-regression':
        return { kind, options: options['linear-regression'] };
      case 'nonlinear-regression':
        return { kind, options: options['nonlinear-regression'] };
      case 'growth-curve':
        return { kind, options: options['growth-curve'] };
    }
  };

  const submit = (s: UserAnalysisSpec, withCompanion: CompanionKind | null) => {
    const input = { kind: 'table' as const, table: table.id, dataSets: picked };
    const title = analysisTitle(s, table.title);
    if (analysis) {
      const keepTitle = analysis.title !== analysisTitle(analysis, table.title);
      store.edit({
        op: 'setAnalysis',
        analysis: {
          ...analysis,
          ...s,
          input,
          title: keepTitle ? analysis.title : title,
        } as Analysis,
      });
    } else {
      const id = newId('a');
      const main: Analysis = { id, title, input, ...s };
      const companion: Analysis | null = withCompanion && {
        id: newId('a'),
        title: analysisTitle({ kind: withCompanion, options: {} }, table.title),
        input,
        kind: withCompanion,
        options: {},
      };
      store.edit(
        companion
          ? {
              op: 'batch',
              label: `Add ${title}`,
              edits: [
                { op: 'addAnalysis', analysis: main },
                { op: 'addAnalysis', analysis: companion },
              ],
            }
          : { op: 'addAnalysis', analysis: main },
        { show: { kind: 'analysis', id } },
      );
      analytics.trackOnce('analysis', `new-${s.kind}`);
      if (choosing) analytics.trackOnce('analysis', 'guided');
    }
    onClose();
  };

  return (
    <Dialog
      title={analysis ? 'Change analysis' : `Analyze ${table.title}`}
      onClose={onClose}
      className="analyze"
    >
      {!analysis && (
        <div className="mode-tabs" role="tablist" aria-label="How to choose the test">
          {(
            [
              ['guide', 'Help me choose'],
              ['pick', 'Pick a test myself'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'mode-tab chosen' : 'mode-tab'}
              onClick={() => {
                setMode(m);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {choosing ? (
        <>
          <Guide
            table={table}
            chosen={chosen}
            setChosen={setChosen}
            normality={{ offered: offersNormalityFor, on: alsoNormality }}
            setNormality={setAlsoNormality}
            onRun={(s) => {
              const c = offersNormalityFor(s);
              submit(s, c && alsoNormality ? c : null);
            }}
            onOptions={(s) => {
              setOptions((cur) => ({ ...cur, [s.kind]: s.options }));
              pickKind(s.kind);
              setMode('pick');
            }}
          />
          <div className="actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(spec(), offersNormality && alsoNormality ? companionKind : null);
          }}
        >
          <fieldset className="type-choice">
            <legend>What do you want to know?</legend>
            {kinds.map((k) => (
              <label key={k.kind} className={kind === k.kind ? 'type-tile chosen' : 'type-tile'}>
                <input
                  type="radio"
                  name="kind"
                  checked={kind === k.kind}
                  onChange={() => {
                    pickKind(k.kind);
                  }}
                />
                <Icon name={KIND_ICON[k.kind]} size={28} />
                <span className="type-name">{k.name}</span>
                <span className="type-blurb">{k.blurb}</span>
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>
              {groups === 2
                ? 'Which two groups?'
                : table.type === 'grouped' || table.type === 'contingency'
                  ? 'Which data sets (columns)?'
                  : table.type === 'xy'
                    ? 'Which Y data sets?'
                    : 'Which groups?'}
            </legend>
            {pickable.length === 0 && <p className="hint">This table has no groups yet.</p>}
            {pickable.map((d) => (
              <label key={d.id} className="option">
                <input
                  type="checkbox"
                  checked={chosen.includes(d.id)}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    setChosen((c) => (on ? [...c, d.id] : c.filter((x) => x !== d.id)));
                  }}
                />
                {d.title || '(untitled)'}
              </label>
            ))}
            {groups !== undefined && picked.length !== groups && (
              <p className="hint">
                This test compares exactly {String(groups)} groups; {String(picked.length)} chosen.
              </p>
            )}
          </fieldset>

          {kind === 't-test' && (
            <TTestFields
              o={summary ? { ...options['t-test'], paired: false } : options['t-test']}
              summary={summary}
              set={(o) => {
                set('t-test', o);
              }}
            />
          )}
          {kind === 'nested-t-test' && (
            <NestedTTestFields
              o={options['nested-t-test']}
              first={(table.type === 'nested' ? table.replicateTitles?.[0] : null) ?? 'Replicate 1'}
              set={(o) => {
                set('nested-t-test', o);
              }}
            />
          )}
          {kind === 'one-way-anova' && (
            <OneWayFields
              o={options['one-way-anova']}
              groups={table.dataSets.filter((d) => picked.includes(d.id))}
              set={(o) => {
                set('one-way-anova', o);
              }}
            />
          )}
          {kind === 'nested-one-way-anova' && (
            <NestedOneWayFields
              o={options['nested-one-way-anova']}
              groups={table.dataSets.filter((d) => picked.includes(d.id))}
              set={(o) => {
                set('nested-one-way-anova', o);
              }}
            />
          )}
          {kind === 'repeated-measures-anova' && (
            <NestedOneWayFields
              o={options['repeated-measures-anova']}
              groups={table.dataSets.filter((d) => picked.includes(d.id))}
              set={(o) => {
                set('repeated-measures-anova', o);
              }}
              sphericity={{
                assume: options['repeated-measures-anova'].assumeSphericity,
                set: (assume) => {
                  set('repeated-measures-anova', {
                    ...options['repeated-measures-anova'],
                    assumeSphericity: assume,
                  });
                },
              }}
            />
          )}
          {kind === 'nested-repeated-anova' && (
            <NestedOneWayFields
              o={options['nested-repeated-anova']}
              groups={table.dataSets.filter((d) => picked.includes(d.id))}
              set={(o) => {
                set('nested-repeated-anova', o);
              }}
              sphericity={{
                assume: options['nested-repeated-anova'].assumeSphericity,
                set: (assume) => {
                  set('nested-repeated-anova', {
                    ...options['nested-repeated-anova'],
                    assumeSphericity: assume,
                  });
                },
              }}
            />
          )}
          {kind === 'two-way-anova' && (
            <TwoWayFields
              o={options['two-way-anova']}
              columns={table.dataSets.filter((d) => picked.includes(d.id))}
              rows={table.rows.map((r, i) => ({
                id: r.id,
                title: r.title ?? `Row ${String(i + 1)}`,
              }))}
              set={(o) => {
                set('two-way-anova', o);
              }}
            />
          )}
          {kind === 'repeated-two-way-anova' && (
            <RepeatedTwoWayFields
              o={options['repeated-two-way-anova']}
              columns={table.dataSets.filter((d) => picked.includes(d.id))}
              rows={table.rows.map((r, i) => ({
                id: r.id,
                title: r.title ?? `Row ${String(i + 1)}`,
              }))}
              set={(o) => {
                set('repeated-two-way-anova', o);
              }}
            />
          )}
          {kind === 'kruskal-wallis' && (
            <KruskalFields
              o={options['kruskal-wallis']}
              groups={table.dataSets.filter((d) => picked.includes(d.id))}
              set={(o) => {
                set('kruskal-wallis', o);
              }}
            />
          )}
          {kind === 'friedman' && (
            <KruskalFields
              o={options.friedman}
              groups={table.dataSets.filter((d) => picked.includes(d.id))}
              set={(o) => {
                set('friedman', o);
              }}
            />
          )}
          {kind === 'rank-test' && (
            <RankTestFields
              o={options['rank-test']}
              set={(o) => {
                set('rank-test', o);
              }}
            />
          )}
          {kind === 'correlation' && (
            <CorrelationFields
              o={options.correlation}
              set={(o) => {
                set('correlation', o);
              }}
            />
          )}
          {kind === 'nonlinear-regression' && (
            <>
              <DoseResponseFields
                o={options['nonlinear-regression']}
                set={(o) => {
                  set('nonlinear-regression', o);
                }}
              />
              <ConstraintFields
                o={options['nonlinear-regression']}
                set={(o) => {
                  set('nonlinear-regression', o);
                }}
              />
              <ComparisonFields
                o={options['nonlinear-regression']}
                set={(o) => {
                  set('nonlinear-regression', o);
                }}
              />
            </>
          )}

          {offersNormality && (
            <fieldset>
              <legend>Before the test</legend>
              <label className="option">
                <input
                  type="checkbox"
                  checked={alsoNormality}
                  onChange={(e) => {
                    setAlsoNormality(e.currentTarget.checked);
                  }}
                />
                {companionKind === 'paired-normality'
                  ? 'Also test the paired differences for normality (a separate analysis)'
                  : 'Also test each group for normality (a separate analysis)'}
              </label>
              <p className="hint">
                {companionKind === 'paired-normality'
                  ? 'A paired t test assumes that the differences within each row (not the groups themselves) follow a bell-shaped (Gaussian) distribution. With few pairs a normality test can’t confirm that; it can only flag clear departures.'
                  : 'This test assumes values that follow a bell-shaped (Gaussian) distribution. With few values a normality test can’t confirm that; it can only flag clear departures.'}
              </p>
            </fieldset>
          )}
          <div className="actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={
                picked.length === 0 ||
                (kind === 'nonlinear-regression' && optionsProblem(options[kind]) !== null)
              }
            >
              {analysis ? 'Update' : 'Analyze'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
