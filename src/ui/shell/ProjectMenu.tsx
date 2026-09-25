import { useEffect, useRef, useState } from 'react';

import type { ProjectSummary } from '@/io/storage';

import { getSession } from '../state/session';
import { whenSaved } from './recent';

/** New project, close the open one, and the projects kept in this browser. */
export function ProjectMenu({ canClose }: { readonly canClose: boolean }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<readonly ProjectSummary[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void getSession()
      .storage.list()
      .then((r) => {
        if (live) setRecent(r);
      })
      .catch(() => {
        if (live) setRecent([]);
      });
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => {
      live = false;
      document.removeEventListener('mousedown', outside);
    };
  }, [open]);

  const run = (f: () => Promise<void>) => {
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
            onClick={() => {
              run(() => getSession().closeProject());
            }}
          >
            Close project
          </button>
          {recent.length > 0 && <p className="menu-label">In this browser</p>}
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
              <span className="recent-when">{whenSaved(r.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
