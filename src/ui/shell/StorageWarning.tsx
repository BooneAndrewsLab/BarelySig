import { useState } from 'react';

import { openGuide } from '../help/openGuide';
import { askToKeepStorage, useStorageSafety } from '../state/storageSafety';

/**
 * Says, on the start screen, that the browser may clear its copy of the
 * projects when disk space runs low, and asks it to keep them from a
 * click (item 09). Gone once the browser keeps them; a refusal is reported
 * with what helps, since Chromium refuses in silence.
 */
export function StorageWarning({ unsaved }: { readonly unsaved: number }) {
  const safety = useStorageSafety();
  const [phase, setPhase] = useState<'ask' | 'pending' | 'declined'>('ask');
  if (safety !== 'at-risk') return null;
  const files =
    unsaved === 0
      ? null
      : unsaved === 1
        ? ' One of them has no downloaded copy.'
        : ` ${String(unsaved)} of them have no downloaded copy.`;
  return (
    <div className="storage-warning" role="note">
      {phase === 'declined' ? (
        <p>
          <strong>The browser didn’t agree to keep them for now.</strong> Browsers usually agree
          once BarelySig is installed as an app, bookmarked or used often. Until then, download the
          projects that matter.
        </p>
      ) : (
        <p>
          <strong>This browser may clear its copy of your projects</strong> if the disk runs low on
          space.{files} Ask it to keep them (it may ask you to confirm), and download the ones that
          matter.
        </p>
      )}
      <div className="storage-warning-actions">
        {phase !== 'declined' && (
          <button
            type="button"
            disabled={phase === 'pending'}
            onClick={() => {
              setPhase('pending');
              void askToKeepStorage().then((kept) => {
                setPhase(kept ? 'ask' : 'declined');
              });
            }}
          >
            Ask the browser to keep them
          </button>
        )}
        <button
          type="button"
          className="link"
          onClick={() => {
            openGuide('15-files#if-the-browser-may-clear-them');
          }}
        >
          What this means
        </button>
      </div>
    </div>
  );
}
