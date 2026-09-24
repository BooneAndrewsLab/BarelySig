import { useEffect, useRef, useState } from 'react';

import type { TableType } from '@/model/table';

import { analytics } from './analytics';
import { DataGrid } from './grid/DataGrid';
import { Home } from './shell/Home';
import { Navigator } from './shell/Navigator';
import { ProjectMenu } from './shell/ProjectMenu';
import { NewTableDialog } from './shell/NewTableDialog';
import { StatusLine } from './shell/StatusLine';
import { TableSheet } from './shell/TableSheet';
import { TopBar } from './shell/TopBar';
import { commandFor } from './shortcuts';
import { projectFile } from '@/io/files';

import { getSession } from './state/session';
import { project, store } from './state/store';
import { useAppState } from './state/useAppState';

export function App() {
  const state = useAppState();
  const p = project(state);
  const [newTable, setNewTable] = useState<TableType | null>(null);
  const [summary, setSummary] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    analytics.start(__APP_VERSION__, globalThis.matchMedia('(max-width: 900px)').matches);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = commandFor(e);
      if (cmd === 'undo') store.undo();
      else if (cmd === 'redo') store.redo();
      else if (cmd === 'open') fileInput.current?.click();
      else if (cmd === 'download') void getSession().download();
      else return;
      e.preventDefault();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, []);

  // A .bsig dropped anywhere on the window opens it.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') === true;
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropping(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(false);
      const file = projectFile(e.dataTransfer?.files ?? []);
      if (file) void getSession().openFile(file);
    };
    globalThis.addEventListener('dragover', over);
    globalThis.addEventListener('dragleave', leave);
    globalThis.addEventListener('drop', drop);
    return () => {
      globalThis.removeEventListener('dragover', over);
      globalThis.removeEventListener('dragleave', leave);
      globalThis.removeEventListener('drop', drop);
    };
  }, []);

  const table = state.sheet.kind === 'table' ? p.tables.get(state.sheet.id) : undefined;

  return (
    <div className="app">
      <TopBar name={p.name} undoLabel={store.undoLabel()} redoLabel={store.redoLabel()}>
        <span
          className="save-state"
          title="Your work is kept in this browser as you go. Download it to keep a file of your own or to share it."
        >
          {state.downloaded === p ? 'Downloaded' : 'Saved in this browser'}
        </span>
        <ProjectMenu />
        <button
          type="button"
          title="Open a .bsig file (Ctrl+O), or drop one on the window"
          onClick={() => fileInput.current?.click()}
        >
          Open…
        </button>
        <button
          type="button"
          title="Download this project as a .bsig file (Ctrl+S)"
          onClick={() => {
            void getSession().download();
          }}
        >
          Download
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".bsig,application/json"
          hidden
          aria-label="Open a project file"
          onChange={(e) => {
            const file = projectFile(e.currentTarget.files ?? []);
            e.currentTarget.value = '';
            if (file) void getSession().openFile(file);
          }}
        />
      </TopBar>
      <Navigator
        project={p}
        sheet={state.sheet}
        onNewTable={() => {
          setNewTable('column');
        }}
      />
      <main className="main">
        {table ? (
          <TableSheet project={p} table={table}>
            <DataGrid
              key={table.id}
              table={table}
              onEdit={(edit) => {
                store.clearNotice();
                return store.edit(edit);
              }}
              onNotice={(text, tone) => {
                store.notify(text, tone);
              }}
              onSelection={setSummary}
            />
          </TableSheet>
        ) : (
          <Home
            onNewTable={setNewTable}
            onExample={() => {
              void getSession().openExample();
            }}
          />
        )}
      </main>
      <StatusLine notice={state.notice}>{table ? summary : null}</StatusLine>
      {dropping && (
        <div className="drop-hint" aria-hidden="true">
          Drop a .bsig file to open it
        </div>
      )}
      {newTable && (
        <NewTableDialog
          initialType={newTable}
          defaultTitle={`Data ${String(p.tables.size + 1)}`}
          onClose={() => {
            setNewTable(null);
          }}
          onCreate={(t) => {
            setNewTable(null);
            store.edit({ op: 'addTable', table: t }, { show: { kind: 'table', id: t.id } });
            analytics.trackOnce('table', t.type === 'column' ? 'new-column' : 'new-grouped');
          }}
        />
      )}
    </div>
  );
}
