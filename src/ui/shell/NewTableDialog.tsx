import { useState } from 'react';

import { SUMMARY_STATS, type SummaryStats, type Table, type TableType } from '@/model/table';

import { Icon } from '../Icon';
import { SUMMARY_LABELS, TABLE_TYPES } from '../formats';
import { Dialog } from './Dialog';
import { type Entry, buildTable } from './tables';

interface Props {
  readonly initialType?: TableType;
  readonly defaultTitle: string;
  readonly onCreate: (table: Table) => void;
  readonly onClose: () => void;
}

export function NewTableDialog({ initialType = 'column', defaultTitle, onCreate, onClose }: Props) {
  const [type, setType] = useState<TableType>(initialType);
  const [title, setTitle] = useState(defaultTitle);
  const [entry, setEntry] = useState<Entry>('raw');
  const [replicates, setReplicates] = useState(3);
  const valid = Number.isInteger(replicates) && replicates >= 1 && replicates <= 50;

  return (
    <Dialog title="New table" onClose={onClose}>
      <form
        className="new-table"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onCreate(buildTable(type, title.trim() || defaultTitle, entry, replicates));
        }}
      >
        <fieldset className="type-choice">
          <legend>Kind of table</legend>
          {TABLE_TYPES.map((t) => (
            <label key={t.type} className={type === t.type ? 'type-tile chosen' : 'type-tile'}>
              <input
                type="radio"
                name="type"
                value={t.type}
                checked={type === t.type}
                onChange={() => {
                  setType(t.type);
                }}
              />
              <Icon name={t.icon} size={32} />
              <span className="type-name">{t.name}</span>
              <span className="type-blurb">{t.blurb}</span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>What you will enter</legend>
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
          {type === 'grouped' && entry === 'raw' && (
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

        <label className="field">
          Title{' '}
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
            }}
          />
        </label>

        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Create table
          </button>
        </div>
      </form>
    </Dialog>
  );
}
