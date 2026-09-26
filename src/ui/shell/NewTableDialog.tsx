import { useState } from 'react';

import type { Table, TableType } from '@/model/table';

import { Icon } from '../Icon';
import { TABLE_TYPES } from '../formats';
import { Dialog } from './Dialog';
import { EntryFields } from './EntryFields';
import { type Entry, buildTable } from './tables';

interface Props {
  readonly initialType?: TableType;
  readonly defaultTitle: string;
  readonly onCreate: (table: Table) => void;
  readonly onClose: () => void;
  /** Opens a data file instead (item 10). */
  readonly onOpenFile?: () => void;
}

export function NewTableDialog({
  initialType = 'column',
  defaultTitle,
  onCreate,
  onClose,
  onOpenFile,
}: Props) {
  const [type, setType] = useState<TableType>(initialType);
  const [title, setTitle] = useState(defaultTitle);
  const [entry, setEntry] = useState<Entry>('raw');
  const [replicates, setReplicates] = useState(3);
  const valid = Number.isInteger(replicates) && replicates >= 1 && replicates <= 50;

  return (
    <Dialog title="New experiment" onClose={onClose}>
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

        <EntryFields
          type={type}
          entry={entry}
          replicates={replicates}
          valid={valid}
          onEntry={setEntry}
          onReplicates={setReplicates}
        />

        <label className="field">
          Title{' '}
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
            }}
          />
        </label>

        {onOpenFile && (
          <p className="hint flush">
            Data already in a file?{' '}
            <button type="button" className="link" onClick={onOpenFile}>
              Open a data file…
            </button>
          </p>
        )}

        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}
