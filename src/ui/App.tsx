import { HelpButton } from './help/HelpButton';
import { useEffect, useRef, useState } from 'react';

import type { Edit } from '@/model/edits';
import type { Table, TableType } from '@/model/table';

import { analytics } from './analytics';
import { DataGrid } from './grid/DataGrid';
import { Home } from './shell/Home';
import { HomeButton } from './shell/HomeButton';
import { useProjects } from './shell/recent';
import { SaveState } from './shell/SaveState';
import { NewTableDialog } from './shell/NewTableDialog';
import { OpenDataDialog } from './shell/OpenDataDialog';
import { stem } from './shell/openData';
import { StatusLine } from './shell/StatusLine';
import { ExperimentPage } from './notebook/ExperimentPage';
import { experimentOf } from './notebook/experiments';
import { NotesSwitch } from './notebook/NotesSwitch';
import { Sidebar } from './notebook/Sidebar';
import { TopBar } from './shell/TopBar';
import { commandFor } from './shortcuts';
import { pickFile } from '@/io/files';
import type { ImportResult } from '@/io/import/guess';
import { DATA_EXTENSIONS, formatLabel } from '@/io/import/sheets';

import { getSession } from './state/session';
import { checkStorage } from './state/storageSafety';
import { project, store } from './state/store';
import { useAppState } from './state/useAppState';

/** Opens a project or figure at once; a data file goes to the Open data file dialog. */
function routeFiles(files: Iterable<File>, onData: (file: File) => void): void {
  const pick = pickFile(files);
  if (!pick) return;
  if (pick.kind === 'project') void getSession().openFile(pick.file);
  else onData(pick.file);
}

export function App() {
  const state = useAppState();
  const p = project(state);
  const [newTable, setNewTable] = useState<TableType | null>(null);
  const [summary, setSummary] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const [dataFile, setDataFile] = useState<File | null>(null);

  useEffect(() => {
    void checkStorage();
  }, []);

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

  // A .bsig or a data file dropped anywhere on the window opens it.
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
      routeFiles(e.dataTransfer?.files ?? [], setDataFile);
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

  // A fresh project with nothing in it, not in the list: nothing to close, delete or keep.
  const stored = useProjects()?.some((r) => r.id === p.id) === true;
  const blank =
    !stored &&
    p.tables.size === 0 &&
    p.analyses.size === 0 &&
    p.graphs.size === 0 &&
    store.undoLabel() === null;
  const experiment = experimentOf(p, state.sheet);

  /** A data file becomes a new experiment; a blank project takes the file's name (item 10). */
  const openData = (file: File, t: Table, result: ImportResult) => {
    const fresh = p.tables.size === 0 && p.analyses.size === 0 && p.name === 'Untitled project';
    const edits: Edit[] = [
      ...(fresh ? [{ op: 'renameProject' as const, name: stem(file.name) }] : []),
      { op: 'addTable', table: t },
    ];
    if (
      !store.edit(
        { op: 'batch', label: 'Open data file', edits },
        { show: { kind: 'table', id: t.id } },
      )
    )
      return;
    const values = result.notes.values;
    store.notify(
      `Opened “${file.name}” as a new experiment: ${String(values)} ${values === 1 ? 'value' : 'values'}.`,
    );
    analytics.trackOnce('file', 'open-data', formatLabel(file.name));
  };
  const table = experiment === null ? undefined : p.tables.get(experiment);

  const fileInputEl = (
    <input
      ref={fileInput}
      type="file"
      accept={`.bsig,application/json,.svg,image/svg+xml,.png,image/png,${DATA_EXTENSIONS.join(',')}`}
      hidden
      aria-label="Open a project or data file"
      onChange={(e) => {
        const files = [...(e.currentTarget.files ?? [])];
        e.currentTarget.value = '';
        routeFiles(files, setDataFile);
      }}
    />
  );

  const dialogs = (
    <>
      {dropping && (
        <div className="drop-hint" aria-hidden="true">
          Drop a data file (.csv, .xlsx, …), a .bsig project or an exported figure to open it
        </div>
      )}
      {newTable && (
        <NewTableDialog
          initialType={newTable}
          defaultTitle={`Data ${String(p.tables.size + 1)}`}
          onClose={() => {
            setNewTable(null);
          }}
          onOpenFile={() => {
            setNewTable(null);
            fileInput.current?.click();
          }}
          onCreate={(t) => {
            setNewTable(null);
            store.edit({ op: 'addTable', table: t }, { show: { kind: 'table', id: t.id } });
            analytics.trackOnce(
              'table',
              t.type === 'column'
                ? 'new-column'
                : t.type === 'grouped'
                  ? 'new-grouped'
                  : t.type === 'nested'
                    ? 'new-nested'
                    : t.type === 'xy'
                      ? 'new-xy'
                      : 'new-contingency',
            );
          }}
        />
      )}
      {dataFile && (
        <OpenDataDialog
          file={dataFile}
          onClose={() => {
            setDataFile(null);
          }}
          onCreate={(t, result) => {
            setDataFile(null);
            openData(dataFile, t, result);
          }}
        />
      )}
    </>
  );

  if (!table) {
    return (
      <div className="app app-landing">
        <main className="main">
          <Home
            current={blank ? p.id : null}
            onNewTable={setNewTable}
            onOpenFile={() => fileInput.current?.click()}
            onExample={() => {
              void getSession().openExample();
            }}
          >
            <HelpButton />
          </Home>
        </main>
        <StatusLine notice={state.notice} />
        {fileInputEl}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        project={p}
        sheet={state.sheet}
        experiment={table.id}
        onNewExperiment={() => {
          setNewTable('column');
        }}
      >
        <HomeButton />
        <button
          type="button"
          title="Open a .bsig project, a figure exported from BarelySig, or a data file such as .csv or .xlsx (Ctrl+O); or drop one on the window"
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
        {!blank && <SaveState downloaded={state.downloaded === p} />}
      </Sidebar>
      <TopBar
        project={p.name}
        experiment={table.title}
        undoLabel={store.undoLabel()}
        redoLabel={store.redoLabel()}
      >
        <NotesSwitch />
        <HelpButton />
      </TopBar>
      <main className="main">
        <ExperimentPage
          key={table.id}
          project={p}
          table={table}
          sheet={state.sheet}
          grid={
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
          }
        />
      </main>
      <StatusLine notice={state.notice}>{summary}</StatusLine>
      {fileInputEl}
      {dialogs}
    </div>
  );
}
