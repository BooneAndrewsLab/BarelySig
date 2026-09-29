/**
 * An analysis's results (item 04), shown as a section of its experiment's
 * page (item 08): what it is, its status, and the results as Prism lays
 * them out, with one plain sentence on top. A result is shown only when it is
 * current: outdated results are never shown as if they were.
 */
import { explain } from './glossary';
import { ANALYSIS_PAGE } from '../help/guide';
import { openGuide } from '../help/openGuide';
import { type ReactNode, useState, useSyncExternalStore } from 'react';

import type { ContingencyChiSquareResult } from '@/analyses/contingency-chi-square/types';
import type { ContingencyFisherResult } from '@/analyses/contingency-fisher/types';
import type { CorrelationResult, CorrelationSeries } from '@/analyses/correlation/types';
import type { DescribedGroup, DescriptiveResult } from '@/analyses/descriptive/types';
import type { FriedmanResult } from '@/analyses/friedman/types';
import type {
  FitQuantity,
  GrowthCurveResult,
  GrowthCurveSeries,
} from '@/analyses/growth-curve/types';
import type { KruskalWallisResult } from '@/analyses/kruskal/types';
import type {
  LinearRegressionResult,
  LinearRegressionSeries,
} from '@/analyses/linear-regression/types';
import type {
  DescribedReplicate,
  NestedDescriptiveResult,
} from '@/analyses/nested-descriptive/types';
import { doseResponseModel } from '@/analyses/nonlinear-regression/models';
import type {
  ComparisonOutcome,
  FitParameter,
  NonlinearRegressionResult,
  NonlinearRegressionSeries,
} from '@/analyses/nonlinear-regression/types';
import type { NestedNormalityResult } from '@/analyses/nested-normality/types';
import type { NestedOneWayResult } from '@/analyses/nested-oneway/types';
import type { NestedRepeatedResult } from '@/analyses/nested-repeated/types';
import type { NestedTTestResult } from '@/analyses/nested-ttest/types';
import type { NormalityResult, TestOutcome } from '@/analyses/normality/types';
import type { FTest, OneWayResult } from '@/analyses/oneway/types';
import type { PairedNormalityResult } from '@/analyses/paired-normality/types';
import type { RankTestResult } from '@/analyses/ranktest/types';
import type { RepeatedMeasuresResult } from '@/analyses/repeated/types';
import type { RepeatedTwoWayResult, RepeatedTwoWayTerm } from '@/analyses/repeatedTwoway/types';
import type {
  RepeatedTwoWayBothError,
  RepeatedTwoWayBothResult,
  RepeatedTwoWayBothTerm,
} from '@/analyses/repeatedTwowayBoth/types';
import type { TwoWayResult, TwoWayTerm } from '@/analyses/twoway/types';
import type { TTestResult } from '@/analyses/ttest/types';
import type { Id } from '@/model/ids';
import type { Analysis, Project } from '@/model/project';
import type { Dropped } from '@/model/selectors';

import { Section as PageSection } from '../notebook/Section';
import { AnalyzeDialog } from '../shell/AnalyzeDialog';
import { getResults } from '../state/results';
import { store } from '../state/store';
import { STAR_SCHEME, dfText, interval, levelText, pPhrase, pValue, sig, stars } from './format';
import { setAllNumbersOpen, useAllNumbersOpen } from './openNumbers';
import {
  COMPARISON_TEST,
  contingencyChiSquareReading,
  contingencyFisherReading,
  correlationReading,
  friedmanMethod,
  friedmanReading,
  growthCurveReading,
  kruskalMethod,
  kruskalReading,
  linearRegressionReading,
  nestedNormalityReading,
  aiccPrefers,
  fTestPrefers,
  nonlinearRegressionReading,
  simplerModelPhrase,
  nestedOneWayMethod,
  nestedOneWayReading,
  nestedRepeatedMethod,
  nestedRepeatedP,
  nestedRepeatedReading,
  nestedTTestMethod,
  nestedTTestReading,
  normalityReading,
  oneWayMethod,
  oneWayP,
  oneWayReading,
  pairedNormalityReading,
  rankTestMethod,
  rankTestReading,
  repeatedMethod,
  repeatedP,
  repeatedReading,
  repeatedTwoWayBothMethod,
  repeatedTwoWayBothReading,
  repeatedTwoWayMethod,
  repeatedTwoWayReading,
  tTestMethod,
  tTestReading,
  twoWayMethod,
  twoWayReading,
} from './reading';

interface Props {
  readonly project: Project;
  readonly analysis: Analysis;
}

type Row = readonly [label: string, value: string];
type Section = readonly [title: string, rows: readonly Row[]];

/** Prism's label/value tables, each a card of the results grid. */
function Sections({ sections }: { readonly sections: readonly Section[] }) {
  return sections.map(([title, rows]) => (
    <table key={title} className="results-table kv" aria-label={title}>
      <thead>
        <tr>
          <th colSpan={2} scope="colgroup">
            {title}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row" title={explain(label)}>
              {label}
            </th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ));
}

/**
 * Prism's full layout, collapsed behind a toggle (#57): open state remembered
 * per analysis, so one section's choice doesn't affect another's.
 */
function AllNumbers({ id, children }: { readonly id: Id; readonly children: ReactNode }) {
  const open = useAllNumbersOpen(id);
  return (
    <>
      <button
        type="button"
        className="link all-numbers-toggle"
        aria-expanded={open}
        onClick={() => {
          setAllNumbersOpen(id, !open);
        }}
      >
        {open ? 'Hide the rest of the numbers' : 'All numbers'}
      </button>
      {open && <div className="results-grid">{children}</div>}
    </>
  );
}

/** A key number beside the reading: what it is, its value, and a qualifier. */
interface Figure {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}

