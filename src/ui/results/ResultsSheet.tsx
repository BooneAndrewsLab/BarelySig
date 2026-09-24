/**
 * An analysis's results sheet (item 04): what it is, where its data come
 * from, its status, and the results as Prism lays them out, with one
 * plain sentence on top for a t test. A result is shown only when it is
 * current: outdated results are never shown as if they were.
 */
import { type ReactNode, useState, useSyncExternalStore } from 'react';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import type { TTestResult } from '@/analyses/ttest/types';
import type { Analysis, Project } from '@/model/project';
import type { Dropped } from '@/model/selectors';

import { Icon } from '../Icon';
import { AnalyzeDialog } from '../shell/AnalyzeDialog';
import { getResults } from '../state/results';
import { store } from '../state/store';
import { STAR_SCHEME, dfText, interval, pValue, sig, stars } from './format';
import { tTestMethod, tTestReading } from './reading';

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
            <Icon name={analysis.kind === 't-test' ? 't-test' : 'descriptive-stats'} size={16} />
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
