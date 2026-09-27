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

import type { DescribedGroup, DescriptiveResult } from '@/analyses/descriptive/types';
import type { FriedmanResult } from '@/analyses/friedman/types';
import type { KruskalWallisResult } from '@/analyses/kruskal/types';
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
  friedmanMethod,
  friedmanReading,
  kruskalMethod,
  kruskalReading,
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
              'Significant?',
              'Summary',
              adjusted ? 'Adjusted P value' : 'Individual P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              x.p < 0.05 ? 'Yes' : 'No',
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
              'Significant?',
              'Summary',
              adjusted ? 'Adjusted P value' : 'Individual P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              x.p < 0.05 ? 'Yes' : 'No',
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

function RepeatedTwoWayView({ r, id }: { readonly r: RepeatedTwoWayResult; readonly id: Id }) {
  const between = r.options.repeatedFactor === 'column' ? 'Row factor' : 'Data set factor';
  const repeated = r.options.repeatedFactor === 'column' ? 'Data set factor' : 'Row factor';
  const f = (t: RepeatedTwoWayTerm) => (t.f !== null && t.df > 0 ? sig(t.f) : '');
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
      </AllNumbers>
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
            : 'Comparisons within rows, within data sets or between cells need more than one value per cell. Compare the main effects instead (Prism does the same).'}
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
                'Significant?',
                'Summary',
                'Adjusted P value',
              ]}
              rows={f.pairs.map((x) => [
                `${x.a.title} vs. ${x.b.title}`,
                sig(x.diff),
                interval(x.ciLower, x.ciUpper),
                x.p < 0.05 ? 'Yes' : 'No',
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
          head={[
            'Source of variation',
            '% of total variation',
            'P value',
            'P value summary',
            'Significant?',
          ]}
          rows={terms.map(([name, t]) => [
            name,
            sig(t.percent),
            pValue(t.p),
            stars(t.p),
            yesNo(t.p),
          ])}
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
        of squares don’t add up to the total, as in Prism.
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
              'Significant?',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              x.p < 0.05 ? 'Yes' : 'No',
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
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s, as Prism
        reports it.
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
              'Significant?',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              x.p < 0.05 ? 'Yes' : 'No',
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
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s, as Prism
        reports it.{' '}
        {twoGroups
          ? 'With two groups, epsilon is always 1 and every P agrees.'
          : 'Prism reports the Geisser-Greenhouse corrected P by default; the uncorrected and Huynh-Feldt P are under “All numbers”.'}
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
              'Significant?',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              x.p < 0.05 ? 'Yes' : 'No',
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
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s, as Prism
        reports it.{' '}
        {twoGroups
          ? 'With two groups, epsilon is always 1 and every P agrees.'
          : 'Prism reports the Geisser-Greenhouse corrected P by default; the uncorrected and Huynh-Feldt P are under “All numbers”.'}
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
              'Significant?',
              'Summary',
              'Adjusted P value',
            ]}
            rows={r.pairs.map((x) => [
              `${x.a.title} vs. ${x.b.title}`,
              sig(x.diff),
              interval(x.ciLower, x.ciUpper),
              x.p < 0.05 ? 'Yes' : 'No',
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
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s, as Prism
        reports it.
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
  'values of 0 or below) or not available from summary data. Percentiles as Prism computes them.';

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
        {value !== null && analysis.kind === 'paired-normality' && (
          <PairedNormalityView r={value as unknown as PairedNormalityResult} />
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
