import { useMemo, useState } from 'react';

import { calculateNormalize, NORMALIZE_CAVEAT } from '@/model/derive';
import type { Id } from '@/model/ids';
import { type NormalizeOptions, type NormalizeRef, type Table, isXyX } from '@/model/table';

import { Dialog } from './Dialog';

type Mode = 'control' | 'value' | 'range';
type Zero = 'min' | 'first' | 'value' | 'dataSet';
type Full = 'max' | 'last' | 'sum' | 'value' | 'dataSet';

interface State {
  readonly mode: Mode;
  readonly by: 'whole' | 'row';
  readonly unit: 'fraction' | 'percent';
  readonly control: Id | '';
  readonly value: string;
  readonly zero: Zero;
  readonly zeroValue: string;
  readonly zeroSet: Id | '';
  readonly full: Full;
  readonly fullValue: string;
  readonly fullSet: Id | '';
}

const num = (s: string): number | null => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
};

/** What the dialog has asked for, or null while a number is missing. */
function optionsOf(s: State): NormalizeOptions | null {
  const zero0: NormalizeRef = { kind: 'value', value: 0 };
  if (s.mode === 'control') {
    if (s.control === '') return null;
    return { by: s.by, zero: zero0, full: { kind: 'dataSet', dataSet: s.control }, unit: s.unit };
  }
  if (s.mode === 'value') {
    const v = num(s.value);
    return v === null
      ? null
      : { by: 'whole', zero: zero0, full: { kind: 'value', value: v }, unit: s.unit };
  }
  const z = ((): NormalizeRef | null => {
    if (s.zero === 'value') {
      const v = num(s.zeroValue);
      return v === null ? null : { kind: 'value', value: v };
    }
    if (s.zero === 'dataSet')
      return s.zeroSet === '' ? null : { kind: 'dataSet', dataSet: s.zeroSet };
    return { kind: s.zero };
  })();
  const f = ((): NormalizeRef | null => {
    if (s.full === 'value') {
      const v = num(s.fullValue);
      return v === null ? null : { kind: 'value', value: v };
    }
    if (s.full === 'dataSet')
      return s.fullSet === '' ? null : { kind: 'dataSet', dataSet: s.fullSet };
    return { kind: s.full };
  })();
  return z === null || f === null ? null : { by: 'whole', zero: z, full: f, unit: s.unit };
}

function stateOf(o: NormalizeOptions | undefined, first: Id | ''): State {
  const base: State = {
    mode: 'control',
    by: 'row',
    unit: 'percent',
    control: first,
    value: '100',
    zero: 'min',
    zeroValue: '0',
    zeroSet: first,
    full: 'max',
    fullValue: '100',
    fullSet: first,
  };
  if (!o) return base;
  const zeroless = o.zero.kind === 'value' && o.zero.value === 0;
  if (zeroless && o.full.kind === 'dataSet')
    return { ...base, mode: 'control', by: o.by, unit: o.unit, control: o.full.dataSet };
  if (zeroless && o.full.kind === 'value')
    return { ...base, mode: 'value', unit: o.unit, value: String(o.full.value) };
  return {
    ...base,
    mode: 'range',
    unit: o.unit,
    zero:
      o.zero.kind === 'value'
        ? 'value'
        : o.zero.kind === 'dataSet'
          ? 'dataSet'
          : (o.zero.kind as Zero),
    zeroValue: o.zero.kind === 'value' ? String(o.zero.value) : '0',
    zeroSet: o.zero.kind === 'dataSet' ? o.zero.dataSet : first,
    full:
      o.full.kind === 'value'
        ? 'value'
        : o.full.kind === 'dataSet'
          ? 'dataSet'
          : (o.full.kind as Full),
    fullValue: o.full.kind === 'value' ? String(o.full.value) : '100',
    fullSet: o.full.kind === 'dataSet' ? o.full.dataSet : first,
  };
}

interface Props {
  readonly table: Table;
  /** Changing a calculated table: its current setting. */
  readonly current?: NormalizeOptions;
  readonly defaultTitle?: string;
  readonly onApply: (options: NormalizeOptions, title: string) => void;
  readonly onClose: () => void;
}

