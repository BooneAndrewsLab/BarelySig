import { useEffect, useState } from 'react';

import type { TableType } from '@/model/table';

import { analytics } from './analytics';
import { DataGrid } from './grid/DataGrid';
import { exampleProject } from './examples';
import { Home } from './shell/Home';
import { Navigator } from './shell/Navigator';
import { NewTableDialog } from './shell/NewTableDialog';
import { StatusLine } from './shell/StatusLine';
import { TableSheet } from './shell/TableSheet';
import { TopBar } from './shell/TopBar';
import { commandFor } from './shortcuts';
import { project, store } from './state/store';
import { useAppState } from './state/useAppState';

export function App() {
  const state = useAppState();
  const p = project(state);
  const [newTable, setNewTable] = useState<TableType | null>(null);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    analytics.start(__APP_VERSION__, globalThis.matchMedia('(max-width: 900px)').matches);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = commandFor(e);
      if (cmd === 'undo') store.undo();
      else if (cmd === 'redo') store.redo();
      else return;
      e.preventDefault();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
    };
  }, []);

  const table = state.sheet.kind === 'table' ? p.tables.get(state.sheet.id) : undefined;

  return (
    <div className="app">
      <TopBar name={p.name} undoLabel={store.undoLabel()} redoLabel={store.redoLabel()} />
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
              store.load(exampleProject());
            }}
          />
        )}
      </main>
      <StatusLine notice={state.notice}>{table ? summary : null}</StatusLine>
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
