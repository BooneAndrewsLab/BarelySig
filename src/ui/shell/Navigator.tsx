import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { Id } from '@/model/ids';
import type { Project } from '@/model/project';
import type { NodeState } from '@/model/recompute';
import { duplicateTable } from '@/model/table';

import { KIND_ICON } from '../analysisKinds';
import { Icon, type IconName } from '../Icon';
import { tableTypeInfo } from '../formats';
import { getResults } from '../state/results';
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

interface ItemProps {
  readonly title: string;
  readonly icon: IconName;
  readonly active: boolean;
  readonly status?: { readonly state: NodeState; readonly label: string } | undefined;
  readonly onShow: () => void;
  readonly onRename: (title: string) => void;
  readonly onDuplicate?: () => void;
  readonly onDelete: () => void;
}

/** One navigator entry: shows its sheet; renames in place (double-click, F2); a menu for the rest. */
function NavItem({
  title,
  icon,
  active,
  status,
  onShow,
  onRename,
  onDuplicate,
  onDelete,
}: ItemProps) {
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

  const rename = (value: string) => {
    setRenaming(false);
    const v = value.trim();
    if (v && v !== title) onRename(v);
  };
  const act = (f: () => void) => () => {
    setMenu(false);
    f();
  };

  return (
    <li className={active ? 'nav-item active' : 'nav-item'}>
      {renaming ? (
        <input
          className="nav-rename"
          aria-label="Name"
          defaultValue={title}
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
          onClick={onShow}
          onDoubleClick={() => {
            setRenaming(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'F2') setRenaming(true);
            if (e.key === 'Delete') onDelete();
          }}
        >
          <Icon name={icon} size={16} />
          <span className="nav-title">{title}</span>
          {status && status.state !== 'fresh' && (
            <span
              className={`nav-status ${status.state}`}
              role="img"
              aria-label={status.label}
              title={status.label}
            />
          )}
        </button>
      )}
      <button
        type="button"
        className="nav-more"
        aria-label={`More for ${title}`}
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
            onClick={act(() => {
              setRenaming(true);
            })}
          >
            Rename
          </button>
          {onDuplicate && (
            <button type="button" role="menuitem" onClick={act(onDuplicate)}>
              Duplicate
            </button>
          )}
          <button type="button" role="menuitem" onClick={act(onDelete)}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

const STATUS_LABEL: Readonly<Record<NodeState, string>> = {
  fresh: 'Up to date',
  stale: 'Updating',
  running: 'Calculating',
  error: 'Needs attention',
  blocked: 'Can’t run yet',
};

export function Navigator({ project, sheet, onNewTable }: Props) {
  const bridge = getResults();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
  const tableItems = project.order.tables.flatMap((id) => {
    const table = project.tables.get(id);
    if (!table) return [];
    const remove = () => {
      const note = deletionNote(project, id);
      if (store.edit({ op: 'removeTable', table: id })) {
        store.notify(`Deleted “${table.title}”${note}. Undo brings it back (Ctrl+Z).`);
      }
    };
    return [
      <NavItem
        key={id}
        title={table.title}
        icon={tableTypeInfo(table.type).icon}
        active={sheet.kind === 'table' && sheet.id === id}
        onShow={() => {
          store.show({ kind: 'table', id });
        }}
        onRename={(title) => {
          store.edit({ op: 'setTableInfo', table: id, title });
        }}
        onDuplicate={() => {
          const copy = duplicateTable(table, copyTitle(project, table.title));
          store.edit(
            { op: 'addTable', table: copy, at: project.order.tables.indexOf(id) + 1 },
            { show: { kind: 'table', id: copy.id } },
          );
        }}
        onDelete={remove}
      />,
    ];
  });
  const analysisItems = project.order.analyses.flatMap((id: Id) => {
    const a = project.analyses.get(id);
    if (!a) return [];
    const state = bridge.recompute.status(id).state;
    return [
      <NavItem
        key={id}
        title={a.title}
        icon={KIND_ICON[a.kind]}
        active={sheet.kind === 'analysis' && sheet.id === id}
        status={{ state, label: STATUS_LABEL[state] }}
        onShow={() => {
          store.show({ kind: 'analysis', id });
        }}
        onRename={(title) => {
          store.edit({ op: 'setAnalysis', analysis: { ...a, title } });
        }}
        onDelete={() => {
          if (store.edit({ op: 'removeAnalysis', analysis: id })) {
            store.notify(`Deleted “${a.title}”. Undo brings it back (Ctrl+Z).`);
          }
        }}
      />,
    ];
  });
  const graphItems = project.order.graphs.flatMap((id: Id) => {
    const g = project.graphs.get(id);
    if (!g) return [];
    return [
      <NavItem
        key={id}
        title={g.title}
        icon={g.plot.kind === 'bars' ? 'bar-error' : 'dot-plot'}
        active={sheet.kind === 'graph' && sheet.id === id}
        onShow={() => {
          store.show({ kind: 'graph', id });
        }}
        onRename={(title) => {
          store.edit({ op: 'setGraph', graph: { ...g, title } });
        }}
        onDelete={() => {
          if (store.edit({ op: 'removeGraph', graph: id })) {
            store.notify(`Deleted “${g.title}”. Undo brings it back (Ctrl+Z).`);
          }
        }}
      />,
    ];
  });
  return (
    <nav className="navigator" aria-label="Project">
      <section>
        <h2>Data tables</h2>
        <ul>{tableItems}</ul>
        <button type="button" className="nav-new" onClick={onNewTable}>
          <Icon name="new-table" size={16} /> New table
        </button>
      </section>
      <section>
        <h2>Results</h2>
        {analysisItems.length > 0 ? (
          <ul>{analysisItems}</ul>
        ) : (
          <p className="nav-empty">Open a table and click Analyze; the results appear here.</p>
        )}
      </section>
      <section>
        <h2>Graphs</h2>
        {graphItems.length > 0 ? (
          <ul>{graphItems}</ul>
        ) : (
          <p className="nav-empty">Open a table and click New graph; your graphs appear here.</p>
        )}
      </section>
    </nav>
  );
}
