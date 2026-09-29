import type { ReactNode } from 'react';

import type { Notice } from '../state/store';

interface Props {
  readonly notice: Notice | null;
  /** Called when the user dismisses the notice before its countdown ends. */
  readonly onDismiss?: () => void;
  /** Shown when there is no notice, e.g. a summary of the selection. */
  readonly children?: ReactNode;
}

export function StatusLine({ notice, onDismiss, children }: Props) {
  return (
    <footer className="status" role="status" aria-live="polite">
      {notice ? (
        // Keyed by seq so a repeated message restarts the ring and the fade.
        <span key={notice.seq} className={`notice ${notice.tone}`}>
          <span title={notice.text}>{notice.text}</span>
          <button
            type="button"
            className="notice__dismiss"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={onDismiss}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle className="notice__track" cx="8" cy="8" r="6" />
              <circle className="notice__arc" cx="8" cy="8" r="6" />
            </svg>
          </button>
        </span>
      ) : (
        children
      )}
    </footer>
  );
}
