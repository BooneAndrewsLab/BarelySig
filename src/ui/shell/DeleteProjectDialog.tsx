import { useState } from 'react';

import type { Id } from '@/model/ids';

import { getSession } from '../state/session';
import { Dialog } from './Dialog';

export interface DeleteTarget {
  readonly id: Id;
  readonly name: string;
  /** "3 experiments · 2 graphs". */
  readonly contents: string;
  /** A file of its latest state exists. */
  readonly downloaded: boolean;
}

interface Props {
  readonly target: DeleteTarget;
  readonly onClose: () => void;
}

/**
 * Asks before deleting a project from this browser (item 09): it can't be
 * undone. Without a downloaded copy of its latest state, says so first and
 * offers the download right there.
 */
export function DeleteProjectDialog({ target, onClose }: Props) {
  const [downloaded, setDownloaded] = useState(target.downloaded);
  const session = getSession();
  return (
    <Dialog title={`Delete “${target.name}”?`} onClose={onClose}>
      <p className="delete-contents">{target.contents}</p>
      {downloaded ? (
        <p>
          It is removed from this browser, and undo can’t bring it back. You have downloaded it
          since its last change, so your file has all of it; the file is not touched.
        </p>
      ) : (
        <p className="delete-warning" role="alert">
          <strong>You haven’t downloaded this project since it last changed.</strong> Deleting it
          loses it for good: undo can’t bring it back. Download a copy first to keep it.
        </p>
      )}
      <div className="actions">
        {!downloaded && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              void session.downloadStored(target.id).then((ok) => {
                if (ok) setDownloaded(true);
              });
            }}
          >
            Download a copy
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            onClose();
            void session.deleteProject(target.id, target.name);
          }}
        >
          {downloaded ? 'Delete' : 'Delete without a copy'}
        </button>
      </div>
    </Dialog>
  );
}
