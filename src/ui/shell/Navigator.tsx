import { useEffect, useRef, useState } from 'react';

import type { Id } from '@/model/ids';
import type { Project } from '@/model/project';
import { duplicateTable } from '@/model/table';

import { Icon } from '../Icon';
import { tableTypeInfo } from '../formats';
import { type Sheet, store } from '../state/store';
import { deletionNote } from './tables';

interface Props {
  readonly project: Project;
  readonly sheet: Sheet;
  readonly onNewTable: () => void;
}

function copyTitle(project: Project, title: string): string {
  const taken = new Set([...project.tables.values()].map((t) => t.title));
  for (let i = 1; ; i += 1) {
    const candidate = i === 1 ? `${title} (copy)` : `${title} (copy ${String(i)})`;
    if (!taken.has(candidate)) return candidate;
  }
}

function TableItem({
  project,
  id,
  active,
}: {
  readonly project: Project;
  readonly id: Id;
  readonly active: boolean;
}) {
  const table = project.tables.get(id);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [menu]);

  if (!table) return null;
  const show = () => {
    store.show({ kind: 'table', id });
  };
  const rename = (title: string) => {
    setRenaming(false);
    const t = title.trim();
    if (t && t !== table.title) store.edit({ op: 'setTableInfo', table: id, title: t });
  };
  const duplicate = () => {
    setMenu(false);
    const copy = duplicateTable(table, copyTitle(project, table.title));
    const at = project.order.tables.indexOf(id) + 1;
    store.edit({ op: 'addTable', table: copy, at }, { show: { kind: 'table', id: copy.id } });
  };
  const remove = () => {
    setMenu(false);
    const note = deletionNote(project, id);
    if (store.edit({ op: 'removeTable', table: id })) {
      store.notify(`Deleted “${table.title}”${note}. Undo brings it back (Ctrl+Z).`);
    }
  };

  return (
    <li className={active ? 'nav-item active' : 'nav-item'}>
      {renaming ? (
        <input
          className="nav-rename"
          aria-label="Table name"
          defaultValue={table.title}
          autoFocus
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            rename(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename(e.currentTarget.value);
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="nav-link"
          aria-current={active ? 'page' : undefined}
          onClick={show}
          onDoubleClick={() => {
            setRenaming(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'F2') setRenaming(true);
            if (e.key === 'Delete') remove();
          }}
        >
          <Icon name={tableTypeInfo(table.type).icon} size={16} />
          <span className="nav-title">{table.title}</span>
        </button>
      )}
      <button
        type="button"
        className="nav-more"
        aria-label={`More for ${table.title}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => {
          setMenu((m) => !m);
        }}
      >
        ⋯
      </button>
      {menu && (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMenu(false);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const items = [
                ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
              ];
              const i = items.indexOf(document.activeElement as HTMLElement);
              items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          <button type="button" role="menuitem" onClick={duplicate}>
            Duplicate
          </button>
          <button type="button" role="menuitem" onClick={remove}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

export function Navigator({ project, sheet, onNewTable }: Props) {
  return (
    <nav className="navigator" aria-label="Project">
      <section>
        <h2>Data tables</h2>
        <ul>
          {project.order.tables.map((id) => (
            <TableItem
              key={id}
              project={project}
              id={id}
              active={sheet.kind === 'table' && sheet.id === id}
            />
          ))}
        </ul>
        <button type="button" className="nav-new" onClick={onNewTable}>
          <Icon name="new-table" size={16} /> New table
        </button>
      </section>
      <section>
        <h2>Results</h2>
        <p className="nav-empty">Analyses you run on a table appear here.</p>
      </section>
      <section>
        <h2>Graphs</h2>
        <p className="nav-empty">Graphs of your tables and results appear here.</p>
      </section>
    </nav>
  );
}
