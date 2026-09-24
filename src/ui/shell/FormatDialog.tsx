import { useMemo, useState } from 'react';

import { EditError, applyEdit } from '@/model/edits';
import type { Project } from '@/model/project';
import type { Table } from '@/model/table';

import { Dialog } from './Dialog';
import { EntryFields } from './EntryFields';
import { type Entry, entryOf, formatOf, valuesLost } from './tables';

interface Props {
  readonly project: Project;
  readonly table: Table;
  readonly onApply: (format: ReturnType<typeof formatOf>) => void;
  readonly onClose: () => void;
}

/** Changes what a table's subcolumns hold, saying first what would be cleared. */
export function FormatDialog({ project, table, onApply, onClose }: Props) {
  const initial = entryOf(table.format);
  const [entry, setEntry] = useState<Entry>(initial.entry);
  const [replicates, setReplicates] = useState(initial.replicates);
  const valid = Number.isInteger(replicates) && replicates >= 1 && replicates <= 50;
  const format = formatOf(table.type, entry, valid ? replicates : 1);
  const lost = useMemo(() => {
    try {
      const next = applyEdit(project, { op: 'setFormat', table: table.id, format }).tables.get(
        table.id,
      );
      return next ? valuesLost(table, next) : 0;
    } catch (e: unknown) {
      if (e instanceof EditError) return 0;
      throw e;
    }
  }, [project, table, format]);
  const unchanged = JSON.stringify(format) === JSON.stringify(table.format);

  return (
    <Dialog title="Change data format" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !unchanged) onApply(format);
        }}
      >
        <EntryFields
          type={table.type}
          entry={entry}
          replicates={replicates}
          valid={valid}
          onEntry={setEntry}
          onReplicates={setReplicates}
          legend="What the table holds"
        />
        {lost > 0 && (
          <p className="warning-note" role="note">
            This clears {lost} {lost === 1 ? 'value that doesn’t' : 'values that don’t'} fit the new
            format. Undo brings {lost === 1 ? 'it' : 'them'} back.
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid || unchanged}>
            Change format
          </button>
        </div>
      </form>
    </Dialog>
  );
}
