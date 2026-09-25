/**
 * An analysis's results sheet (item 04): what it is, where its data come
 * from, its status, and the results as Prism lays them out, with one
 * plain sentence on top for a t test. A result is shown only when it is
 * current: outdated results are never shown as if they were.
 */
import { type ReactNode, useState, useSyncExternalStore } from 'react';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import type { KruskalWallisResult } from '@/analyses/kruskal/types';
import type { FTest, OneWayResult } from '@/analyses/oneway/types';
import type { RankTestResult } from '@/analyses/ranktest/types';
import type { TTestResult } from '@/analyses/ttest/types';
import type { Analysis, Project } from '@/model/project';
import type { Dropped } from '@/model/selectors';

import { KIND_ICON } from '../analysisKinds';
import { Icon } from '../Icon';
import { AnalyzeDialog } from '../shell/AnalyzeDialog';
import { getResults } from '../state/results';
import { store } from '../state/store';
import { STAR_SCHEME, dfText, interval, levelText, pPhrase, pValue, sig, stars } from './format';
import {
  COMPARISON_TEST,
  kruskalMethod,
  kruskalReading,
  oneWayMethod,
  oneWayReading,
  rankTestMethod,
  rankTestReading,
  tTestMethod,
  tTestReading,
} from './reading';

interface Props {
  readonly project: Project;
  readonly analysis: Analysis;
}

type Row = readonly [label: string, value: string];
type Section = readonly [title: string, rows: readonly Row[]];

function Sections({ sections }: { readonly sections: readonly Section[] }) {
  return (
    <table className="results-table">
      {sections.map(([title, rows]) => (
        <tbody key={title}>
          <tr className="section">
            <th colSpan={2} scope="colgroup">
              {title}
            </th>
          </tr>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
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

function TTestView({ r }: { readonly r: TTestResult }) {
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
      <p className="reading">{tTestReading(r)}</p>
      <p className="method">{tTestMethod(r)}</p>
      <Sections sections={sections} />
      <p className="legend">Asterisks: {STAR_SCHEME}.</p>
    </>
  );
}

/** "96.83% CI of difference", with a warning when so few values can't reach 95%. */
function rankCi(r: RankTestResult, what: string): Row {
  const short = r.ci.level < 0.95 ? ' (the widest possible with so few values)' : '';
  return [`${levelText(r.ci.level)} CI of ${what}${short}`, interval(r.ci.lower, r.ci.upper)];
}

function RankTestView({ r }: { readonly r: RankTestResult }) {
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
      <p className="reading">{rankTestReading(r)}</p>
      <p className="method">{rankTestMethod(r)}</p>
      <Sections sections={sections} />
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
              <th key={i} scope="col">
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
                  <th key={j} scope="row">
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

function KruskalView({ r }: { readonly r: KruskalWallisResult }) {
  const sections: Section[] = [
    [
      'Kruskal-Wallis test',
      [
        ['P value', pValue(r.p)],
        ['Exact or approximate P value?', 'Approximate'],
        ['P value summary', stars(r.p)],
        ['Do the medians vary significantly (P < 0.05)?', yesNo(r.p)],
        ['Number of groups', String(r.groups.length)],
        ['Kruskal-Wallis statistic', sig(r.h)],
      ],
    ],
  ];
  const adjusted = r.corrected;
  return (
    <>
      <p className="reading">{kruskalReading(r)}</p>
      <p className="method">{kruskalMethod(r)}</p>
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
        <>
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
        </>
      )}
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Dunn’s test gives no confidence intervals. The Kruskal-Wallis P is
        approximate (chi-square), which is accurate except with very small groups.
      </p>
    </>
  );
}

function OneWayView({ r }: { readonly r: OneWayResult }) {
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
      <p className="reading">{oneWayReading(r)}</p>
      <p className="method">{oneWayMethod(r)}</p>
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
        <>
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
        </>
      )}
      <p className="legend">
        Asterisks: {STAR_SCHEME}. Mean diff. is the first group’s mean minus the second’s, as Prism
        reports it.
      </p>
    </>
  );
}

const DESCRIPTIVE_ROWS: readonly (readonly [
  string,
  (g: DescriptiveResult['groups'][number]) => string,
])[] = [
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

function DescriptiveView({ r }: { readonly r: DescriptiveResult }) {
  return (
    <>
      <div className="results-scroll">
        <table className="results-table wide">
          <thead>
            <tr>
              <th scope="col" />
              {r.groups.map((g) => (
                <th key={g.id} scope="col">
                  {g.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DESCRIPTIVE_ROWS.map(([label, f]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {r.groups.map((g) => (
                  <td key={g.id}>{f(g)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend">
        — means not defined for these values (e.g. the SD of a single value, a geometric mean with
        values of 0 or below) or not available from summary data. Percentiles as Prism computes
        them.
      </p>
    </>
  );
}

function Status({ analysis }: { readonly analysis: Analysis }): ReactNode {
  const bridge = getResults();
  const status = bridge.recompute.status(analysis.id);
  const engine = bridge.engineState();
  if (status.state === 'fresh') return null;
  const starting =
    engine.kind === 'starting' && (status.state === 'running' || status.state === 'stale');
  if (starting) {
    return (
      <p className="status-banner" role="status">
        Starting the statistics engine (the first time only; about 17 MB, then it works offline)…
      </p>
    );
  }
  switch (status.state) {
    case 'running':
      return (
        <p className="status-banner" role="status">
          Calculating…{' '}
          <button
            type="button"
            onClick={() => {
              bridge.stop(analysis.id);
            }}
          >
            Stop
          </button>
        </p>
      );
    case 'stale':
      return (
        <p className="status-banner" role="status">
          Updating…
        </p>
      );
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

export function ResultsSheet({ project, analysis }: Props) {
  const bridge = getResults();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
  const [editing, setEditing] = useState(false);
  const entry = bridge.recompute.result(analysis.id);
  const source =
    analysis.input.kind === 'table' ? project.tables.get(analysis.input.table) : undefined;
  const value = entry?.ok ? entry.value : null;

  return (
    <section className="sheet results" aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">{analysis.title}</h1>
        {source && (
          <button
            type="button"
            className="chip link-chip"
            onClick={() => {
              store.show({ kind: 'table', id: source.id });
            }}
          >
            <Icon name={KIND_ICON[analysis.kind]} size={16} />
            Data: {source.title}
          </button>
        )}
        <button
          type="button"
          className="head-action"
          onClick={() => {
            setEditing(true);
          }}
        >
          Change analysis…
        </button>
      </header>
      <div className="results-body">
        <Status analysis={analysis} />
        {value !== null && analysis.kind === 't-test' && (
          <TTestView r={value as unknown as TTestResult} />
        )}
        {value !== null && analysis.kind === 'kruskal-wallis' && (
          <KruskalView r={value as unknown as KruskalWallisResult} />
        )}
        {value !== null && analysis.kind === 'one-way-anova' && (
          <OneWayView r={value as unknown as OneWayResult} />
        )}
        {value !== null && analysis.kind === 'rank-test' && (
          <RankTestView r={value as unknown as RankTestResult} />
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
    </section>
  );
}
