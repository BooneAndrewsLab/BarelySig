import type { ReactNode } from 'react';

import type { Notice } from '../state/store';

interface Props {
  readonly notice: Notice | null;
  /** Shown when there is no notice, e.g. a summary of the selection. */
  readonly children?: ReactNode;
}

export function StatusLine({ notice, children }: Props) {
  return (
    <footer className="status" role="status" aria-live="polite">
      {notice ? <span className={`notice ${notice.tone}`}>{notice.text}</span> : children}
    </footer>
  );
}
