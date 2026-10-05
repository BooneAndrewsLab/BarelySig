import { useState } from 'react';

import { normalizeNote, replicateRangeNote } from '@/model/derive';
import type { Project } from '@/model/project';
import type { Table } from '@/model/table';

import { NormalizeDialog } from '../shell/NormalizeDialog';
import { store } from '../state/store';

/**
 * Above a calculated table's grid (item 43): what it was made from, why
 * it is empty if it could not be calculated, and how to change or detach it.
 */
export function CalculatedBar({
  table,
  project,
}: {
  readonly table: Table;
  readonly project: Project;
}) {
  const [changing, setChanging] = useState(false);
  const d = table.derived;
  if (!d) return null;
  const source = project.tables.get(d.source);
  return (
    <div className="calculated-bar" role="note">
      <p>
        {normalizeNote(source, d)} {replicateRangeNote(source, d)} You can’t type in this table;
        change “{source?.title ?? 'the original'}” and it follows.
      </p>
      {d.problem !== null && (
        <p className="warning-note" role="alert">
          Can’t calculate this table right now: {d.problem}
        </p>
      )}
      <div className="actions">
        {source && (
          <button
            type="button"
            onClick={() => {
              store.show({ kind: 'table', id: source.id });
            }}
          >
            Go to the original
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setChanging(true);
          }}
        >
          Change normalization…
        </button>
        <button
          type="button"
          title="Keep these numbers as an ordinary table you can edit; it stops following the original."
          onClick={() => {
            store.edit({ op: 'detachDerived', table: table.id });
          }}
        >
          Detach (make editable)
        </button>
      </div>
      {changing && source && (
        <NormalizeDialog
          table={source}
          current={d.options}
          onClose={() => {
            setChanging(false);
          }}
          onApply={(options) => {
            setChanging(false);
            store.edit({ op: 'setNormalize', table: table.id, options });
          }}
        />
      )}
    </div>
  );
}
