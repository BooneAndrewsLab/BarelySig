import { type ReactNode, useState } from 'react';

import { Logo } from '../Logo';
import { store } from '../state/store';

interface Props {
  readonly name: string;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  /** File actions (open, download), filled in by the app. */
  readonly children?: ReactNode;
}

export function TopBar({ name, undoLabel, redoLabel, children }: Props) {
  const [renaming, setRenaming] = useState(false);
  const commit = (value: string) => {
    setRenaming(false);
    const v = value.trim();
    if (v && v !== name) store.edit({ op: 'renameProject', name: v });
  };
  return (
    <header className="bar">
      <Logo height={22} />
      {renaming ? (
        <input
          className="project-name editing"
          aria-label="Project name"
          defaultValue={name}
          autoFocus
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            commit(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="project-name"
          title="Rename project"
          onClick={() => {
            setRenaming(true);
          }}
        >
          {name}
        </button>
      )}
      <div className="bar-actions">
        <button
          type="button"
          disabled={undoLabel === null}
          aria-label={undoLabel ?? 'Undo'}
          title={undoLabel ? `${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
          onClick={() => {
            store.undo();
          }}
        >
          ↶ Undo
        </button>
        <button
          type="button"
          disabled={redoLabel === null}
          aria-label={redoLabel ?? 'Redo'}
          title={redoLabel ? `${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
          onClick={() => {
            store.redo();
          }}
        >
          ↷ Redo
        </button>
        {children}
      </div>
    </header>
  );
}
