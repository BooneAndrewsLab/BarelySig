/**
 * Choosing an analysis (item 04): what to do, which groups, and the
 * options in plain words. Creates the analysis, or changes an existing
 * one, as one undo step.
 */
import { useState } from 'react';

import { type Id, newId } from '@/model/ids';
import {
  type Analysis,
  type AnalysisKind,
  DEFAULT_OPTIONS,
  type TTestOptions,
} from '@/model/project';
import type { Table } from '@/model/table';

import { analytics } from '../analytics';
import { Icon } from '../Icon';
import { store } from '../state/store';
import { Dialog } from './Dialog';
import { analysisTitle } from './tables';

interface Props {
  readonly table: Table;
  /** When given, the dialog changes this analysis instead of creating one. */
  readonly analysis?: Analysis;
  readonly onClose: () => void;
}

const KINDS: readonly {
  readonly kind: AnalysisKind;
  readonly name: string;
  readonly icon: 'descriptive-stats' | 't-test';
  readonly blurb: string;
}[] = [
  {
    kind: 'descriptive',
    name: 'Descriptive statistics',
    icon: 'descriptive-stats',
    blurb: 'Describe each group: n, mean, SD, SEM, 95% CI, median and quartiles.',
  },
  { kind: 't-test', name: 't test', icon: 't-test', blurb: 'Compare the means of two groups.' },
];

export function AnalyzeDialog({ table, analysis, onClose }: Props) {
  const summary = table.format.kind === 'summary';
  const [kind, setKind] = useState<AnalysisKind>(analysis?.kind ?? 'descriptive');
  const [chosen, setChosen] = useState<readonly Id[]>(
    analysis?.input.kind === 'table' ? analysis.input.dataSets : table.dataSets.map((d) => d.id),
  );
  const [t, setT] = useState<TTestOptions>(
    analysis?.kind === 't-test' ? analysis.options : DEFAULT_OPTIONS['t-test'],
  );
  const effective: TTestOptions = summary ? { ...t, paired: false } : t;
  const picked = table.dataSets.filter((d) => chosen.includes(d.id)).map((d) => d.id);

  const pickKind = (k: AnalysisKind) => {
    setKind(k);
    // A t test compares two groups: start with the first two chosen.
    if (k === 't-test' && !analysis) setChosen(picked.slice(0, 2));
  };

  const submit = () => {
    const input = { kind: 'table' as const, table: table.id, dataSets: picked };
    const spec = kind === 't-test' ? { kind, options: effective } : { kind, options: {} };
    const title = analysisTitle(spec, table.title);
    if (analysis) {
      const keepTitle = analysis.title !== analysisTitle(analysis, table.title);
      store.edit({
        op: 'setAnalysis',
        analysis: {
          ...analysis,
          ...spec,
          input,
          title: keepTitle ? analysis.title : title,
        } as Analysis,
      });
    } else {
      const id = newId('a');
      store.edit(
        { op: 'addAnalysis', analysis: { id, title, input, ...spec } as Analysis },
        { show: { kind: 'analysis', id } },
      );
      analytics.trackOnce('analysis', kind === 't-test' ? 'new-t-test' : 'new-descriptive');
    }
    onClose();
  };

  return (
    <Dialog title={analysis ? 'Change analysis' : `Analyze ${table.title}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset className="type-choice">
          <legend>What do you want to know?</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className={kind === k.kind ? 'type-tile chosen' : 'type-tile'}>
              <input
                type="radio"
                name="kind"
                checked={kind === k.kind}
                onChange={() => {
                  pickKind(k.kind);
                }}
              />
              <Icon name={k.icon} size={28} />
              <span className="type-name">{k.name}</span>
              <span className="type-blurb">{k.blurb}</span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{kind === 't-test' ? 'Which two groups?' : 'Which groups?'}</legend>
          {table.dataSets.length === 0 && <p className="hint">This table has no groups yet.</p>}
          {table.dataSets.map((d) => (
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
          {kind === 't-test' && picked.length !== 2 && (
            <p className="hint">
              A t test compares exactly two groups; {String(picked.length)} chosen.
            </p>
          )}
        </fieldset>

        {kind === 't-test' && (
          <>
            <fieldset>
              <legend>How were the data collected?</legend>
              <label className="option">
                <input
                  type="radio"
                  name="paired"
                  checked={!effective.paired}
                  onChange={() => {
                    setT({ ...t, paired: false });
                  }}
                />
                Unpaired: different subjects (samples, animals, wells) in each group
              </label>
              <label className="option">
                <input
                  type="radio"
                  name="paired"
                  disabled={summary}
                  checked={effective.paired}
                  onChange={() => {
                    setT({ ...t, paired: true });
                  }}
                />
                Paired: each row is one subject measured in both groups (before and after, matched
                pairs)
              </label>
              {summary && (
                <p className="hint">Paired tests need the individual values, not summary data.</p>
              )}
            </fieldset>
            {!effective.paired && (
              <fieldset>
                <legend>Standard deviations</legend>
                <label className="option">
                  <input
                    type="checkbox"
                    checked={t.welch}
                    onChange={(e) => {
                      setT({ ...t, welch: e.currentTarget.checked });
                    }}
                  />
                  Don’t assume both groups have the same SD (Welch’s correction)
                </label>
                <p className="hint">
                  Off by default, as in Prism. The results include a test of whether the SDs differ.
                </p>
              </fieldset>
            )}
            <fieldset>
              <legend>P value</legend>
              <label className="option">
                <input
                  type="radio"
                  name="tails"
                  checked={t.tails === 'two'}
                  onChange={() => {
                    setT({ ...t, tails: 'two' });
                  }}
                />
                Two-tailed (recommended)
              </label>
              <label className="option">
                <input
                  type="radio"
                  name="tails"
                  checked={t.tails === 'one'}
                  onChange={() => {
                    setT({ ...t, tails: 'one' });
                  }}
                />
                One-tailed: only if you predicted which group would be higher before collecting the
                data
              </label>
            </fieldset>
          </>
        )}

        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={picked.length === 0}>
            {analysis ? 'Update' : 'Analyze'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