/** Normalize (Prism's Transform / Normalize, item 43): express values against a control. */
export function NormalizeDialog({ table, current, defaultTitle, onApply, onClose }: Props) {
  const sets = table.dataSets.filter((d) => !isXyX(table, d.id));
  const first = sets[0]?.id ?? '';
  const [s, setS] = useState<State>(() => stateOf(current, first));
  const [title, setTitle] = useState(defaultTitle ?? '');
  const set = (patch: Partial<State>) => {
    setS((p) => ({ ...p, ...patch }));
  };
  const options = useMemo(() => optionsOf(s), [s]);
  const problem = useMemo(
    () => (options ? calculateNormalize(table, options).problem : null),
    [table, options],
  );
  const summary = table.format.kind === 'summary';
  const unitLabel = (control: boolean) =>
    control
      ? ['Fold of control (the control is 1)', '% of control (the control is 100)']
      : ['Fractions (0 to 1)', 'Percent (0 to 100)'];

  const picker = (id: string, label: string, value: Id | '', on: (v: Id) => void) => (
    <label className="field">
      {label}{' '}
      <select
        id={id}
        value={value}
        onChange={(e) => {
          on(e.currentTarget.value as Id);
        }}
      >
        {sets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
    </label>
  );
  const unitChoice = (control: boolean) => (
    <fieldset className="choice">
      <legend>Show the result as</legend>
      {(['fraction', 'percent'] as const).map((u, i) => (
        <label key={u}>
          <input
            type="radio"
            name="unit"
            checked={s.unit === u}
            onChange={() => {
              set({ unit: u });
            }}
          />{' '}
          {unitLabel(control)[i]}
        </label>
      ))}
    </fieldset>
  );

  return (
    <Dialog title={current ? 'Change normalization' : 'Normalize'} onClose={onClose} wide>
      <form
        className="normalize"
        onSubmit={(e) => {
          e.preventDefault();
          if (options && problem === null) onApply(options, title.trim());
        }}
      >
        <p className="hint flush">
          Makes a new table of the same data, expressed against a control. Your original data are
          not changed, and the new table updates when they do.
        </p>
        <fieldset className="choice">
          <legend>Compare everything to</legend>
          <label>
            <input
              type="radio"
              name="mode"
              checked={s.mode === 'control'}
              onChange={() => {
                set({ mode: 'control' });
              }}
            />{' '}
            A control group (fold change or % of control)
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={s.mode === 'value'}
              onChange={() => {
                set({ mode: 'value' });
              }}
            />{' '}
            A number I type
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={s.mode === 'range'}
              onChange={() => {
                set({ mode: 'range' });
              }}
            />{' '}
            A 0 to 100% scale between two reference points
          </label>
        </fieldset>

        {s.mode === 'control' && (
          <>
            {picker('norm-control', 'Control group', s.control, (v) => {
              set({ control: v });
            })}
            <fieldset className="choice">
              <legend>Divide by the control</legend>
              <label>
                <input
                  type="radio"
                  name="by"
                  checked={s.by === 'row'}
                  disabled={summary}
                  onChange={() => {
                    set({ by: 'row' });
                  }}
                />{' '}
                in the same row (each experiment against its own control)
              </label>
              <label>
                <input
                  type="radio"
                  name="by"
                  checked={s.by === 'whole' || summary}
                  onChange={() => {
                    set({ by: 'whole' });
                  }}
                />{' '}
                as an average of the whole control group
              </label>
            </fieldset>
            {unitChoice(true)}
            <p className="hint flush">{NORMALIZE_CAVEAT}</p>
          </>
        )}

        {s.mode === 'value' && (
          <>
            <label className="field">
              Divide every value by{' '}
              <input
                inputMode="decimal"
                value={s.value}
                onChange={(e) => {
                  set({ value: e.currentTarget.value });
                }}
              />
            </label>
            {unitChoice(true)}
          </>
        )}

        {s.mode === 'range' && (
          <>
            <p className="hint flush">
              Each data set is rescaled on its own, as in Prism. With replicates, the reference
              points come from the replicate averages.
            </p>
            <label className="field">
              0% is{' '}
              <select
                value={s.zero}
                onChange={(e) => {
                  set({ zero: e.currentTarget.value as Zero });
                }}
              >
                <option value="min">the smallest value in each data set</option>
                <option value="first">the value in the first row of each data set</option>
                <option value="value">a number I type</option>
                <option value="dataSet">the average of one data set</option>
              </select>
            </label>
            {s.zero === 'value' && (
              <label className="field indent">
                Number{' '}
                <input
                  inputMode="decimal"
                  value={s.zeroValue}
                  onChange={(e) => {
                    set({ zeroValue: e.currentTarget.value });
                  }}
                />
              </label>
            )}
            {s.zero === 'dataSet' &&
              picker('norm-zero', 'Data set', s.zeroSet, (v) => {
                set({ zeroSet: v });
              })}
            <label className="field">
              100% is{' '}
              <select
                value={s.full}
                onChange={(e) => {
                  set({ full: e.currentTarget.value as Full });
                }}
              >
                <option value="max">the largest value in each data set</option>
                <option value="last">the value in the last row of each data set</option>
                <option value="sum">the sum of all values in each data set</option>
                <option value="value">a number I type</option>
                <option value="dataSet">the average of one data set</option>
              </select>
            </label>
            {s.full === 'value' && (
              <label className="field indent">
                Number{' '}
                <input
                  inputMode="decimal"
                  value={s.fullValue}
                  onChange={(e) => {
                    set({ fullValue: e.currentTarget.value });
                  }}
                />
              </label>
            )}
            {s.full === 'dataSet' &&
              picker('norm-full', 'Data set', s.fullSet, (v) => {
                set({ fullSet: v });
              })}
            {unitChoice(false)}
          </>
        )}

        {summary && (
          <p className="hint flush">
            These are summary data (mean and SD): the means are rescaled, and each SD is divided by
            the same factor.
          </p>
        )}
        {problem !== null && (
          <p className="warning-note" role="alert">
            {problem}
          </p>
        )}
        {!current && (
          <label className="field">
            Title{' '}
            <input
              placeholder={`${table.title} (normalized)`}
              value={title}
              onChange={(e) => {
                setTitle(e.currentTarget.value);
              }}
            />
          </label>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={options === null || problem !== null}>
            {current ? 'Change' : 'Make normalized table'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
