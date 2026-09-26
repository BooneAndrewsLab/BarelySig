import type { ReactNode } from 'react';

import { store } from '../state/store';

interface Props {
  readonly project: string;
  /** The open experiment's title, if any. */
  readonly experiment: string | null;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  /** More actions at the end (help), filled in by the app. */
  readonly children?: ReactNode;
}

/** The bar over the page (item 08): where you are, undo and redo. */
export function TopBar({ project, experiment, undoLabel, redoLabel, children }: Props) {
  return (
    <header className="bar">
      <p className="trail">
        <span className="trail-project">{project}</span>
        {experiment !== null && (
          <>
            <span className="trail-sep" aria-hidden="true">
              ›
            </span>
            <span className="trail-here">{experiment}</span>
          </>
        )}
      </p>
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
