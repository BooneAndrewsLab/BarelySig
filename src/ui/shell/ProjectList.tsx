import { useState } from 'react';

import type { ProjectSummary } from '@/io/storage';

import { MoreMenu } from '../notebook/MoreMenu';
import { RenameInput } from '../notebook/RenameInput';
import { getSession } from '../state/session';
import { type DeleteTarget, DeleteProjectDialog } from './DeleteProjectDialog';
import { contentsLine, whenEdited, whenSaved } from './recent';
import { StorageWarning } from './StorageWarning';

/** A search field appears once the list is longer than this. */
const SEARCH_FROM = 6;

function ProjectRow({
  project: r,
  onDelete,
  onEmpty,
}: {
  readonly project: ProjectSummary;
  readonly onDelete: (t: DeleteTarget) => void;
  readonly onEmpty: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const session = getSession();
  const contents = contentsLine(r);
  const metaId = `proj-meta-${r.id}`;
  const open = () => {
    void session.openStored(r.id).then((shown) => {
      if (!shown) onEmpty();
    });
  };
  return (
    <li className="proj-row">
      {renaming ? (
        <RenameInput
          className="proj-rename"
          label="Project name"
          value={r.name}
          onRename={(name) => {
            void session.renameStored(r.id, name);
          }}
          onDone={() => {
            setRenaming(false);
          }}
        />
      ) : (
        <button type="button" className="proj-open" aria-describedby={metaId} onClick={open}>
          <span className="proj-name">{r.name}</span>
          <span className="proj-meta" id={metaId}>
            {contents} ·{' '}
            <span title={whenSaved(r.updatedAt)}>edited {whenEdited(r.updatedAt)}</span>
            {!r.downloaded && (
              <span
                className="proj-flag"
                title="No file of its latest state: it is only in this browser"
              >
                {' '}
                · not downloaded
              </span>
            )}
          </span>
        </button>
      )}
      <MoreMenu
        label={`More for ${r.name}`}
        items={[
          {
            label: 'Open',
            onSelect: open,
          },
          {
            label: 'Rename',
            onSelect: () => {
              setRenaming(true);
            },
          },
          {
            label: 'Duplicate',
            onSelect: () => {
              void session.duplicateStored(r.id, r.name);
            },
          },
          {
            label: 'Download',
            onSelect: () => {
              void session.downloadStored(r.id);
            },
          },
          {
            label: 'Delete…',
            onSelect: () => {
              onDelete({ id: r.id, name: r.name, contents, downloaded: r.downloaded });
            },
          },
        ]}
      />
    </li>
  );
}

/**
 * Every project kept in this browser, newest change first (item 09):
 * click one to open it, ⋯ to rename, duplicate, download or delete it.
 */
export function ProjectList({
  projects,
  onEmpty,
}: {
  readonly projects: readonly ProjectSummary[];
  /** The clicked project is open already and has no table: offer to make one. */
  readonly onEmpty: () => void;
}) {
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const q = query.trim().toLocaleLowerCase();
  const shown =
    q === '' ? projects : projects.filter((r) => r.name.toLocaleLowerCase().includes(q));
  const unsaved = projects.filter((r) => !r.downloaded).length;
  return (
    <section className="projects" aria-labelledby="projects-title">
      <div className="projects-head">
        <h2 id="projects-title">Your projects</h2>
        {projects.length > SEARCH_FROM && (
          <input
            type="search"
            className="projects-search"
            aria-label="Find a project"
            placeholder="Find a project"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
            }}
          />
        )}
      </div>
      <p className="projects-lead">
        Kept in this browser as you work. Download a project to keep a file of it.
      </p>
      <StorageWarning unsaved={unsaved} />
      {shown.length === 0 ? (
        <p className="projects-none">No project’s name contains “{query.trim()}”.</p>
      ) : (
        <ul>
          {shown.map((r) => (
            <ProjectRow key={r.id} project={r} onDelete={setDeleting} onEmpty={onEmpty} />
          ))}
        </ul>
      )}
      {deleting && (
        <DeleteProjectDialog
          target={deleting}
          onClose={() => {
            setDeleting(null);
          }}
        />
      )}
    </section>
  );
}
