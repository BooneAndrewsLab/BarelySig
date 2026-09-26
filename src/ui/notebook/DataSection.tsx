import { type ReactNode, useState } from 'react';

import type { Project } from '@/model/project';
import type { Table } from '@/model/table';

import { Icon } from '../Icon';
import { formatLabel, tableTypeInfo } from '../formats';
import { AnalyzeDialog } from '../shell/AnalyzeDialog';
import { FormatDialog } from '../shell/FormatDialog';
import { store } from '../state/store';
import { addGraph, gridHeight } from './actions';
import { Section } from './Section';

interface Props {
  readonly table: Table;
  readonly project: Project;
  readonly note?: ReactNode;
  /** The grid. */
  readonly children?: ReactNode;
}

/** Section 1 of an experiment: what kind of table it is, and the grid. */
export function DataSection({ table, project, note, children }: Props) {
  const info = tableTypeInfo(table.type);
  const [formatting, setFormatting] = useState(false);
  return (
    <Section
      id={table.id}
      number={1}
      title="Data"
      className="data-section"
      chip={
        <span className="chip">
          <Icon name={info.icon} size={16} />
          {info.name} table, {formatLabel(table.format).toLowerCase()}
        </span>
      }
      actions={
        <button
          type="button"
          onClick={() => {
            setFormatting(true);
          }}
        >
          Change data format…
        </button>
      }
      note={note}
    >
      <div className="grid-box" style={{ height: `${String(gridHeight(table))}px` }}>
        {children}
      </div>
      {formatting && (
        <FormatDialog
          project={project}
          table={table}
          onClose={() => {
            setFormatting(false);
          }}
          onApply={(format) => {
            setFormatting(false);
            store.edit({ op: 'setFormat', table: table.id, format });
          }}
        />
      )}
    </Section>
  );
}

/** Between the data and what is made from it: the next steps (item 08). */
export function NextSteps({
  project,
  table,
}: {
  readonly project: Project;
  readonly table: Table;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  return (
    <div className="next-steps">
      <span className="rule" aria-hidden="true" />
      <button
        type="button"
        className="pill primary"
        onClick={() => {
          setAnalyzing(true);
        }}
      >
        <Icon name="analyze" size={16} /> Analyze…
      </button>
      <button
        type="button"
        className="pill"
        onClick={() => {
          addGraph(project, table);
        }}
      >
        <Icon name="new-graph" size={16} /> New graph
      </button>
      <span className="rule" aria-hidden="true" />
      {analyzing && (
        <AnalyzeDialog
          table={table}
          onClose={() => {
            setAnalyzing(false);
          }}
        />
      )}
    </div>
  );
}
