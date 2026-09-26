import { useEffect, useRef, useState } from 'react';

import type { Id } from '@/model/ids';

import { getSession } from '../state/session';
import { type DeleteTarget, DeleteProjectDialog } from './DeleteProjectDialog';
import { useProjects, whenEdited } from './recent';

/** How many other projects the menu lists; the start screen lists them all. */
const RECENT = 5;

interface Props {
  /** The open project, left out of the list. */
  readonly current: Id;
  /** The open project has something in it (or an edit to undo). */
  readonly canClose: boolean;
  /** What deleting the open project would lose, for the dialog. */
  readonly deleteTarget: DeleteTarget;
}

/** New, close and delete the open project, and switch to a recent one (item 09). */
export function ProjectMenu({ current, canClose, deleteTarget }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const recent = (useProjects(current) ?? []).slice(0, RECENT);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
    };
  }, [open]);

  const run = (f: () => Promise<unknown>) => {
    setOpen(false);
    void f();
  };

  return (
    <div className="project-menu" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        Projects
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              run(() => getSession().newProject());
            }}
          >
            New project
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canClose}
            title="Back to the start screen, which lists every project in this browser"
            onClick={() => {
              run(() => getSession().closeProject());
            }}
          >
            Close project
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canClose}
            onClick={() => {
              setOpen(false);
              setDeleting(true);
            }}
          >
            Delete project…
          </button>
          {recent.length > 0 && <p className="menu-label">Recent</p>}
          {recent.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitem"
              className="recent"
              onClick={() => {
                run(() => getSession().openStored(r.id));
              }}
            >
              <span className="recent-name">{r.name}</span>
              <span className="recent-when">{whenEdited(r.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
      {deleting && (
        <DeleteProjectDialog
          target={deleteTarget}
          onClose={() => {
            setDeleting(false);
          }}
        />
      )}
    </div>
  );
}
