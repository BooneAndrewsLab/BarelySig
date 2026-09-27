import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { Project } from '@/model/project';
import type { Table } from '@/model/table';

import { GraphSection } from '../graphs/GraphSection';
import { ResultsSection } from '../results/ResultsSection';
import { type Sheet, store } from '../state/store';
import { DataSection, NextSteps } from './DataSection';
import { partsOf, sectionDomId } from './experiments';
import { MarginNotes } from './MarginNotes';
import { analysisNotes, dataNotes, graphNotes } from './notes';
import { useNotesShown } from './notesShown';

/** The experiment's description (the table's notes): click to write one. */
function Description({ table }: { readonly table: Table }) {
  const [editing, setEditing] = useState(false);
  const commit = (value: string) => {
    setEditing(false);
    const v = value.trim();
    if (v !== (table.notes ?? ''))
      store.edit({ op: 'setTableInfo', table: table.id, notes: v || null });
  };
  if (editing) {
    return (
      <textarea
        className="page-desc editing"
        aria-label="Description"
        defaultValue={table.notes ?? ''}
        rows={2}
        autoFocus
        onBlur={(e) => {
          commit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={table.notes ? 'page-desc' : 'page-desc empty'}
      title="Edit the description"
      onClick={() => {
        setEditing(true);
      }}
    >
      {table.notes ?? 'Add a description: cell line, assay, date…'}
    </button>
  );
}

interface Props {
  readonly project: Project;
  readonly table: Table;
  /** The sheet asked for: its section is scrolled into view. */
  readonly sheet: Sheet;
  /** The grid. */
  readonly grid: ReactNode;
}

/** One experiment as a page (item 08): its data, then each analysis, then each graph. */
export function ExperimentPage({ project, table, sheet, grid }: Props) {
  const { analyses, graphs } = partsOf(project, table.id);
  const page = useRef<HTMLElement>(null);
  const notes = useNotesShown();

  // A new sheet object is a request to show it (store.show, an edit's `show`, undo).
  useEffect(() => {
    if (sheet.kind === 'home') return;
    if (sheet.kind === 'table') {
      page.current?.closest('.main')?.scrollTo({ top: 0 });
      return;
    }
    document.getElementById(sectionDomId(sheet.id))?.scrollIntoView({ block: 'start' });
  }, [sheet]);

  return (
    <article ref={page} className={notes ? 'page with-notes' : 'page'} aria-labelledby="page-title">
      <header className="page-head">
        <h1 id="page-title">{table.title}</h1>
        <Description table={table} />
      </header>
      <DataSection
        table={table}
        project={project}
        note={notes ? <MarginNotes notes={dataNotes(table)} /> : null}
      >
        {grid}
      </DataSection>
      <NextSteps project={project} table={table} />
      {analyses.map((a, i) => (
        <ResultsSection
          key={a.id}
          project={project}
          analysis={a}
          number={i + 2}
          note={notes ? <MarginNotes notes={analysisNotes(project, a)} /> : null}
        />
      ))}
      {graphs.map((g, i) => (
        <GraphSection
          key={g.id}
          project={project}
          graph={g}
          number={analyses.length + i + 2}
          note={notes ? <MarginNotes notes={graphNotes(project, g)} /> : null}
        />
      ))}
    </article>
  );
}
