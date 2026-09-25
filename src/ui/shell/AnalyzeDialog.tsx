/**
 * Choosing an analysis (items 04, 06): what to do, which groups, and the
 * options in plain words. Creates the analysis, or changes an existing
 * one, as one undo step.
 */
import { type ReactNode, useState } from 'react';

import { type Id, newId } from '@/model/ids';
import {
  type Analysis,
  type AnalysisKind,
  type AnalysisSpec,
  DEFAULT_OPTIONS,
  type RankTestOptions,
  type TTestOptions,
} from '@/model/project';
import type { Table, TableType } from '@/model/table';

import { KIND_ICON } from '../analysisKinds';
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

interface KindInfo {
  readonly kind: AnalysisKind;
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
    tables: ['column', 'grouped'],
  },
  {
    kind: 't-test',
    name: 't test',
    blurb: 'Compare the means of two groups.',
    tables: ['column'],
    groups: 2,
  },
  {
    kind: 'rank-test',
    name: 'Mann-Whitney / Wilcoxon',
    blurb: 'Compare two groups by ranks, without assuming a bell-shaped distribution.',
    tables: ['column'],
    groups: 2,
  },
];

type Options = { -readonly [K in AnalysisKind]: Extract<AnalysisSpec, { kind: K }>['options'] };

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

export function AnalyzeDialog({ table, analysis, onClose }: Props) {
  const summary = table.format.kind === 'summary';
  const kinds = KINDS.filter((k) => k.tables.includes(table.type));
  const [kind, setKind] = useState<AnalysisKind>(analysis?.kind ?? 'descriptive');
  const [chosen, setChosen] = useState<readonly Id[]>(
    analysis?.input.kind === 'table' ? analysis.input.dataSets : table.dataSets.map((d) => d.id),
  );
  const [options, setOptions] = useState<Options>(() => initialOptions(analysis));
  const picked = table.dataSets.filter((d) => chosen.includes(d.id)).map((d) => d.id);
  const info = KINDS.find((k) => k.kind === kind);
  const groups = info?.groups;

  const set = <K extends AnalysisKind>(k: K, o: Options[K]) => {
    setOptions((cur) => ({ ...cur, [k]: o }));
  };

  const pickKind = (k: AnalysisKind) => {
    setKind(k);
    // A test of two groups starts with the first two chosen.
    const n = KINDS.find((x) => x.kind === k)?.groups;
    if (n !== undefined && !analysis && picked.length > n) setChosen(picked.slice(0, n));
  };

  const spec = (): AnalysisSpec => {
    switch (kind) {
      case 'descriptive':
        return { kind, options: options.descriptive };
      case 't-test':
        return {
          kind,
          options: summary ? { ...options['t-test'], paired: false } : options['t-test'],
        };
      case 'rank-test':
        return { kind, options: options['rank-test'] };
    }
  };

  const submit = () => {
    const input = { kind: 'table' as const, table: table.id, dataSets: picked };
    const s = spec();
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
      store.edit(
        { op: 'addAnalysis', analysis: { id, title, input, ...s } as Analysis },
        { show: { kind: 'analysis', id } },
      );
      analytics.trackOnce('analysis', `new-${kind}`);
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
          <legend>{groups === 2 ? 'Which two groups?' : 'Which groups?'}</legend>
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
        {kind === 'rank-test' && (
          <RankTestFields
            o={options['rank-test']}
            set={(o) => {
              set('rank-test', o);
            }}
          />
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
