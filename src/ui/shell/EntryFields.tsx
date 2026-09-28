import { SUMMARY_STATS, type SummaryStats, type TableType } from '@/model/table';

import { SUMMARY_LABELS } from '../formats';
import type { Entry } from './tables';

interface Props {
  readonly type: TableType;
  readonly entry: Entry;
  readonly replicates: number;
  readonly valid: boolean;
  readonly onEntry: (e: Entry) => void;
  readonly onReplicates: (n: number) => void;
  readonly legend?: string;
}

/** Individual values (with replicates per cell in a Grouped table) or a kind of summary data. */
export function EntryFields({
  type,
  entry,
  replicates,
  valid,
  onEntry,
  onReplicates,
  legend = 'What you will enter',
}: Props) {
  const setEntry = onEntry;
  const setReplicates = onReplicates;
  if (type === 'contingency') {
    return (
      <fieldset>
        <legend>{legend}</legend>
        <p className="hint flush">
          One count per cell — how many observations fall in each row × column combination.
        </p>
      </fieldset>
    );
  }
  if (type === 'nested') {
    return (
      <fieldset>
        <legend>{legend}</legend>
        <p className="hint flush">Individual values, grouped into biological replicates.</p>
        <label className="indent">
          Biological replicates per group{' '}
          <input
            type="number"
            min={1}
            max={50}
            value={replicates}
            onChange={(e) => {
              setReplicates(e.currentTarget.valueAsNumber);
            }}
            aria-invalid={!valid}
          />
        </label>
      </fieldset>
    );
  }
  return (
    <fieldset>
      <legend>{legend}</legend>
      <label className="option">
        <input
          type="radio"
          name="entry"
          checked={entry === 'raw'}
          onChange={() => {
            setEntry('raw');
          }}
        />
        Individual values
      </label>
      {(type === 'grouped' || type === 'xy') && entry === 'raw' && (
        <label className="indent">
          Replicates per cell{' '}
          <input
            type="number"
            min={1}
            max={50}
            value={replicates}
            onChange={(e) => {
              setReplicates(e.currentTarget.valueAsNumber);
            }}
            aria-invalid={!valid}
          />
        </label>
      )}
      <label className="option">
        <input
          type="radio"
          name="entry"
          checked={entry !== 'raw'}
          onChange={() => {
            setEntry('mean-sd-n');
          }}
        />
        Summary data, already averaged
      </label>
      {entry !== 'raw' && (
        <select
          className="indent"
          aria-label="Summary data"
          value={entry}
          onChange={(e) => {
            setEntry(e.currentTarget.value as SummaryStats);
          }}
        >
          {SUMMARY_STATS.map((s) => (
            <option key={s} value={s}>
              {SUMMARY_LABELS[s]}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}
