import type { ReactNode } from 'react';

import { downstreamOf } from '@/model/deps';
import type { Project } from '@/model/project';
import type { Table } from '@/model/table';

import { Icon } from '../Icon';
import { formatLabel, tableTypeInfo } from '../formats';

interface Props {
  readonly project: Project;
  readonly table: Table;
  /** The grid. */
  readonly children?: ReactNode;
}

/** A data table's sheet: its title, what kind of table it is, what reads from it, and the grid. */
export function TableSheet({ project, table, children }: Props) {
  const info = tableTypeInfo(table.type);
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
            {[...analyses.map((a) => a.title), ...graphs.map((g) => g.title)].map((t, i) => (
              <span key={i} className="chip quiet">
                {t}
              </span>
            ))}
          </p>
        )}
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
