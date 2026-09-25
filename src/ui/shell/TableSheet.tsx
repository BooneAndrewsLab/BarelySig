import { type ReactNode, useState } from 'react';

import { gives } from '@/analyses/pairwise';
import { downstreamOf } from '@/model/deps';
import { newId } from '@/model/ids';
import { GRAPH_DEFAULTS, type Project } from '@/model/project';
import type { Table } from '@/model/table';

import { analytics } from '../analytics';
import { Icon } from '../Icon';
import { formatLabel, tableTypeInfo } from '../formats';
import { store } from '../state/store';
import { AnalyzeDialog } from './AnalyzeDialog';
import { FormatDialog } from './FormatDialog';

interface Props {
  readonly project: Project;
  readonly table: Table;
  /** The grid. */
  readonly children?: ReactNode;
}

/** A data table's sheet: its title, what kind of table it is, what reads from it, and the grid. */
export function TableSheet({ project, table, children }: Props) {
  const info = tableTypeInfo(table.type);
  const [formatting, setFormatting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const down = [...downstreamOf(project, table.id)];
  const analyses = down.flatMap((id) => {
    const a = project.analyses.get(id);
    return a ? [a] : [];
  });
  const graphs = down.flatMap((id) => {
    const g = project.graphs.get(id);
    return g ? [g] : [];
  });
  return (
    <section className="sheet" aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">{table.title}</h1>
        <span className="chip">
          <Icon name={info.icon} size={16} />
          {info.name} table, {formatLabel(table.format).toLowerCase()}
        </span>
        {(analyses.length > 0 || graphs.length > 0) && (
          <p className="linked">
            Used by{' '}
            {analyses.map((a) => (
              <button
                key={a.id}
                type="button"
                className="chip quiet"
                onClick={() => {
                  store.show({ kind: 'analysis', id: a.id });
                }}
              >
                {a.title}
              </button>
            ))}
            {graphs.map((g) => (
              <button
                key={g.id}
                type="button"
                className="chip quiet"
                onClick={() => {
                  store.show({ kind: 'graph', id: g.id });
                }}
              >
                {g.title}
              </button>
            ))}
          </p>
        )}
        <span className="head-actions">
          <button
            type="button"
            onClick={() => {
              setFormatting(true);
            }}
          >
            Change data format…
          </button>
          {table.type === 'column' && (
            <button
              type="button"
              onClick={() => {
                const id = newId('g');
                // Brackets of the table's comparisons come along (notes 05, 06).
                const tests = [...project.analyses.values()]
                  .filter((a) => gives(a) && a.input.kind === 'table' && a.input.table === table.id)
                  .map((a) => a.id);
                store.edit(
                  {
                    op: 'addGraph',
                    graph: {
                      id,
                      title: table.title,
                      source: { kind: 'table', table: table.id },
                      analyses: tests,
                      ...GRAPH_DEFAULTS,
                    },
                  },
                  { show: { kind: 'graph', id } },
                );
                analytics.trackOnce('graph', 'new-column');
              }}
            >
              <Icon name="new-graph" size={16} /> New graph
            </button>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => {
              setAnalyzing(true);
            }}
          >
            <Icon name="analyze" size={16} /> Analyze…
          </button>
        </span>
      </header>
      <div className="sheet-body">{children}</div>
      {analyzing && (
        <AnalyzeDialog
          table={table}
          onClose={() => {
            setAnalyzing(false);
          }}
        />
      )}
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
    </section>
  );
}