/** The plain reading with the few numbers it rests on, across the section. */
function Headline(props: { readonly reading: string; readonly figures?: readonly Figure[] }) {
  const figures = props.figures ?? [];
  return (
    <div className="headline">
      <p className="reading">{props.reading}</p>
      {figures.length > 0 && (
        <dl className="figures" aria-label="Key numbers">
          {figures.map((f) => (
            <div key={f.label} className="figure">
              <dt title={f.label}>{f.label}</dt>
              <dd className="figure-value">{f.value}</dd>
              {f.detail && <dd className="figure-detail">{f.detail}</dd>}
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const tailsText = (tails: 'two' | 'one') => (tails === 'two' ? 'two-tailed' : 'one-tailed');

/** The P a reading goes by, with its asterisks and anything else that qualifies it. */
function pFigure(label: string, p: number, ...qualifiers: string[]): Figure {
  return { label, value: pValue(p), detail: [stars(p), ...qualifiers].join(' · ') };
}

/** How many pairwise comparisons came out significant: "2 of 3". */
function pairsFigure(test: string, pairs: readonly { readonly p: number }[], adjusted: boolean) {
  const hits = pairs.filter((x) => x.p < 0.05).length;
  return {
    label: `${test} comparisons`,
    value: `${String(hits)} of ${String(pairs.length)}`,
    detail: `significant, ${adjusted ? 'adjusted' : 'individual'} P < 0.05`,
  } satisfies Figure;
}

const yesNo = (p: number) => (p < 0.05 ? 'Yes' : 'No');

function droppedText(d: Dropped | null): string {
  if (!d || (d.empty === 0 && d.excluded === 0)) return '';
  const parts = [
    ...(d.empty ? [`${String(d.empty)} empty`] : []),
    ...(d.excluded ? [`${String(d.excluded)} excluded`] : []),
  ];
  return ` (${parts.join(', ')} left out)`;
}

function TTestView({ r, id }: { readonly r: TTestResult; readonly id: Id }) {
  const tails = r.tails === 'two' ? 'Two-tailed' : 'One-tailed';
  const test: Section = [
    r.test === 'paired'
      ? 'Paired t test'
      : r.test === 'welch'
        ? 'Unpaired t test with Welch’s correction'
        : 'Unpaired t test',
    [
      ['P value', pValue(r.p)],
      ['P value summary', stars(r.p)],
      ['Significantly different (P < 0.05)?', yesNo(r.p)],
      ['One- or two-tailed P value?', tails],
      ['t, df', `t = ${sig(Math.abs(r.t))}, df = ${dfText(r.df)}`],
    ],
  ];
  const sections: Section[] = [test];
  if (r.pairing) {
    sections.push([
      'How big is the difference?',
      [
        [`Mean of differences (${r.b.title} − ${r.a.title})`, sig(r.difference)],
        ['SD of differences', sig(r.pairing.sdDifference)],
        ['SEM of differences', sig(r.seDifference)],
        ['95% confidence interval', interval(r.ciLower, r.ciUpper)],
        ['R squared (partial eta squared)', sig(r.rSquared)],
      ],
    ]);
    const { r: pr, p: pp } = r.pairing;
    sections.push([
      'How effective was the pairing?',
      pr === null || pp === null
        ? [['Correlation coefficient (r)', 'Needs at least three pairs']]
        : [
            ['Correlation coefficient (r)', sig(pr)],
            ['P value (one tailed)', pValue(pp)],
            ['P value summary', stars(pp)],
            ['Was the pairing significantly effective?', yesNo(pp)],
          ],
    ]);
    sections.push([
      'Data analyzed',
      [
        ['Number of pairs', String(r.pairing.pairs)],
        ...(r.dropped.rows
          ? ([['Rows left out (a value missing on one side)', String(r.dropped.rows)]] as Row[])
          : []),
      ],
    ]);
  } else {
    sections.push([
      'How big is the difference?',
      [
        [`Mean of ${r.a.title}`, sig(r.a.mean)],
        [`Mean of ${r.b.title}`, sig(r.b.mean)],
        [
          `Difference between means (${r.b.title} − ${r.a.title}) ± SEM`,
          `${sig(r.difference)} ± ${sig(r.seDifference)}`,
        ],
        ['95% confidence interval', interval(r.ciLower, r.ciUpper)],
        ['R squared (eta squared)', sig(r.rSquared)],
      ],
    ]);
    sections.push([
      'F test to compare variances',
      r.fTest
        ? [
            [
              'F, DFn, DFd',
              `F = ${sig(r.fTest.f)}, DFn = ${dfText(r.fTest.dfn)}, DFd = ${dfText(r.fTest.dfd)}`,
            ],
            ['P value', pValue(r.fTest.p)],
            ['P value summary', stars(r.fTest.p)],
            ['Significantly different (P < 0.05)?', yesNo(r.fTest.p)],
          ]
        : [['F test', 'Not defined: a group has no variation']],
    ]);
    sections.push([
      'Data analyzed',
      [
        [`Sample size, ${r.a.title}`, `${String(r.a.n)}${droppedText(r.dropped.a)}`],
        [`Sample size, ${r.b.title}`, `${String(r.b.n)}${droppedText(r.dropped.b)}`],
      ],
    ]);
  }
  return (
    <>
      <Headline
        reading={tTestReading(r)}
        figures={[
          pFigure('P value', r.p, tailsText(r.tails)),
          {
            label: `${r.pairing ? 'Mean of differences' : 'Difference'} (${r.b.title} − ${r.a.title})`,
            value: sig(r.difference),
            detail: `95% CI ${interval(r.ciLower, r.ciUpper)}`,
          },
          { label: 't statistic', value: sig(Math.abs(r.t)), detail: `df = ${dfText(r.df)}` },
        ]}
      />
      <p className="method">{tTestMethod(r)}</p>
      <AllNumbers id={id}>
        <Sections sections={sections} />
      </AllNumbers>
      <p className="legend">Asterisks: {STAR_SCHEME}.</p>
    </>
  );
}

/** ", 1 replicate with no usable value left out" beside a replicate count. */
function nestedDroppedText(dropped: number): string {
  return dropped
    ? `, ${String(dropped)} ${dropped === 1 ? 'replicate' : 'replicates'} with no usable value left out`
    : '';
}

function NestedTTestView({ r, id }: { readonly r: NestedTTestResult; readonly id: Id }) {
  const tails = r.tails === 'two' ? 'Two-tailed' : 'One-tailed';
  const matched = r.design === 'matched';
  const test: Section = [
    matched ? 'Matched nested t test (paired t test on the replicate means)' : 'Nested t test',
    [
      ['P value', pValue(r.p)],
      ['P value summary', stars(r.p)],
      ['Significantly different (P < 0.05)?', yesNo(r.p)],
      ['One- or two-tailed P value?', tails],
      ['t, df', `t = ${sig(Math.abs(r.t))}, df = ${dfText(r.df)}`],
    ],
  ];
  const sections: Section[] = [
    test,
    [
      'How big is the difference?',
      [
        [`Mean of ${r.a.title}${matched ? ' (of its replicate means)' : ''}`, sig(r.a.mean)],
        [`Mean of ${r.b.title}${matched ? ' (of its replicate means)' : ''}`, sig(r.b.mean)],
        [
          `${matched ? 'Mean of the differences' : 'Difference between means'} (${r.b.title} − ${r.a.title}) ± SE`,
          `${sig(r.difference)} ± ${sig(r.seDifference)}`,
        ],
        ['95% confidence interval', interval(r.ciLower, r.ciUpper)],
      ],
    ],
    r.design === 'matched'
      ? [
          'How consistent is the difference from experiment to experiment?',
          [
            ['SD of the differences between replicate means', sig(r.sdDifference)],
            ...(r.pairingR === null || r.pairingP === null
              ? []
              : ([
                  ['Correlation of replicate means between groups (r)', sig(r.pairingR)],
                  ['Was the matching effective? (P, one-tailed)', pValue(r.pairingP)],
                ] satisfies Row[])),
          ],
        ]
      : [
          'How much comes from replicate to replicate, versus within one?',
          [
            ['Between-replicate SD', sig(r.betweenReplicateSd)],
            ['Within-replicate SD', sig(r.withinReplicateSd)],
          ],
        ],
    [
      'Data analyzed',
      matched
        ? [
            [
              'Matched replicates (pairs)',
              `${String(r.a.nReplicates)}${nestedDroppedText(r.droppedReplicates.a)}`,
            ],
            [`Values, ${r.a.title}`, String(r.a.nValues)],
            [`Values, ${r.b.title}`, String(r.b.nValues)],
            ...(r.unmatched.length
              ? ([['Left out: values in one group only', r.unmatched.join(', ')]] satisfies Row[])
              : []),
          ]
        : [
            [
              `Replicates, ${r.a.title}`,
              `${String(r.a.nReplicates)} (${String(r.a.nValues)} values${nestedDroppedText(r.droppedReplicates.a)})`,
            ],
            [
              `Replicates, ${r.b.title}`,
              `${String(r.b.nReplicates)} (${String(r.b.nValues)} values${nestedDroppedText(r.droppedReplicates.b)})`,
            ],
          ],
    ],
  ];
  return (
    <>
      <Headline
        reading={nestedTTestReading(r)}
        figures={[
          pFigure('P value', r.p, tailsText(r.tails)),
          {
            label: `${matched ? 'Mean of the differences' : 'Difference'} (${r.b.title} − ${r.a.title})`,
            value: sig(r.difference),
            detail: `95% CI ${interval(r.ciLower, r.ciUpper)}`,
          },
          { label: 't statistic', value: sig(Math.abs(r.t)), detail: `df = ${dfText(r.df)}` },
        ]}
      />
      <p className="method">{nestedTTestMethod(r)}</p>
      <AllNumbers id={id}>
        <Sections sections={sections} />
      </AllNumbers>
      <p className="legend">Asterisks: {STAR_SCHEME}.</p>
    </>
  );
}

/** "96.83% CI of difference", with a warning when so few values can't reach 95%. */
function rankCi(r: RankTestResult, what: string): Row {
  const short = r.ci.level < 0.95 ? ' (the widest possible with so few values)' : '';
  return [`${levelText(r.ci.level)} CI of ${what}${short}`, interval(r.ci.lower, r.ci.upper)];
}

function RankTestView({ r, id }: { readonly r: RankTestResult; readonly id: Id }) {
  const head: Row[] = [
    ['P value', pValue(r.p)],
    ['Exact or approximate P value?', r.exact ? 'Exact' : 'Approximate'],
    ['P value summary', stars(r.p)],
    ['Significantly different (P < 0.05)?', yesNo(r.p)],
    ['One- or two-tailed P value?', r.tails === 'two' ? 'Two-tailed' : 'One-tailed'],
  ];
  const sections: Section[] = [];
  if (r.test === 'mann-whitney') {
    sections.push([
      'Mann-Whitney test',
      [
        ...head,
        [`Sum of ranks in ${r.a.title}, ${r.b.title}`, `${sig(r.rankSumA)}, ${sig(r.rankSumB)}`],
        [`Mean rank of ${r.a.title}, ${r.b.title}`, `${sig(r.meanRankA)}, ${sig(r.meanRankB)}`],
        ['Mann-Whitney U', sig(r.u)],
      ],
    ]);
    sections.push([
      'Difference between medians',
      [
        [`Median of ${r.a.title}`, sig(r.a.median)],
        [`Median of ${r.b.title}`, sig(r.b.median)],
        [`Difference: actual (${r.b.title} − ${r.a.title})`, sig(r.difference)],
        ['Difference: Hodges-Lehmann', sig(r.hodgesLehmann)],
        rankCi(r, 'difference'),
      ],
    ]);
    sections.push([
      'Data analyzed',
      [
        [`Sample size, ${r.a.title}`, `${String(r.nA)}${droppedText(r.dropped.a)}`],
        [`Sample size, ${r.b.title}`, `${String(r.nB)}${droppedText(r.dropped.b)}`],
      ],
    ]);
  } else {
    sections.push([
      'Wilcoxon matched-pairs signed-rank test',
      [
        ...head,
        [`Sum of positive ranks (${r.b.title} higher)`, sig(r.sumPositive)],
        [`Sum of negative ranks (${r.b.title} lower)`, sig(r.sumNegative)],
        ['Sum of signed ranks (W)', sig(r.w)],
      ],
    ]);
    sections.push([
      'Median of differences',
      [
        [`Median of ${r.a.title}`, sig(r.a.median)],
        [`Median of ${r.b.title}`, sig(r.b.median)],
        [`Median of differences (${r.b.title} − ${r.a.title})`, sig(r.medianDifference)],
        ['Hodges-Lehmann estimate', sig(r.hodgesLehmann)],
        rankCi(r, 'median difference'),
      ],
    ]);
    sections.push([
      'How effective was the pairing?',
      r.pairing === null
        ? [['Spearman r', 'Needs at least three pairs, with some variation in each group']]
        : [
            ['Spearman r', sig(r.pairing.r)],
            ['P value (one tailed)', pValue(r.pairing.p)],
            ['P value summary', stars(r.pairing.p)],
            ['Was the pairing significantly effective?', yesNo(r.pairing.p)],
          ],
    ]);
    sections.push([
      'Data analyzed',
      [
        ['Number of pairs', String(r.pairs)],
        [
          r.zeros === 'pratt'
            ? 'Pairs with no difference (ranked, no sign: Pratt’s method)'
            : 'Pairs with no difference (left out: Wilcoxon’s method)',
          String(r.zeroPairs),
        ],
        ...(r.dropped.rows
          ? ([['Rows left out (a value missing on one side)', String(r.dropped.rows)]] as Row[])
          : []),
      ],
    ]);
  }
  return (
    <>
      <Headline
        reading={rankTestReading(r)}
        figures={[
          pFigure('P value', r.p, r.exact ? 'exact' : 'approximate', tailsText(r.tails)),
          {
            label: `Hodges-Lehmann (${r.b.title} − ${r.a.title})`,
            value: sig(r.hodgesLehmann),
            detail: `${levelText(r.ci.level)} CI ${interval(r.ci.lower, r.ci.upper)}`,
          },
          r.test === 'mann-whitney'
            ? { label: 'Mann-Whitney U', value: sig(r.u) }
            : { label: 'Sum of signed ranks (W)', value: sig(r.w) },
        ]}
      />
      <p className="method">{rankTestMethod(r)}</p>
      <AllNumbers id={id}>
        <Sections sections={sections} />
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. A rank test’s confidence level can’t be exactly 95%; the level
        shown is the one achieved.
      </p>
    </>
  );
}

/** A table with column headers, for ANOVA tables and multiple comparisons. */
function Grid(props: {
  readonly label: string;
  readonly head: readonly string[];
  readonly rows: readonly (readonly string[])[];
}) {
  return (
    <div className="results-scroll">
      <table className="results-table wide" aria-label={props.label}>
        <thead>
          <tr>
            {props.head.map((h, i) => (
              <th key={i} scope="col" title={explain(h)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" title={explain(c)}>
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fText = (name: string, f: FTest) =>
  `${name} (${dfText(f.dfn)}, ${dfText(f.dfd)}) = ${sig(f.f)}`;

function fSection(title: string, name: string, f: FTest, question: string): Section {
  return [
    title,
    [
      [`${name} (DFn, DFd)`, fText(name, f)],
      ['P value', pValue(f.p)],
      ['P value summary', stars(f.p)],
      [question, yesNo(f.p)],
    ],
  ];
}

/** Why a normality test didn't run, in a cell. */
function notRun(t: TestOutcome<unknown>): string | null {
  if (t.ran) return null;
  if (t.why === 'few') return `Needs at least ${String(t.limit ?? '')} values`;
  if (t.why === 'many') return `At most ${String(t.limit ?? '')} values`;
  return 'All values the same';
}

function NormalityView({ r }: { readonly r: NormalityResult }) {
  const head = ['', ...r.groups.map((g) => g.title)];
  const row = (label: string, f: (g: NormalityResult['groups'][number]) => string) => [
    label,
    ...r.groups.map(f),
  ];
  const passed = (p: number) => (p > 0.05 ? 'Yes' : 'No');
  return (
    <>
      <Headline reading={normalityReading(r)} />
      <p className="method">
        D’Agostino-Pearson omnibus K² test and Shapiro-Wilk test (Royston), each group on its own, α
        = 0.05.
      </p>
      <div className="results-grid">
        <Grid
          label="D’Agostino & Pearson test"
          head={['D’Agostino & Pearson test', ...head.slice(1)]}
          rows={[
            row('K2', (g) => (g.dagostino.ran ? sig(g.dagostino.k2) : (notRun(g.dagostino) ?? ''))),
            row('P value', (g) => (g.dagostino.ran ? pValue(g.dagostino.p) : '—')),
            row('Passed normality test (α = 0.05)?', (g) =>
              g.dagostino.ran ? passed(g.dagostino.p) : '—',
            ),
            row('P value summary', (g) => (g.dagostino.ran ? stars(g.dagostino.p) : '—')),
          ]}
        />
        <Grid
          label="Shapiro-Wilk test"
          head={['Shapiro-Wilk test', ...head.slice(1)]}
          rows={[
            row('W', (g) =>
              g.shapiroWilk.ran ? sig(g.shapiroWilk.w) : (notRun(g.shapiroWilk) ?? ''),
            ),
            row('P value', (g) => (g.shapiroWilk.ran ? pValue(g.shapiroWilk.p) : '—')),
            row('Passed normality test (α = 0.05)?', (g) =>
              g.shapiroWilk.ran ? passed(g.shapiroWilk.p) : '—',
            ),
            row('P value summary', (g) => (g.shapiroWilk.ran ? stars(g.shapiroWilk.p) : '—')),
          ]}
        />
        <Grid
          label="Number of values"
          head={['Number of values', ...head.slice(1)]}
          rows={[row('n', (g) => `${String(g.n)}${droppedText(g.dropped)}`)]}
        />
      </div>
      <p className="legend">
        “Passed” means P &gt; 0.05: no clear departure from a Gaussian distribution, not proof of
        one. Asterisks: {STAR_SCHEME}.
      </p>
    </>
  );
}

/**
 * Normality of a Nested table's replicate means (item 26, #77): the same
 * two tests as `NormalityView`, run once per group on its replicate
 * means (`nestedReplicateMeans`, note 26) rather than on every individual
 * value.
 */
function NestedNormalityView({ r }: { readonly r: NestedNormalityResult }) {
  const head = ['', ...r.groups.map((g) => `${g.title}${nestedDroppedText(g.droppedReplicates)}`)];
  const row = (label: string, f: (g: NestedNormalityResult['groups'][number]) => string) => [
    label,
    ...r.groups.map(f),
  ];
  const passed = (p: number) => (p > 0.05 ? 'Yes' : 'No');
  return (
    <>
      <Headline reading={nestedNormalityReading(r)} />
      <p className="method">
        D’Agostino-Pearson omnibus K² test and Shapiro-Wilk test (Royston), each group’s replicate
        means on their own, α = 0.05.
      </p>
      <div className="results-grid">
        <Grid
          label="D’Agostino & Pearson test"
          head={['D’Agostino & Pearson test', ...head.slice(1)]}
          rows={[
            row('K2', (g) => (g.dagostino.ran ? sig(g.dagostino.k2) : (notRun(g.dagostino) ?? ''))),
            row('P value', (g) => (g.dagostino.ran ? pValue(g.dagostino.p) : '—')),
            row('Passed normality test (α = 0.05)?', (g) =>
              g.dagostino.ran ? passed(g.dagostino.p) : '—',
            ),
            row('P value summary', (g) => (g.dagostino.ran ? stars(g.dagostino.p) : '—')),
          ]}
        />
        <Grid
          label="Shapiro-Wilk test"
          head={['Shapiro-Wilk test', ...head.slice(1)]}
          rows={[
            row('W', (g) =>
              g.shapiroWilk.ran ? sig(g.shapiroWilk.w) : (notRun(g.shapiroWilk) ?? ''),
            ),
            row('P value', (g) => (g.shapiroWilk.ran ? pValue(g.shapiroWilk.p) : '—')),
            row('Passed normality test (α = 0.05)?', (g) =>
              g.shapiroWilk.ran ? passed(g.shapiroWilk.p) : '—',
            ),
            row('P value summary', (g) => (g.shapiroWilk.ran ? stars(g.shapiroWilk.p) : '—')),
          ]}
        />
        <Grid
          label="Number of replicates"
          head={['Number of replicates', ...head.slice(1)]}
          rows={[row('n', (g) => String(g.n))]}
        />
      </div>
      <p className="legend">
        “Passed” means P &gt; 0.05: no clear departure from a Gaussian distribution, not proof of
        one — and with this few replicates these tests have essentially no power to detect
        non-normality either way. Asterisks: {STAR_SCHEME}.
      </p>
    </>
  );
}

/** The row × column count grid itself, so a chi-square/Fisher result is read beside its table. */
function CountsGrid({
  rows,
  columns,
  counts,
}: {
  readonly rows: readonly { readonly title: string | null }[];
  readonly columns: readonly { readonly title: string }[];
  readonly counts: readonly (readonly number[])[];
}) {
  return (
    <Grid
      label="Counts"
      head={['', ...columns.map((c) => c.title)]}
      rows={rows.map((r, i) => [
        r.title ?? `Row ${String(i + 1)}`,
        ...columns.map((_, j) => sig(counts[i]?.[j] ?? null, 0)),
      ])}
    />
  );
}

/**
 * Chi-square test of independence on a Contingency table (item 28, #39):
 * `chisq.test`, Prism's default (Yates' continuity correction, applied
 * only to a 2×2 table). No comparisons or brackets — one number for the
 * whole table (note 28).
 */
function ContingencyChiSquareView({ r }: { readonly r: ContingencyChiSquareResult }) {
  return (
    <>
      <Headline reading={contingencyChiSquareReading(r)} />
      <p className="method">
        Chi-square test of independence{r.corrected ? ' with Yates’ continuity correction' : ''}.
      </p>
      <div className="results-grid">
        <CountsGrid rows={r.rows} columns={r.columns} counts={r.counts} />
        <Grid
          label="Chi-square test"
          head={['', 'Value']}
          rows={[
            ['Chi-square', sig(r.chiSq)],
            ['df', dfText(r.df)],
            ['P value', pValue(r.p)],
            ['P value summary', stars(r.p)],
            ['Significantly associated (P < 0.05)?', yesNo(r.p)],
            ['Number of values (n)', sig(r.n, 0)],
          ]}
        />
      </div>
      {r.lowExpected && (
        <p className="legend">
          Some expected counts are below 5: this P value may not be very accurate. Fisher’s exact
          test does not rely on this approximation.
        </p>
      )}
      <p className="legend">Asterisks: {STAR_SCHEME}.</p>
    </>
  );
}

/**
 * Fisher's exact test on a Contingency table (item 28, #39):
 * `fisher.test`, two-tailed. Gives an odds ratio only for a 2×2 table
 * (note 28's stated Prism difference: no one-tailed option here).
 */
function ContingencyFisherView({ r }: { readonly r: ContingencyFisherResult }) {
  const twoByTwo = r.oddsRatio !== null;
  return (
    <>
      <Headline reading={contingencyFisherReading(r)} />
      <p className="method">Fisher’s exact test, two-tailed.</p>
      <div className="results-grid">
        <CountsGrid rows={r.rows} columns={r.columns} counts={r.counts} />
        <Grid
          label="Fisher’s exact test"
          head={['', 'Value']}
          rows={[
            ['P value', pValue(r.p)],
            ['P value summary', stars(r.p)],
            ['Significantly associated (P < 0.05)?', yesNo(r.p)],
            ...(twoByTwo
              ? [
                  ['Odds ratio', sig(r.oddsRatio)] as Row,
                  [
                    '95% CI of odds ratio',
                    r.oddsRatioLower !== null && r.oddsRatioUpper !== null
                      ? interval(r.oddsRatioLower, r.oddsRatioUpper)
                      : '—',
                  ] as Row,
                ]
              : []),
            ['Number of values (n)', sig(r.n, 0)],
          ]}
        />
      </div>
      <p className="legend">Asterisks: {STAR_SCHEME}.</p>
    </>
  );
}

/**
 * Pearson or Spearman correlation of an XY table's Y data sets against
 * its shared X (item 29, #38): one column per Y data set chosen, the
 * same "series as columns" layout `NormalityView` uses for its groups.
 * No CI for Spearman (design note 29): rho has none the way Pearson's
 * Fisher z-transform gives one.
 */
function CorrelationView({ r }: { readonly r: CorrelationResult }) {
  const head = ['', ...r.series.map((s) => s.title)];
  const row = (label: string, f: (s: CorrelationSeries) => string) => [label, ...r.series.map(f)];
  const anyRan = r.series.some((s) => s.outcome.ran);
  const word = r.method === 'spearman' ? 'rho' : 'r';
  return (
    <>
      <Headline reading={correlationReading(r)} />
      <p className="method">
        {r.method === 'spearman' ? 'Spearman correlation' : 'Pearson correlation'} of each Y data
        set against X.
      </p>
      {anyRan && (
        <div className="results-grid">
          <Grid
            label="Correlation"
            head={head}
            rows={[
              row(word, (s) => (s.outcome.ran ? sig(s.outcome.r) : '—')),
              ...(r.method === 'pearson'
                ? [
                    row('95% CI', (s) =>
                      s.outcome.ran && s.outcome.lower !== null && s.outcome.upper !== null
                        ? interval(s.outcome.lower, s.outcome.upper)
                        : '—',
                    ),
                  ]
                : []),
              row('P value', (s) => (s.outcome.ran ? pValue(s.outcome.p) : '—')),
              row('P value summary', (s) => (s.outcome.ran ? stars(s.outcome.p) : '—')),
              row('Significantly correlated (P < 0.05)?', (s) =>
                s.outcome.ran ? yesNo(s.outcome.p) : '—',
              ),
              row('Number of XY pairs (n)', (s) =>
                s.outcome.ran ? sig(s.outcome.n, 0) : `${String(s.outcome.n)} (too few)`,
              ),
            ]}
          />
        </div>
      )}
      <p className="legend">
        {r.method === 'spearman'
          ? 'Spearman’s rho asks only whether Y tends to rise or fall with X, by rank — not whether the relationship is a straight line.'
          : 'Pearson’s r assumes a straight-line relationship; it can be small even when X and Y are strongly related in a curved way.'}{' '}
        Asterisks: {STAR_SCHEME}.
      </p>
    </>
  );
}

/**
 * Simple linear regression of an XY table's Y data sets against its
 * shared X (item 29, #38): `lm(y ~ x)`, one column per Y data set, with
 * the runs test for lack of fit beside it. No graph yet (design note 29's
 * follow-up): the numbers stand on their own here.
 */
function LinearRegressionView({ r }: { readonly r: LinearRegressionResult }) {
  const head = ['', ...r.series.map((s) => s.title)];
  const row = (label: string, f: (s: LinearRegressionSeries) => string) => [
    label,
    ...r.series.map(f),
  ];
  const anyRan = r.series.some((s) => s.outcome.ran);
  const runsWhy = (s: LinearRegressionSeries): string => {
    if (!s.outcome.ran) return '—';
    const t = s.outcome.runs;
    if (t.ran) return pValue(t.p);
    return t.why === 'same' ? 'Every residual on one side' : 'Too few residuals';
  };
  return (
    <>
      <Headline reading={linearRegressionReading(r)} />
      <p className="method">Simple linear regression (least squares), Y on X.</p>
      {anyRan && (
        <div className="results-grid">
          <Grid
            label="Linear regression"
            head={head}
            rows={[
              row('Slope', (s) => (s.outcome.ran ? sig(s.outcome.slope) : '—')),
              row('95% CI of slope', (s) =>
                s.outcome.ran ? interval(s.outcome.slopeLower, s.outcome.slopeUpper) : '—',
              ),
              row('Intercept', (s) => (s.outcome.ran ? sig(s.outcome.intercept) : '—')),
              row('95% CI of intercept', (s) =>
                s.outcome.ran ? interval(s.outcome.interceptLower, s.outcome.interceptUpper) : '—',
              ),
              row('R²', (s) => (s.outcome.ran ? sig(s.outcome.r2) : '—')),
              row('P value (slope ≠ 0)', (s) => (s.outcome.ran ? pValue(s.outcome.p) : '—')),
              row('P value summary', (s) => (s.outcome.ran ? stars(s.outcome.p) : '—')),
              row('F (DFn, DFd)', (s) =>
                s.outcome.ran
                  ? `F (${dfText(s.outcome.dfNum)}, ${dfText(s.outcome.dfDen)}) = ${sig(s.outcome.f)}`
                  : '—',
              ),
              row('Number of XY pairs (n)', (s) =>
                s.outcome.ran ? sig(s.outcome.n, 0) : `${String(s.outcome.n)} (too few)`,
              ),
              row('Runs test (lack of fit), P value', runsWhy),
            ]}
          />
        </div>
      )}
      <p className="legend">
        The runs test asks whether the residuals (the points above and below the fitted line)
        alternate about as often as chance would; a small runs-test P suggests the true relationship
        curves, even when the slope’s own P value is small. Asterisks: {STAR_SCHEME}.
      </p>
    </>
  );
}

const CONSTRAINT_NAMES = [
  ['bottom', 'Bottom'],
  ['top', 'Top'],
  ['hillSlope', 'HillSlope'],
] as const;

/** What was held or limited before the fit, in the methods line; empty when nothing was. */
function constraintSentence(c: NonlinearRegressionResult['constraints']): string {
  const parts = CONSTRAINT_NAMES.flatMap(([key, name]) => {
    const p = c[key];
    if (p.kind === 'fixed') return [`${name} held at ${sig(p.value)}`];
    if (p.kind === 'bounded') {
      const lo = p.lower === null ? null : `at least ${sig(p.lower)}`;
      const hi = p.upper === null ? null : `at most ${sig(p.upper)}`;
      return [`${name} kept ${[lo, hi].filter((v) => v !== null).join(' and ')}`];
    }
    return [];
  });
  return parts.length === 0
    ? ''
    : `${parts.join('; ')}. A parameter held, or pushed onto a limit, is not estimated: it has no SE or CI, and the degrees of freedom count only the parameters that were. `;
}

/** The comparison grid's rows, one column per data set (item 36, #98). */
function comparisonRows(r: NonlinearRegressionResult): string[][] {
  const compare = r.compare;
  if (compare === null) return [];
  const cell = (f: (c: Extract<ComparisonOutcome, { ran: true }>) => string) =>
    r.series.map((s) => {
      const c = s.outcome.ran ? s.outcome.comparison : null;
      if (c === null) return '—';
      return c.ran ? f(c) : 'Could not be compared';
    });
  const who = (p: 'fit' | 'simpler' | null) =>
    p === null ? '—' : p === 'fit' ? 'Your model (all estimated)' : 'Simpler model';
  return [
    [`Simpler model: ${doseResponseModel(r.model).potency}`, ...cell((c) => sig(c.simpler.ec50))],
    ['Simpler model: sum of squares', ...cell((c) => sig(c.simpler.ss))],
    ['Simpler model: degrees of freedom', ...cell((c) => sig(c.simpler.df, 0))],
    [
      'F (DFn, DFd)',
      ...cell((c) =>
        c.fTest.ok
          ? `${sig(c.fTest.f)} (${sig(c.fTest.dfNumerator, 0)}, ${sig(c.fTest.dfDenominator, 0)})`
          : 'Not available',
      ),
    ],
    ['F test P value', ...cell((c) => (c.fTest.ok ? pValue(c.fTest.p) : 'Not available'))],
    ['F test prefers (alpha 0.05)', ...cell((c) => who(fTestPrefers(c)))],
    ['AICc, your model', ...cell((c) => (c.aicc.ok ? sig(c.aicc.fit) : 'Not available'))],
    ['AICc, simpler model', ...cell((c) => (c.aicc.ok ? sig(c.aicc.simpler) : 'Not available'))],
    [
      'Chance your model is the better',
      ...cell((c) => (c.aicc.ok ? `${sig(c.aicc.probabilityFit * 100, 3)}%` : 'Not available')),
    ],
    [
      'Chance the simpler model is the better',
      ...cell((c) => (c.aicc.ok ? `${sig(c.aicc.probabilitySimpler * 100, 3)}%` : 'Not available')),
    ],
    ['AICc prefers', ...cell((c) => who(aiccPrefers(c)))],
  ];
}

/**
 * The dose-response fit of an XY table's Y data sets (item 32, #37): one
 * column per Y data set, Prism's "Best-fit values / 95% CI / Goodness of
 * fit" layout. An ambiguous parameter (dependency > 0.9999) shows as
 * Prism does: "~" before the value, CI "very wide".
 */
function NonlinearRegressionView({ r }: { readonly r: NonlinearRegressionResult }) {
  const model = doseResponseModel(r.model);
  const potency = model.potency;
  const head = ['', ...r.series.map((s) => s.title)];
  type Fit = Extract<NonlinearRegressionSeries['outcome'], { ran: true }>;
  const row = (label: string, f: (o: Fit) => string) => [
    label,
    ...r.series.map((s) => (s.outcome.ran ? f(s.outcome) : '—')),
  ];
  // A held parameter (fixed by the user, or run into a limit) has no SE or CI: nothing was estimated.
  const value = (p: FitParameter) =>
    p.status === 'fixed'
      ? `${sig(p.value)} (fixed)`
      : p.status === 'at-bound'
        ? `${sig(p.value)} (at limit)`
        : `${p.ambiguous ? '~' : ''}${sig(p.value)}`;
  const se = (p: FitParameter) => (p.se === null ? '—' : `${p.ambiguous ? '~' : ''}${sig(p.se)}`);
  const ci = (p: FitParameter) =>
    p.lower === null || p.upper === null
      ? '—'
      : p.ambiguous
        ? 'very wide'
        : interval(p.lower, p.upper);
  const anyRan = r.series.some((s) => s.outcome.ran);
  const runs = (o: Fit): string => {
    const t = o.runs;
    if (t.ran) return pValue(t.p);
    return t.why === 'same' ? 'Every residual on one side' : 'Too few residuals';
  };
  return (
    <>
      <Headline reading={nonlinearRegressionReading(r)} />
      <p className="method">
        Nonlinear regression (least squares): {model.label}, Y = Bottom + (Top − Bottom) / (1 +
        10^((Log{potency} − X) × HillSlope)).{' '}
        {model.inhibitor && 'A falling curve has a negative HillSlope. '}
        {constraintSentence(r.constraints)}
        {r.logX
          ? 'X is the log of the dose.'
          : 'X is a dose, fitted on a log scale (log₁₀); a zero or negative dose is left out.'}{' '}
        Asymptotic 95% CIs; no weighting; each replicate is its own point.
        {r.compare &&
          ` Compared with a simpler model (${simplerModelPhrase(r.compare)}) by the extra sum-of-squares F test (P is the upper tail of F; alpha 0.05) and by AICc (K counts the variance as a parameter).`}
      </p>
      {anyRan && (
        <div className="results-grid">
          <Grid
            label="Best-fit values"
            head={head}
            rows={[
              row('Bottom', (o) => value(o.bottom)),
              row('Top', (o) => value(o.top)),
              row(`Log${potency}`, (o) => value(o.logEc50)),
              row('HillSlope', (o) => value(o.hillSlope)),
              row(potency, (o) => `${o.logEc50.ambiguous ? '~' : ''}${sig(o.ec50)}`),
              row('Span (Top − Bottom)', (o) => sig(o.top.value - o.bottom.value)),
            ]}
          />
          <Grid
            label="Standard errors"
            head={head}
            rows={[
              row('Bottom', (o) => se(o.bottom)),
              row('Top', (o) => se(o.top)),
              row(`Log${potency}`, (o) => se(o.logEc50)),
              row('HillSlope', (o) => se(o.hillSlope)),
            ]}
          />
          <Grid
            label="95% CI (asymptotic)"
            head={head}
            rows={[
              row('Bottom', (o) => ci(o.bottom)),
              row('Top', (o) => ci(o.top)),
              row(`Log${potency}`, (o) => ci(o.logEc50)),
              row('HillSlope', (o) => ci(o.hillSlope)),
              row(potency, (o) =>
                o.logEc50.ambiguous ? 'very wide' : interval(o.ec50Lower, o.ec50Upper),
              ),
            ]}
          />
          <Grid
            label="Goodness of fit"
            head={head}
            rows={[
              row('Degrees of freedom', (o) => sig(o.df, 0)),
              row('R squared', (o) => sig(o.r2)),
              row('Sum of squares', (o) => sig(o.ss)),
              row('Sy.x', (o) => sig(o.syx)),
              row('Runs test (lack of fit), P value', runs),
              [
                'Number of points analyzed',
                ...r.series.map((s) =>
                  s.outcome.ran
                    ? sig(s.outcome.n, 0)
                    : `${String(s.outcome.n)} (${s.outcome.why === 'no-fit' ? 'didn’t converge' : 'too few'})`,
                ),
              ],
            ]}
          />
        </div>
      )}
      {r.compare && anyRan && (
        <>
          <div className="results-grid">
            <Grid
              label={`Comparison with the simpler model (${simplerModelPhrase(r.compare)})`}
              head={head}
              rows={comparisonRows(r)}
            />
          </div>
          <p className="legend">
            Null hypothesis of the F test: the simpler model ({simplerModelPhrase(r.compare)}) is
            correct, and the model that estimates those parameters fits better only by chance. A P
            value below 0.05 rejects it; a larger one is no evidence that the extra parameters help,
            which is not proof that they don’t. AICc needs no cut-off: the model with the lower AICc
            is preferred, and the probability shown is the chance that it is the better of the two.
            The simpler model always fits worse or equally well, so this asks whether the
            improvement is worth the extra parameters.
          </p>
        </>
      )}
      <p className="legend">
        {potency} is the dose giving a response halfway between Bottom and Top; its CI is 10 to the
        power of Log{potency}’s, so it isn’t symmetric around {potency}. A nonlinear fit’s R² is not
        a test of the curve: a small runs-test P says the points systematically miss the curve. “~”
        marks a value the data barely pin down (dependency above 0.9999).
      </p>
    </>
  );
}

/**
 * The growth curve fit of an XY table's Y data sets (item 33, #94):
 * lag/growth rate/doubling time/asymptote, laid out the same way as the
 * dose-response fit above.
 */
function GrowthCurveView({ r }: { readonly r: GrowthCurveResult }) {
  const head = ['', ...r.series.map((s) => s.title)];
  type Fit = Extract<GrowthCurveSeries['outcome'], { ran: true }>;
  const row = (label: string, f: (o: Fit) => string) => [
    label,
    ...r.series.map((s) => (s.outcome.ran ? f(s.outcome) : '—')),
  ];
  const value = (q: FitQuantity) => sig(q.value);
  const ci = (q: FitQuantity) => interval(q.lower, q.upper);
  const anyRan = r.series.some((s) => s.outcome.ran);
  const runs = (o: Fit): string => {
    const t = o.runs;
    if (t.ran) return pValue(t.p);
    return t.why === 'same' ? 'Every residual on one side' : 'Too few residuals';
  };
  return (
    <>
      <Headline reading={growthCurveReading(r)} />
      <p className="method">
        Nonlinear regression (least squares): Zwietering’s reparameterized Gompertz growth model, Y
        = A × exp(−exp((μm·e/A) × (λ − t) + 1)). Asymptotic 95% CIs; no weighting; each replicate is
        its own point.
      </p>
      {anyRan && (
        <div className="results-grid">
          <Grid
            label="Best-fit values"
            head={head}
            rows={[
              row('Asymptote (A)', (o) => value(o.asymptote)),
              row('Growth rate (μm)', (o) => value(o.growthRate)),
              row('Lag time (λ)', (o) => value(o.lag)),
              row('Doubling time', (o) => value(o.doublingTime)),
              row('End of exponential phase', (o) => value(o.exponentialEnd)),
            ]}
          />
          <Grid
            label="95% CI (asymptotic)"
            head={head}
            rows={[
              row('Asymptote (A)', (o) => ci(o.asymptote)),
              row('Growth rate (μm)', (o) => ci(o.growthRate)),
              row('Lag time (λ)', (o) => ci(o.lag)),
              row('Doubling time', (o) => ci(o.doublingTime)),
              row('End of exponential phase', (o) => ci(o.exponentialEnd)),
            ]}
          />
          <Grid
            label="Goodness of fit"
            head={head}
            rows={[
              row('Degrees of freedom', (o) => sig(o.df, 0)),
              row('R squared', (o) => sig(o.r2)),
              row('Sum of squares', (o) => sig(o.ss)),
              row('Sy.x', (o) => sig(o.syx)),
              row('Runs test (lack of fit), P value', runs),
              [
                'Number of points analyzed',
                ...r.series.map((s) =>
                  s.outcome.ran
                    ? sig(s.outcome.n, 0)
                    : `${String(s.outcome.n)} (${s.outcome.why === 'no-fit' ? 'didn’t converge' : 'too few'})`,
                ),
              ],
            ]}
          />
        </div>
      )}
      <p className="legend">
        Lag time is where the tangent line through the curve’s steepest point meets Y = 0; the end
        of exponential phase is where that same tangent line reaches the asymptote — growth is
        expected before the lag time (lag phase), between it and there (exponential phase, at the
        growth rate above) and after it (stationary phase, at the asymptote). A small runs-test P
        says the points systematically miss the curve.
      </p>
    </>
  );
}

/**
 * Normality of a paired t test's differences (item 18, #53): the same two
 * tests as `NormalityView`, run once on the row-by-row differences rather
 * than on each group.
 */
function PairedNormalityView({ r }: { readonly r: PairedNormalityResult }) {
  const passed = (p: number) => (p > 0.05 ? 'Yes' : 'No');
  return (
    <>
      <Headline reading={pairedNormalityReading(r)} />
      <p className="method">
        D’Agostino-Pearson omnibus K² test and Shapiro-Wilk test (Royston) on the differences (“
        {r.b.title}” − “{r.a.title}”, one per row), α = 0.05.
      </p>
      <div className="results-grid">
        <Grid
          label="D’Agostino & Pearson test"
          head={['D’Agostino & Pearson test', 'Differences']}
          rows={[
            ['K2', r.dagostino.ran ? sig(r.dagostino.k2) : (notRun(r.dagostino) ?? '')],
            ['P value', r.dagostino.ran ? pValue(r.dagostino.p) : '—'],
            ['Passed normality test (α = 0.05)?', r.dagostino.ran ? passed(r.dagostino.p) : '—'],
            ['P value summary', r.dagostino.ran ? stars(r.dagostino.p) : '—'],
          ]}
        />
        <Grid
          label="Shapiro-Wilk test"
          head={['Shapiro-Wilk test', 'Differences']}
          rows={[
            ['W', r.shapiroWilk.ran ? sig(r.shapiroWilk.w) : (notRun(r.shapiroWilk) ?? '')],
            ['P value', r.shapiroWilk.ran ? pValue(r.shapiroWilk.p) : '—'],
            [
              'Passed normality test (α = 0.05)?',
              r.shapiroWilk.ran ? passed(r.shapiroWilk.p) : '—',
            ],
            ['P value summary', r.shapiroWilk.ran ? stars(r.shapiroWilk.p) : '—'],
          ]}
        />
        <Grid
          label="Number of pairs"
          head={['Number of pairs', 'Differences']}
          rows={[
            ['n', String(r.n)],
            ...(r.droppedRows
              ? ([['Rows left out (a value missing on one side)', String(r.droppedRows)]] as Row[])
              : []),
          ]}
        />
      </div>
      <p className="legend">
        “Passed” means P &gt; 0.05: no clear departure from a Gaussian distribution, not proof of
        one. Asterisks: {STAR_SCHEME}.
      </p>
    </>
  );
}

function KruskalView({ r, id }: { readonly r: KruskalWallisResult; readonly id: Id }) {
  const sections: Section[] = [
    [
      'Kruskal-Wallis test',
      [
        ['P value', pValue(r.p)],
        ['Exact or approximate P value?', r.exact ? 'Exact' : 'Approximate (chi-square)'],
        ['P value summary', stars(r.p)],
        ['Do the groups differ significantly (P < 0.05)?', yesNo(r.p)],
        ['Number of groups', String(r.groups.length)],
        ['Kruskal-Wallis statistic', sig(r.h)],
      ],
    ],
  ];
  const adjusted = r.corrected;
  return (
    <>
      <Headline
        reading={kruskalReading(r)}
        figures={[
          pFigure('P value', r.p, r.exact ? 'exact' : 'approximate'),
          { label: 'Kruskal-Wallis statistic', value: sig(r.h) },
          ...(r.pairs.length ? [pairsFigure('Dunn’s', r.pairs, adjusted)] : []),
        ]}
      />
      <p className="method">{kruskalMethod(r)}</p>
      {r.pairs.length > 0 && (
        <div className="results-grid">
          <Grid
            label="Multiple comparisons"
            head={[
              `${adjusted ? 'Dunn’s' : 'Uncorrected Dunn’s'} multiple comparisons test`,
              'Mean rank diff.',
              'Summary',
              adjusted ? 'Adjusted P value' : 'Individual P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              stars(x.p),
              pValue(x.p),
            ])}
          />
        </div>
      )}
      <AllNumbers id={id}>
        <Sections sections={sections} />
        <Grid
          label="Data summary"
          head={['Data summary', 'n', 'Median', 'Sum of ranks', 'Mean rank']}
          rows={r.groups.map((g) => [
            `${g.title}${droppedText(g.dropped)}`,
            String(g.n),
            sig(g.median),
            sig(g.rankSum),
            sig(g.meanRank),
          ])}
        />
        {r.pairs.length > 0 && (
          <Grid
            label="Test details"
            head={[
              'Test details',
              'Mean rank 1',
              'Mean rank 2',
              'Mean rank diff.',
              'n1',
              'n2',
              'Z',
            ]}
            rows={r.pairs.map((x) => {
              const g1 = r.groups.find((g) => g.id === x.a.id);
              const g2 = r.groups.find((g) => g.id === x.b.id);
              return [
                `${x.a.title} vs. ${x.b.title}`,
                sig(g1?.meanRank ?? null),
                sig(g2?.meanRank ?? null),
                sig(x.diff),
                String(g1?.n ?? ''),
                String(g2?.n ?? ''),
                sig(x.z),
              ];
            })}
          />
        )}
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Dunn’s test gives no confidence intervals.{' '}
        {r.exact
          ? 'The Kruskal-Wallis P is exact: it counts every way the values could have been shared out among the groups.'
          : 'The Kruskal-Wallis P is approximate (chi-square), accurate unless the groups are small; small samples get an exact P.'}
      </p>
    </>
  );
}

function FriedmanView({ r, id }: { readonly r: FriedmanResult; readonly id: Id }) {
  const sections: Section[] = [
    [
      'Friedman test',
      [
        ['P value', pValue(r.p)],
        ['Exact or approximate P value?', r.exact ? 'Exact' : 'Approximate (chi-square)'],
        ['P value summary', stars(r.p)],
        ['Do the groups differ significantly (P < 0.05)?', yesNo(r.p)],
        ['Number of groups', String(r.groups.length)],
        ['Friedman statistic', sig(r.statistic)],
      ],
    ],
    [
      'Data analyzed',
      [
        ['Number of subjects (complete rows)', String(r.n)],
        ...(r.droppedRows
          ? ([['Rows left out (a value missing somewhere)', String(r.droppedRows)]] as Row[])
          : []),
      ],
    ],
  ];
  const adjusted = r.corrected;
  return (
    <>
      <Headline
        reading={friedmanReading(r)}
        figures={[
          pFigure('P value', r.p, r.exact ? 'exact' : 'approximate'),
          { label: 'Friedman statistic', value: sig(r.statistic) },
          ...(r.pairs.length ? [pairsFigure('Dunn’s', r.pairs, adjusted)] : []),
        ]}
      />
      <p className="method">{friedmanMethod(r)}</p>
      {r.pairs.length > 0 && (
        <div className="results-grid">
          <Grid
            label="Multiple comparisons"
            head={[
              `${adjusted ? 'Dunn’s' : 'Uncorrected Dunn’s'} multiple comparisons test`,
              'Mean rank diff.',
              'Summary',
              adjusted ? 'Adjusted P value' : 'Individual P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              stars(x.p),
              pValue(x.p),
            ])}
          />
        </div>
      )}
      <AllNumbers id={id}>
        <Sections sections={sections} />
        <Grid
          label="Data summary"
          head={['Data summary', 'Sum of ranks', 'Mean rank']}
          rows={r.groups.map((g) => [g.title, sig(g.rankSum), sig(g.meanRank)])}
        />
        {r.pairs.length > 0 && (
          <Grid
            label="Test details"
            head={['Test details', 'Mean rank 1', 'Mean rank 2', 'Mean rank diff.', 'Z']}
            rows={r.pairs.map((x) => {
              const g1 = r.groups.find((g) => g.id === x.a.id);
              const g2 = r.groups.find((g) => g.id === x.b.id);
              return [
                `${x.a.title} vs. ${x.b.title}`,
                sig(g1?.meanRank ?? null),
                sig(g2?.meanRank ?? null),
                sig(x.diff),
                sig(x.z),
              ];
            })}
          />
        )}
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Dunn’s test gives no confidence intervals.{' '}
        {r.exact
          ? 'The Friedman P is exact: it counts every way the ranks could have been reassigned within each row.'
          : 'The Friedman P is approximate (chi-square), accurate unless the table is small; small tables get an exact P.'}
      </p>
    </>
  );
}

const FAMILY_TITLE: Readonly<Record<string, string>> = {
  'within-rows': 'Within each row, compare data sets (simple effects)',
  'within-columns': 'Within each data set, compare rows (simple effects)',
  'main-columns': 'Compare data sets (main column effect)',
  'main-rows': 'Compare rows (main row effect)',
  'all-cells': 'Compare cell means regardless of rows and data sets',
};

/** Title for the families grid, depending on which factor is repeated (note 24). */
function repeatedFamilyTitle(r: RepeatedTwoWayResult): string {
  const between = r.options.repeatedFactor === 'column' ? 'rows' : 'data sets';
  const repeated = r.options.repeatedFactor === 'column' ? 'data sets' : 'rows';
  switch (r.options.family) {
    case 'main-between':
      return `Compare the ${between}, averaged over the ${repeated} (main effect)`;
    case 'main-repeated':
      return `Compare the ${repeated}, averaged over the ${between} (main effect)`;
    case 'simple':
      return `Within each ${repeated.replace(/s$/, '')}, compare the ${between} (simple effects)`;
  }
}

function RepeatedTwoWayView({ r, id }: { readonly r: RepeatedTwoWayResult; readonly id: Id }) {
  const between = r.options.repeatedFactor === 'column' ? 'Row factor' : 'Data set factor';
  const repeated = r.options.repeatedFactor === 'column' ? 'Data set factor' : 'Row factor';
  const f = (t: RepeatedTwoWayTerm) => (t.f !== null && t.df > 0 ? sig(t.f) : '');
  const c = r.options.comparisons;
  const test = c.kind === 'none' ? '' : (COMPARISON_TEST[c.test] ?? c.test);
  const qName = c.kind !== 'none' && c.test === 'tukey' ? 'q' : 't';
  return (
    <>
      <Headline
        reading={repeatedTwoWayReading(r)}
        figures={[
          pFigure(between, r.between.p ?? 1),
          pFigure(`${repeated} (GG corrected)`, r.repeatedGgP),
          pFigure('Interaction (GG corrected)', r.interactionGgP),
        ]}
      />
      <p className="method">{repeatedTwoWayMethod(r)}</p>
      {r.droppedSubjects > 0 && (
        <p className="status-banner info">
          {String(r.droppedSubjects)} {r.droppedSubjects === 1 ? 'subject' : 'subjects'} missing a
          value in some but not every {r.options.repeatedFactor === 'column' ? 'data set' : 'row'}{' '}
          left out.
        </p>
      )}
      {r.families.length > 0 && (
        <div className="results-grid">
          <h2 className="results-subhead">{repeatedFamilyTitle(r)}</h2>
          {r.families.map((fam, i) => (
            <Grid
              key={i}
              label={fam.label ?? 'Multiple comparisons'}
              head={[
                `${test} multiple comparisons${fam.label ? `: ${fam.label}` : ''}`,
                'Mean diff.',
                '95.00% CI of diff.',
                'Summary',
                'Adjusted P value',
              ]}
              rows={fam.pairs.map((x) => [
                `${x.a.title} vs. ${x.b.title}`,
                sig(x.diff),
                interval(x.ciLower, x.ciUpper),
                stars(x.p),
                pValue(x.p),
              ])}
            />
          ))}
        </div>
      )}
      <AllNumbers id={id}>
        <Grid
          label="ANOVA table"
          head={['ANOVA table', 'SS', 'DF', 'MS', 'F (DFn, DFd)', 'P value']}
          rows={[
            [
              between,
              sig(r.between.ss),
              dfText(r.between.df),
              sig(r.between.ms),
              `F (${dfText(r.between.df)}, ${dfText(r.subjects.df)}) = ${f(r.between)}`,
              r.between.p !== null ? pPhrase(r.between.p) : '',
            ],
            [
              'Subjects (matching)',
              sig(r.subjects.ss),
              dfText(r.subjects.df),
              sig(r.subjects.ms),
              '',
              '',
            ],
            [
              repeated,
              sig(r.repeated.ss),
              dfText(r.repeated.df),
              sig(r.repeated.ms),
              `F (${dfText(r.repeated.df)}, ${dfText(r.residual.df)}) = ${f(r.repeated)}`,
              r.repeated.p !== null ? pPhrase(r.repeated.p) : '',
            ],
            [
              'Interaction',
              sig(r.interaction.ss),
              dfText(r.interaction.df),
              sig(r.interaction.ms),
              `F (${dfText(r.interaction.df)}, ${dfText(r.residual.df)}) = ${f(r.interaction)}`,
              r.interaction.p !== null ? pPhrase(r.interaction.p) : '',
            ],
            ['Residual', sig(r.residual.ss), dfText(r.residual.df), sig(r.residual.ms), '', ''],
            ['Total', sig(r.total.ss), dfText(r.total.df), '', '', ''],
          ]}
        />
        <Sections
          sections={[
            [
              'Data summary',
              [
                ['Number of subjects', String(r.n)],
                [
                  `Number of ${r.options.repeatedFactor === 'column' ? 'rows' : 'data sets'} (between-subjects factor)`,
                  String(r.betweenLevels),
                ],
                [
                  `Number of ${r.options.repeatedFactor === 'column' ? 'data sets' : 'rows'} (repeated factor)`,
                  String(r.repeatedLevels),
                ],
                ['Geisser-Greenhouse epsilon', sig(r.ggEpsilon)],
                ['Huynh-Feldt epsilon', sig(r.hfEpsilon)],
                ['P value (Huynh-Feldt corrected, repeated factor)', pValue(r.repeatedHfP)],
                ['P value (Huynh-Feldt corrected, interaction)', pValue(r.interactionHfP)],
                ...(r.droppedSubjects > 0
                  ? ([['Subjects left out', String(r.droppedSubjects)]] as Row[])
                  : []),
              ],
            ],
          ]}
        />
        {r.families.length > 0 && (
          <Grid
            label="Test details"
            head={['Test details', 'Mean diff.', 'SE of diff.', qName, 'DF']}
            rows={r.families.flatMap((fam) =>
              fam.pairs.map((x) => [
                `${fam.label ? `${fam.label}: ` : ''}${x.a.title} vs. ${x.b.title}`,
                sig(x.diff),
                sig(x.se),
                sig(x.statistic),
                dfText(x.df),
              ]),
            )}
          />
        )}
      </AllNumbers>
      {r.families.length > 0 && (
        <p className="legend">
          Asterisks: {STAR_SCHEME}. Mean diff. is the first minus the second.{' '}
          {r.options.family === 'main-between'
            ? 'Uses the between-subjects error term (subjects within groups).'
            : r.options.family === 'main-repeated'
              ? 'Uses the pooled within-subject error term, assuming sphericity (as the ANOVA’s own repeated-factor test does).'
              : 'Uses the split-plot’s combined error term (part between-subjects, part within-subject), with Satterthwaite degrees of freedom.'}
        </p>
      )}
    </>
  );
}

function RepeatedTwoWayBothView({
  r,
  id,
}: {
  readonly r: RepeatedTwoWayBothResult;
  readonly id: Id;
}) {
  const f = (t: RepeatedTwoWayBothTerm) => (t.f !== null && t.df > 0 ? sig(t.f) : '');
  const errRow = (
    label: string,
    t: RepeatedTwoWayBothTerm,
    e: RepeatedTwoWayBothError,
  ): readonly [string, string, string, string, string, string] => [
    label,
    sig(t.ss),
    dfText(t.df),
    sig(t.ms),
    `F (${dfText(t.df)}, ${dfText(e.df)}) = ${f(t)}`,
    t.p !== null ? pPhrase(t.p) : '',
  ];
  return (
    <>
      <Headline
        reading={repeatedTwoWayBothReading(r)}
        figures={[
          pFigure('Row factor (GG corrected)', r.rowError.ggP),
          pFigure('Column factor (GG corrected)', r.columnError.ggP),
          pFigure('Interaction (GG corrected)', r.interactionError.ggP),
        ]}
      />
      <p className="method">{repeatedTwoWayBothMethod(r)}</p>
      {r.droppedSubjects > 0 && (
        <p className="status-banner info">
          {String(r.droppedSubjects)} {r.droppedSubjects === 1 ? 'subject' : 'subjects'} missing a
          value at some but not every row × data-set cell left out.
        </p>
      )}
      <AllNumbers id={id}>
        <Grid
          label="ANOVA table"
          head={['ANOVA table', 'SS', 'DF', 'MS', 'F (DFn, DFd)', 'P value']}
          rows={[
            ['Subjects', sig(r.subjects.ss), dfText(r.subjects.df), sig(r.subjects.ms), '', ''],
            errRow('Row factor', r.row, r.rowError),
            [
              'Row × subject error',
              sig(r.rowError.ss),
              dfText(r.rowError.df),
              sig(r.rowError.ms),
              '',
              '',
            ],
            errRow('Column factor', r.column, r.columnError),
            [
              'Column × subject error',
              sig(r.columnError.ss),
              dfText(r.columnError.df),
              sig(r.columnError.ms),
              '',
              '',
            ],
            errRow('Interaction', r.interaction, r.interactionError),
            [
              'Interaction × subject error',
              sig(r.interactionError.ss),
              dfText(r.interactionError.df),
              sig(r.interactionError.ms),
              '',
              '',
            ],
            ['Total', sig(r.total.ss), dfText(r.total.df), '', '', ''],
          ]}
        />
        <Sections
          sections={[
            [
              'Data summary',
              [
                ['Number of subjects', String(r.n)],
                ['Number of rows', String(r.rowLevels)],
                ['Number of data sets', String(r.columnLevels)],
                ['Geisser-Greenhouse epsilon (row)', sig(r.rowError.ggEpsilon)],
                ['Huynh-Feldt epsilon (row)', sig(r.rowError.hfEpsilon)],
                ['P value (Huynh-Feldt corrected, row)', pValue(r.rowError.hfP)],
                ['Geisser-Greenhouse epsilon (column)', sig(r.columnError.ggEpsilon)],
                ['Huynh-Feldt epsilon (column)', sig(r.columnError.hfEpsilon)],
                ['P value (Huynh-Feldt corrected, column)', pValue(r.columnError.hfP)],
                ['Geisser-Greenhouse epsilon (interaction)', sig(r.interactionError.ggEpsilon)],
                ['Huynh-Feldt epsilon (interaction)', sig(r.interactionError.hfEpsilon)],
                ['P value (Huynh-Feldt corrected, interaction)', pValue(r.interactionError.hfP)],
                ...(r.droppedSubjects > 0
                  ? ([['Subjects left out', String(r.droppedSubjects)]] as Row[])
                  : []),
              ],
            ],
          ]}
        />
      </AllNumbers>
    </>
  );
}

function TwoWayView({ r, id }: { readonly r: TwoWayResult; readonly id: Id }) {
  const terms: (readonly [string, TwoWayTerm])[] = [
    ...(r.interaction ? ([['Interaction', r.interaction]] as const) : []),
    ['Row factor', r.row],
    ['Column factor', r.column],
  ];
  const c = r.options.comparisons;
  const test = c.kind === 'none' ? '' : (COMPARISON_TEST[c.test] ?? c.test);
  const qName = c.kind !== 'none' && c.test === 'tukey' ? 'q' : 't';
  const notes: string[] = [];
  if (r.emptyRows > 0)
    notes.push(
      `${String(r.emptyRows)} ${r.emptyRows === 1 ? 'row' : 'rows'} without values left out`,
    );
  if (r.droppedValues > 0)
    notes.push(
      `${String(r.droppedValues)} empty or excluded ${r.droppedValues === 1 ? 'value' : 'values'} left out`,
    );
  return (
    <>
      <Headline
        reading={twoWayReading(r)}
        figures={terms.map(([name, t]) => pFigure(name, t.p, `${sig(t.percent)}% of variation`))}
      />
      <p className="method">{twoWayMethod(r)}</p>
      {r.comparisonsNote && (
        <p className="status-banner info">
          {r.comparisonsNote === 'empty-cell'
            ? 'Multiple comparisons aren’t available when a cell has no values (the model without interaction gives means that depend on its fit); fill in the cell, or compare fewer groups.'
            : 'Comparisons within rows, within data sets or between cells need more than one value per cell. Compare the main effects instead.'}
        </p>
      )}
      {r.families.length > 0 && (
        <div className="results-grid">
          <h2 className="results-subhead">{FAMILY_TITLE[r.options.family]}</h2>
          {r.families.map((f, i) => (
            <Grid
              key={i}
              label={f.label ?? 'Multiple comparisons'}
              head={[
                `${test} multiple comparisons${f.label ? `: ${f.label}` : ''}`,
                'Mean diff.',
                '95.00% CI of diff.',
                'Summary',
                'Adjusted P value',
              ]}
              rows={f.pairs.map((x) => [
                `${x.a.title} vs. ${x.b.title}`,
                sig(x.diff),
                interval(x.ciLower, x.ciUpper),
                stars(x.p),
                pValue(x.p),
              ])}
            />
          ))}
        </div>
      )}
      <AllNumbers id={id}>
        <Grid
          label="Source of variation"
          head={['Source of variation', '% of total variation', 'P value', 'P value summary']}
          rows={terms.map(([name, t]) => [name, sig(t.percent), pValue(t.p), stars(t.p)])}
        />
        <Grid
          label="ANOVA table"
          head={['ANOVA table', 'SS (Type III)', 'DF', 'MS', 'F (DFn, DFd)', 'P value']}
          rows={[
            ...terms.map(([name, t]) => [
              name,
              sig(t.ss),
              dfText(t.df),
              sig(t.ms),
              `F (${dfText(t.df)}, ${dfText(r.residual.df)}) = ${sig(t.f)}`,
              pPhrase(t.p),
            ]),
            ['Residual', sig(r.residual.ss), dfText(r.residual.df), sig(r.residual.ms), '', ''],
            ['Total', sig(r.total.ss), dfText(r.total.df), '', '', ''],
          ]}
        />
        <Grid
          label="Cell means"
          head={['Mean (n)', ...r.columns.map((x) => x.title)]}
          rows={r.rows.map((row, i) => [
            row.title,
            ...r.columns.map((_, j) => {
              const cell = r.cells[i]?.[j];
              return cell && cell.n > 0 ? `${sig(cell.mean)} (${String(cell.n)})` : '—';
            }),
          ])}
        />
        <Sections
          sections={[
            [
              'Data summary',
              [
                ['Number of data sets (column factor)', String(r.columns.length)],
                ['Number of rows (row factor)', String(r.rows.length)],
                ['Number of values', String(r.nTotal)],
                ...(notes.length ? ([['Left out', notes.join('; ')]] as Row[]) : []),
              ],
            ],
          ]}
        />
        {r.families.length > 0 && (
          <Grid
            label="Test details"
            head={['Test details', 'Mean diff.', 'SE of diff.', qName, 'DF']}
            rows={r.families.flatMap((f) =>
              f.pairs.map((x) => [
                `${f.label ? `${f.label}: ` : ''}${x.a.title} vs. ${x.b.title}`,
                sig(x.diff),
                sig(x.se),
                sig(x.statistic),
                dfText(x.df),
              ]),
            )}
          />
        )}
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Mean diff. is the first minus the second. Main effects compare
        least-squares means (the average of the cell means). With unbalanced data the Type III sums
        of squares don’t add up to the total.
      </p>
    </>
  );
}

function OneWayView({ r, id }: { readonly r: OneWayResult; readonly id: Id }) {
  const a = r.anova;
  const sections: Section[] = [];
  if (r.welchAnova && r.brownForsytheAnova) {
    sections.push(
      fSection(
        'Brown-Forsythe ANOVA test',
        'F*',
        r.brownForsytheAnova,
        'Significant difference among means (P < 0.05)?',
      ),
      fSection(
        'Welch’s ANOVA test',
        'W',
        r.welchAnova,
        'Significant difference among means (P < 0.05)?',
      ),
    );
  } else {
    sections.push([
      'ANOVA summary',
      [
        ['F', sig(a.f)],
        ['P value', pValue(a.p)],
        ['P value summary', stars(a.p)],
        ['Significant difference among means (P < 0.05)?', yesNo(a.p)],
        ['R squared', sig(a.rSquared)],
      ],
    ]);
  }
  sections.push(
    r.brownForsythe
      ? fSection(
          'Brown-Forsythe test (are the SDs equal?)',
          'F',
          r.brownForsythe,
          'Are the SDs significantly different (P < 0.05)?',
        )
      : [
          'Brown-Forsythe test (are the SDs equal?)',
          [
            [
              'Brown-Forsythe test',
              r.from === 'summary'
                ? 'Needs the values (it compares distances from each group’s median)'
                : 'Not defined: no group has any scatter',
            ],
          ],
        ],
  );
  sections.push([
    'Bartlett’s test (are the SDs equal?)',
    r.bartlett
      ? [
          ['Bartlett’s statistic (corrected)', sig(r.bartlett.statistic)],
          ['P value', pValue(r.bartlett.p)],
          ['P value summary', stars(r.bartlett.p)],
          ['Are the SDs significantly different (P < 0.05)?', yesNo(r.bartlett.p)],
        ]
      : [
          [
            'Bartlett’s test',
            'Not run: needs at least five values, with some scatter, in every group',
          ],
        ],
  ]);
  const c = r.comparisons;
  const name = c.kind === 'none' ? '' : (COMPARISON_TEST[c.test] ?? c.test);
  const qName = c.kind !== 'none' && (c.test === 'tukey' || c.test === 'games-howell') ? 'q' : 't';
  return (
    <>
      <Headline
        reading={oneWayReading(r)}
        figures={[
          pFigure(r.welchAnova ? 'P value (Welch’s ANOVA)' : 'P value (ANOVA)', oneWayP(r)),
          r.welchAnova
            ? {
                label: 'W (DFn, DFd)',
                value: sig(r.welchAnova.f),
                detail: `DFn = ${dfText(r.welchAnova.dfn)}, DFd = ${dfText(r.welchAnova.dfd)}`,
              }
            : {
                label: 'F (DFn, DFd)',
                value: sig(a.f),
                detail: `DFn = ${dfText(a.dfBetween)}, DFd = ${dfText(a.dfWithin)}`,
              },
          ...(r.pairs.length ? [pairsFigure(name, r.pairs, true)] : []),
        ]}
      />
      <p className="method">{oneWayMethod(r)}</p>
      {r.pairs.length > 0 && (
        <div className="results-grid">
          <Grid
            label="Multiple comparisons"
            head={[
              `${name} multiple comparisons test`,
              'Mean diff.',
              '95.00% CI of diff.',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              stars(x.p),
              pValue(x.p),
            ])}
          />
        </div>
      )}
      <AllNumbers id={id}>
        <Sections sections={sections} />
        {!r.welch && (
          <Grid
            label="ANOVA table"
            head={['ANOVA table', 'SS', 'DF', 'MS', 'F (DFn, DFd)', 'P value']}
            rows={[
              [
                'Treatment (between columns)',
                sig(a.ssBetween),
                dfText(a.dfBetween),
                sig(a.msBetween),
                `F (${dfText(a.dfBetween)}, ${dfText(a.dfWithin)}) = ${sig(a.f)}`,
                pPhrase(a.p),
              ],
              [
                'Residual (within columns)',
                sig(a.ssWithin),
                dfText(a.dfWithin),
                sig(a.msWithin),
                '',
                '',
              ],
              ['Total', sig(a.ssTotal), dfText(a.dfTotal), '', '', ''],
            ]}
          />
        )}
        <Grid
          label="Data summary"
          head={['Data summary', 'n', 'Mean', 'SD', ...(r.from === 'values' ? ['Median'] : [])]}
          rows={r.groups.map((g) => [
            `${g.title}${droppedText(g.dropped)}`,
            String(g.n),
            sig(g.mean),
            sig(g.sd),
            ...(r.from === 'values' ? [sig(g.median)] : []),
          ])}
        />
        {r.pairs.length > 0 && (
          <Grid
            label="Test details"
            head={[
              'Test details',
              'Mean 1',
              'Mean 2',
              'Mean diff.',
              'SE of diff.',
              'n1',
              'n2',
              qName,
              'DF',
            ]}
            rows={r.pairs.map((x) => {
              const g1 = r.groups.find((g) => g.id === x.a.id);
              const g2 = r.groups.find((g) => g.id === x.b.id);
              return [
                `${x.a.title} vs. ${x.b.title}`,
                sig(g1?.mean ?? null),
                sig(g2?.mean ?? null),
                sig(x.diff),
                sig(x.se),
                String(g1?.n ?? ''),
                String(g2?.n ?? ''),
                sig(x.statistic),
                dfText(x.df),
              ];
            })}
          />
        )}
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s.
      </p>
    </>
  );
}

function RepeatedMeasuresView({ r, id }: { readonly r: RepeatedMeasuresResult; readonly id: Id }) {
  const a = r.anova;
  const c = r.comparisons;
  const name = c.kind === 'none' ? '' : (COMPARISON_TEST[c.test] ?? c.test);
  const twoGroups = r.groups.length === 2;
  const sections: Section[] = [
    [
      'ANOVA summary',
      [
        ['F', sig(a.f)],
        ['P value (Geisser-Greenhouse corrected)', pValue(r.ggP)],
        ['P value summary', stars(r.ggP)],
        ['Significant difference among means (P < 0.05)?', yesNo(r.ggP)],
        ['Geisser-Greenhouse epsilon', sig(r.ggEpsilon)],
        ['P value (uncorrected)', pValue(a.p)],
        ['P value (Huynh-Feldt corrected)', pValue(r.hfP)],
        ['Huynh-Feldt epsilon', sig(r.hfEpsilon)],
        ['R squared (treatment effect)', sig(a.rSquaredTreatment)],
        ['R squared (matching effectiveness)', sig(a.rSquaredSubjects)],
      ],
    ],
  ];
  return (
    <>
      <Headline
        reading={repeatedReading(r)}
        figures={[
          pFigure('P value (GG corrected)', repeatedP(r)),
          {
            label: 'F (DFn, DFd)',
            value: sig(a.f),
            detail: `DFn = ${dfText(a.dfTreatment)}, DFd = ${dfText(a.dfResidual)}`,
          },
          ...(r.pairs.length ? [pairsFigure(name, r.pairs, true)] : []),
        ]}
      />
      <p className="method">{repeatedMethod(r)}</p>
      {r.pairs.length > 0 && (
        <div className="results-grid">
          <Grid
            label="Multiple comparisons"
            head={[
              `${name} multiple comparisons test`,
              'Mean diff.',
              '95.00% CI of diff.',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              stars(x.p),
              pValue(x.p),
            ])}
          />
        </div>
      )}
      <AllNumbers id={id}>
        <Sections sections={sections} />
        <Grid
          label="ANOVA table"
          head={['ANOVA table', 'SS', 'DF', 'MS', 'F (DFn, DFd)', 'P value']}
          rows={[
            [
              'Treatment',
              sig(a.ssTreatment),
              dfText(a.dfTreatment),
              sig(a.msTreatment),
              `F (${dfText(a.dfTreatment)}, ${dfText(a.dfResidual)}) = ${sig(a.f)}`,
              pPhrase(a.p),
            ],
            [
              'Subjects (matching)',
              sig(a.ssSubjects),
              dfText(a.dfSubjects),
              sig(a.msSubjects),
              '',
              '',
            ],
            ['Residual', sig(a.ssResidual), dfText(a.dfResidual), sig(a.msResidual), '', ''],
            ['Total', sig(a.ssTotal), dfText(a.dfTotal), '', '', ''],
          ]}
        />
        <Grid
          label="Data summary"
          head={['Data summary', 'Mean']}
          rows={r.groups.map((g) => [g.title, sig(g.mean)])}
        />
        <Grid
          label="Data analyzed"
          head={['Data analyzed', '']}
          rows={[
            ['Number of subjects (complete rows)', String(r.n)],
            ...(r.droppedRows
              ? ([['Rows left out (a value missing somewhere)', String(r.droppedRows)]] as Row[])
              : []),
          ]}
        />
        {r.pairs.length > 0 && (
          <Grid
            label="Test details"
            head={[
              'Test details',
              'Mean 1',
              'Mean 2',
              'Mean diff.',
              'SE of diff.',
              name === 'Tukey’s' ? 'q' : 't',
              'DF',
            ]}
            rows={r.pairs.map((x) => {
              const g1 = r.groups.find((g) => g.id === x.a.id);
              const g2 = r.groups.find((g) => g.id === x.b.id);
              return [
                `${x.a.title} vs. ${x.b.title}`,
                sig(g1?.mean ?? null),
                sig(g2?.mean ?? null),
                sig(x.diff),
                sig(x.se),
                sig(x.statistic),
                dfText(x.df),
              ];
            })}
          />
        )}
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s.{' '}
        {twoGroups
          ? 'With two groups, epsilon is always 1 and every P agrees.'
          : 'The Geisser-Greenhouse corrected P is the one reported by default; the uncorrected and Huynh-Feldt P are under “All numbers”.'}
      </p>
    </>
  );
}

function NestedRepeatedView({ r, id }: { readonly r: NestedRepeatedResult; readonly id: Id }) {
  const a = r.anova;
  const c = r.comparisons;
  const name = c.kind === 'none' ? '' : (COMPARISON_TEST[c.test] ?? c.test);
  const twoGroups = r.groups.length === 2;
  const sections: Section[] = [
    [
      'ANOVA summary',
      [
        ['F', sig(a.f)],
        ['P value (Geisser-Greenhouse corrected)', pValue(r.ggP)],
        ['P value summary', stars(r.ggP)],
        ['Significant difference among means (P < 0.05)?', yesNo(r.ggP)],
        ['Geisser-Greenhouse epsilon', sig(r.ggEpsilon)],
        ['P value (uncorrected)', pValue(a.p)],
        ['P value (Huynh-Feldt corrected)', pValue(r.hfP)],
        ['Huynh-Feldt epsilon', sig(r.hfEpsilon)],
        ['R squared (treatment effect)', sig(a.rSquaredTreatment)],
        ['R squared (matching effectiveness)', sig(a.rSquaredSubjects)],
      ],
    ],
  ];
  return (
    <>
      <Headline
        reading={nestedRepeatedReading(r)}
        figures={[
          pFigure('P value (GG corrected)', nestedRepeatedP(r)),
          {
            label: 'F (DFn, DFd)',
            value: sig(a.f),
            detail: `DFn = ${dfText(a.dfTreatment)}, DFd = ${dfText(a.dfResidual)}`,
          },
          ...(r.pairs.length ? [pairsFigure(name, r.pairs, true)] : []),
        ]}
      />
      <p className="method">{nestedRepeatedMethod(r)}</p>
      {r.pairs.length > 0 && (
        <div className="results-grid">
          <Grid
            label="Multiple comparisons"
            head={[
              `${name} multiple comparisons test`,
              'Mean diff.',
              '95.00% CI of diff.',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              stars(x.p),
              pValue(x.p),
            ])}
          />
        </div>
      )}
      <AllNumbers id={id}>
        <Sections sections={sections} />
        <Grid
          label="ANOVA table"
          head={['ANOVA table', 'SS', 'DF', 'MS', 'F (DFn, DFd)', 'P value']}
          rows={[
            [
              'Treatment',
              sig(a.ssTreatment),
              dfText(a.dfTreatment),
              sig(a.msTreatment),
              `F (${dfText(a.dfTreatment)}, ${dfText(a.dfResidual)}) = ${sig(a.f)}`,
              pPhrase(a.p),
            ],
            [
              'Replicates (matching)',
              sig(a.ssSubjects),
              dfText(a.dfSubjects),
              sig(a.msSubjects),
              '',
              '',
            ],
            ['Residual', sig(a.ssResidual), dfText(a.dfResidual), sig(a.msResidual), '', ''],
            ['Total', sig(a.ssTotal), dfText(a.dfTotal), '', '', ''],
          ]}
        />
        <Grid
          label="Data summary"
          head={['Data summary', 'Mean']}
          rows={r.groups.map((g) => [g.title, sig(g.mean)])}
        />
        <Grid
          label="Data analyzed"
          head={['Data analyzed', '']}
          rows={[
            ['Number of matched replicates', String(r.n)],
            ...(r.droppedReplicates
              ? ([
                  [
                    'Replicates left out (no usable value in any group)',
                    String(r.droppedReplicates),
                  ],
                ] as Row[])
              : []),
            ...(r.unmatched.length
              ? ([
                  [
                    'Replicates left out (values in some groups but not every group)',
                    r.unmatched.join(', '),
                  ],
                ] as Row[])
              : []),
          ]}
        />
        {r.pairs.length > 0 && (
          <Grid
            label="Test details"
            head={[
              'Test details',
              'Mean 1',
              'Mean 2',
              'Mean diff.',
              'SE of diff.',
              name === 'Tukey’s' ? 'q' : 't',
              'DF',
            ]}
            rows={r.pairs.map((x) => {
              const g1 = r.groups.find((g) => g.id === x.a.id);
              const g2 = r.groups.find((g) => g.id === x.b.id);
              return [
                `${x.a.title} vs. ${x.b.title}`,
                sig(g1?.mean ?? null),
                sig(g2?.mean ?? null),
                sig(x.diff),
                sig(x.se),
                sig(x.statistic),
                dfText(x.df),
              ];
            })}
          />
        )}
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s.{' '}
        {twoGroups
          ? 'With two groups, epsilon is always 1 and every P agrees.'
          : 'The Geisser-Greenhouse corrected P is the one reported by default; the uncorrected and Huynh-Feldt P are under “All numbers”.'}
      </p>
    </>
  );
}

function NestedOneWayView({ r, id }: { readonly r: NestedOneWayResult; readonly id: Id }) {
  const a = r.anova;
  const c = r.comparisons;
  const name = c.kind === 'none' ? '' : (COMPARISON_TEST[c.test] ?? c.test);
  const sections: Section[] = [
    [
      'ANOVA summary',
      [
        ['F (DFn, DFd)', `F (${dfText(a.dfn)}, ${dfText(a.dfd)}) = ${sig(a.f)}`],
        ['P value', pValue(a.p)],
        ['P value summary', stars(a.p)],
        ['Significant difference among means (P < 0.05)?', yesNo(a.p)],
      ],
    ],
    [
      'How much comes from replicate to replicate, versus within one?',
      [
        ['Between-replicate SD', sig(r.betweenReplicateSd)],
        ['Within-replicate SD', sig(r.withinReplicateSd)],
      ],
    ],
  ];
  return (
    <>
      <Headline
        reading={nestedOneWayReading(r)}
        figures={[
          pFigure('P value (ANOVA)', a.p),
          {
            label: 'F (DFn, DFd)',
            value: sig(a.f),
            detail: `DFn = ${dfText(a.dfn)}, DFd = ${dfText(a.dfd)}`,
          },
          ...(r.pairs.length ? [pairsFigure(name, r.pairs, true)] : []),
        ]}
      />
      <p className="method">{nestedOneWayMethod(r)}</p>
      {r.pairs.length > 0 && (
        <div className="results-grid">
          <Grid
            label="Multiple comparisons"
            head={[
              `${name} multiple comparisons test`,
              'Mean diff.',
              '95% CI of diff.',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              stars(x.p),
              pValue(x.p),
            ])}
          />
        </div>
      )}
      <AllNumbers id={id}>
        <Sections sections={sections} />
        <Grid
          label="Data summary"
          head={['Data summary', 'Replicates', 'Values', 'Mean']}
          rows={r.groups.map((g) => [
            `${g.title}${nestedDroppedText(g.dropped)}`,
            String(g.nReplicates),
            String(g.nValues),
            sig(g.mean),
          ])}
        />
      </AllNumbers>
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s.
      </p>
    </>
  );
}

const DESCRIPTIVE_ROWS: readonly (readonly [string, (g: DescribedGroup) => string])[] = [
  ['Number of values', (g) => (g.n === null ? '—' : `${String(g.n)}${droppedText(g.dropped)}`)],
  ['Minimum', (g) => sig(g.min)],
  ['25% percentile', (g) => sig(g.q1)],
  ['Median', (g) => sig(g.median)],
  ['75% percentile', (g) => sig(g.q3)],
  ['Maximum', (g) => sig(g.max)],
  ['Range', (g) => sig(g.range)],
  ['Mean', (g) => sig(g.mean)],
  ['Std. deviation', (g) => sig(g.sd)],
  ['Std. error of mean', (g) => sig(g.sem)],
  ['Lower 95% CI of mean', (g) => sig(g.ciLower)],
  ['Upper 95% CI of mean', (g) => sig(g.ciUpper)],
  ['Coefficient of variation', (g) => (g.cv === null ? '—' : `${sig(g.cv)}%`)],
  ['Geometric mean', (g) => sig(g.geomean)],
  ['Sum', (g) => sig(g.sum)],
];

/** One statistics table, headed by each group's title: shared by Column groups, Grouped cells and pooled data sets. */
function StatsTable({ groups }: { readonly groups: readonly DescribedGroup[] }) {
  return (
    <div className="results-scroll">
      <table className="results-table wide">
        <thead>
          <tr>
            <th scope="col" />
            {groups.map((g) => (
              <th key={g.id} scope="col">
                {g.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DESCRIPTIVE_ROWS.map(([label, f]) => (
            <tr key={label}>
              <th scope="row" title={explain(label)}>
                {label}
              </th>
              {groups.map((g) => (
                <td key={g.id}>{f(g)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DESCRIPTIVE_LEGEND =
  '— means not defined for these values (e.g. the SD of a single value, a geometric mean with ' +
  'values of 0 or below) or not available from summary data. Percentiles are found from rank (n + 1) × p, interpolated.';

function DescriptiveView({ r }: { readonly r: DescriptiveResult }) {
  if (r.kind === 'column') {
    return (
      <>
        <StatsTable groups={r.groups} />
        <p className="legend">{DESCRIPTIVE_LEGEND}</p>
      </>
    );
  }
  const cellGroups: DescribedGroup[] = r.rows.flatMap((row, ri) =>
    r.columns.map((col, ci): DescribedGroup => {
      const g = r.cells[ri]?.[ci];
      const title = `${row.title} · ${col.title}`;
      return g ? { ...g, title } : { ...EMPTY_CELL, id: `${row.id}/${col.id}`, title };
    }),
  );
  const pooledGroups = r.pooled?.map((g, i) => ({ ...g, title: r.columns[i]?.title ?? g.title }));
  return (
    <>
      <p className="hint">Per cell (row × data set):</p>
      <StatsTable groups={cellGroups} />
      {pooledGroups ? (
        <>
          <p className="hint">Per data set, pooled over every row:</p>
          <StatsTable groups={pooledGroups} />
        </>
      ) : (
        <p className="hint">
          Pooled statistics for each data set aren’t available from summary data: recovering the
          median, quartiles, minimum and maximum of the pooled rows needs the individual values.
        </p>
      )}
      <p className="legend">{DESCRIPTIVE_LEGEND}</p>
    </>
  );
}

const NESTED_REPLICATE_ROWS: readonly (readonly [string, (r: DescribedReplicate) => string])[] = [
  ['Number of values (n)', (r) => String(r.n)],
  ['Mean', (r) => sig(r.mean)],
  ['Std. deviation', (r) => sig(r.sd)],
  ['Std. error of mean', (r) => sig(r.sem)],
];

/** One replicate-level statistics table, headed by each replicate's title. */
function ReplicateStatsTable({
  replicates,
}: {
  readonly replicates: readonly DescribedReplicate[];
}) {
  return (
    <div className="results-scroll">
      <table className="results-table wide">
        <thead>
          <tr>
            <th scope="col" />
            {replicates.map((r, i) => (
              <th key={`${r.title}-${String(i)}`} scope="col">
                {r.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NESTED_REPLICATE_ROWS.map(([label, f]) => (
            <tr key={label}>
              <th scope="row" title={explain(label)}>
                {label}
              </th>
              {replicates.map((r, i) => (
                <td key={`${r.title}-${String(i)}`}>{f(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NESTED_DESCRIPTIVE_LEGEND =
  '— means not defined for these values (e.g. the SD of a single replicate or a single value). ' +
  'Group summary: from each replicate’s own mean, the same n a nested t test or nested one-way ' +
  'ANOVA would use. Pooled: every individual value, ignoring the replicate structure — for ' +
  'reference only, never for a test or an error bar. Pooling inflates the apparent sample size ' +
  'and can manufacture significance that isn’t there (pseudoreplication).';

function NestedDescriptiveView({ r }: { readonly r: NestedDescriptiveResult }) {
  return (
    <>
      <div className="results-grid">
        <Grid
          label="Group summary (from the replicate means)"
          head={['Group', 'Replicates (n)', 'Mean', 'SD', 'SEM', '95% CI']}
          rows={r.groups.map((g) => [
            `${g.title}${nestedDroppedText(g.droppedReplicates)}`,
            String(g.group.n),
            sig(g.group.mean),
            sig(g.group.sd),
            sig(g.group.sem),
            interval(g.group.ciLower, g.group.ciUpper),
          ])}
        />
      </div>
      {r.groups.map((g) => (
        <div key={g.id}>
          <p className="hint">{g.title}, per replicate:</p>
          <ReplicateStatsTable replicates={g.replicates} />
        </div>
      ))}
      <div className="results-grid">
        <Grid
          label="Pooled over every individual value (for reference only)"
          head={['Group', 'n (values)', 'Mean', 'SD']}
          rows={r.groups.map((g) => [
            g.title,
            String(g.pooled.n),
            sig(g.pooled.mean),
            sig(g.pooled.sd),
          ])}
        />
      </div>
      <p className="legend">{NESTED_DESCRIPTIVE_LEGEND}</p>
    </>
  );
}

const EMPTY_CELL: DescribedGroup = {
  id: '',
  title: '',
  from: 'values',
  n: 0,
  dropped: { empty: 0, excluded: 0 },
  min: null,
  q1: null,
  median: null,
  q3: null,
  max: null,
  range: null,
  mean: null,
  sd: null,
  sem: null,
  ciLower: null,
  ciUpper: null,
  cv: null,
  geomean: null,
  sum: null,
};

/** Whether the analysis is being (re)calculated. */
function working(analysis: Analysis): boolean {
  const state = getResults().recompute.status(analysis.id).state;
  return state === 'running' || state === 'stale';
}

/**
 * The analysis's state. Work in progress over results already shown is a
 * note over them (which fade), so coming and going moves nothing; with
 * nothing shown yet, and for problems, a banner.
 */
function Status({
  analysis,
  over,
}: {
  readonly analysis: Analysis;
  readonly over: boolean;
}): ReactNode {
  const bridge = getResults();
  const status = bridge.recompute.status(analysis.id);
  const engine = bridge.engineState();
  if (status.state === 'fresh') return null;
  if (status.state === 'running' || status.state === 'stale') {
    const text =
      engine.kind === 'starting'
        ? 'Starting the statistics engine (the first time only; about 17 MB, then it works offline)…'
        : status.state === 'running'
          ? 'Calculating…'
          : 'Updating…';
    const stop = status.state === 'running' && engine.kind !== 'starting' && (
      <button
        type="button"
        onClick={() => {
          bridge.stop(analysis.id);
        }}
      >
        Stop
      </button>
    );
    return over ? (
      <div className="results-busy">
        <p className="busy-note" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>{text}</span>
          {stop}
        </p>
      </div>
    ) : (
      <p className="status-banner" role="status">
        {text} {stop}
      </p>
    );
  }
  switch (status.state) {
    case 'blocked':
      return (
        <p className="status-banner info" role="status">
          {status.message}
        </p>
      );
    case 'error':
      return (
        <p className="status-banner error" role="alert">
          {status.message}{' '}
          <button
            type="button"
            onClick={() => {
              bridge.retry(analysis.id);
            }}
          >
            Run again
          </button>
        </p>
      );
  }
}

interface SectionProps extends Props {
  /** Its place on the experiment's page. */
  readonly number: number;
  readonly note?: ReactNode;
}

/** An analysis as a section of its experiment's page (item 08). */
export function ResultsSection({ project, analysis, number, note }: SectionProps) {
  const bridge = getResults();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
  const [editing, setEditing] = useState(false);
  // While it is recalculated, the last result stays, faded under a note
  // (never as if current), so the page doesn't collapse and grow back.
  const busy = working(analysis);
  const entry = busy
    ? bridge.recompute.previous(analysis.id)
    : bridge.recompute.result(analysis.id);
  const source =
    analysis.input.kind === 'table' ? project.tables.get(analysis.input.table) : undefined;
  const value = entry?.ok ? entry.value : null;

  return (
    <PageSection
      id={analysis.id}
      number={number}
      title={analysis.title}
      className="results"
      onRename={(title) => {
        store.edit({ op: 'setAnalysis', analysis: { ...analysis, title } });
      }}
      menu={[
        {
          label: 'Delete',
          onSelect: () => {
            if (store.edit({ op: 'removeAnalysis', analysis: analysis.id })) {
              store.notify(`Deleted “${analysis.title}”. Undo brings it back (Ctrl+Z).`);
            }
          },
        },
      ]}
      actions={
        <>
          {analysis.kind !== 'graph-summary' && (
            <button
              type="button"
              className="link"
              onClick={() => {
                openGuide(ANALYSIS_PAGE[analysis.kind]);
              }}
            >
              How to read these results
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing(true);
            }}
          >
            Change analysis…
          </button>
        </>
      }
      note={note}
    >
      <div
        className={value !== null && busy ? 'results-body busy' : 'results-body'}
        aria-busy={busy}
      >
        <Status analysis={analysis} over={value !== null} />
        {value !== null && analysis.kind === 't-test' && (
          <TTestView r={value as unknown as TTestResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'nested-t-test' && (
          <NestedTTestView r={value as unknown as NestedTTestResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'nested-one-way-anova' && (
          <NestedOneWayView r={value as unknown as NestedOneWayResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'normality' && (
          <NormalityView r={value as unknown as NormalityResult} />
        )}
        {value !== null && analysis.kind === 'nested-normality' && (
          <NestedNormalityView r={value as unknown as NestedNormalityResult} />
        )}
        {value !== null && analysis.kind === 'paired-normality' && (
          <PairedNormalityView r={value as unknown as PairedNormalityResult} />
        )}
        {value !== null && analysis.kind === 'contingency-chi-square' && (
          <ContingencyChiSquareView r={value as unknown as ContingencyChiSquareResult} />
        )}
        {value !== null && analysis.kind === 'contingency-fisher' && (
          <ContingencyFisherView r={value as unknown as ContingencyFisherResult} />
        )}
        {value !== null && analysis.kind === 'correlation' && (
          <CorrelationView r={value as unknown as CorrelationResult} />
        )}
        {value !== null && analysis.kind === 'linear-regression' && (
          <LinearRegressionView r={value as unknown as LinearRegressionResult} />
        )}
        {value !== null && analysis.kind === 'nonlinear-regression' && (
          <NonlinearRegressionView r={value as unknown as NonlinearRegressionResult} />
        )}
        {value !== null && analysis.kind === 'growth-curve' && (
          <GrowthCurveView r={value as unknown as GrowthCurveResult} />
        )}
        {value !== null && analysis.kind === 'two-way-anova' && (
          <TwoWayView r={value as unknown as TwoWayResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'repeated-two-way-anova' && (
          <RepeatedTwoWayView r={value as unknown as RepeatedTwoWayResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'repeated-two-way-anova-both' && (
          <RepeatedTwoWayBothView
            r={value as unknown as RepeatedTwoWayBothResult}
            id={analysis.id}
          />
        )}
        {value !== null && analysis.kind === 'kruskal-wallis' && (
          <KruskalView r={value as unknown as KruskalWallisResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'one-way-anova' && (
          <OneWayView r={value as unknown as OneWayResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'repeated-measures-anova' && (
          <RepeatedMeasuresView r={value as unknown as RepeatedMeasuresResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'nested-repeated-anova' && (
          <NestedRepeatedView r={value as unknown as NestedRepeatedResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'friedman' && (
          <FriedmanView r={value as unknown as FriedmanResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'rank-test' && (
          <RankTestView r={value as unknown as RankTestResult} id={analysis.id} />
        )}
        {value !== null && analysis.kind === 'descriptive' && (
          <DescriptiveView r={value as unknown as DescriptiveResult} />
        )}
        {value !== null && analysis.kind === 'nested-descriptive' && (
          <NestedDescriptiveView r={value as unknown as NestedDescriptiveResult} />
        )}
        {entry?.ok && ((value as { warnings?: string[] } | null)?.warnings ?? []).length > 0 && (
          <ul className="warnings">
            {(value as { warnings: string[] }).warnings.map((w) => (
              <li key={w}>R warned: {w}</li>
            ))}
          </ul>
        )}
      </div>
      {editing && source && (
        <AnalyzeDialog
          table={source}
          analysis={analysis}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </PageSection>
  );
}
