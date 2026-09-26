import type { Id } from '@/model/ids';
import type { TableType } from '@/model/table';

import { Icon } from '../Icon';
import { TABLE_TYPES } from '../formats';
import { ProjectList } from './ProjectList';
import { useProjects } from './recent';

interface Props {
  readonly onNewTable: (type: TableType) => void;
  readonly onExample: () => void;
  /** The open (empty) project, left out of the list. */
  readonly current: Id;
}

/** The start screen: start a project with a table, or open one kept in this browser (item 09). */
export function Home({ onNewTable, onExample, current }: Props) {
  const projects = useProjects(current);
  return (
    <div className="home">
      <h1>Start with a table</h1>
      <p className="home-lead">
        Pick how your data are laid out. You can paste straight from Excel once it is open.
      </p>
      <div className="home-types">
        {TABLE_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            className="type-tile"
            onClick={() => {
              onNewTable(t.type);
            }}
          >
            <Icon name={t.icon} size={40} />
            <span className="type-name">{t.name} table</span>
            <span className="type-blurb">{t.blurb}</span>
          </button>
        ))}
      </div>
      <p className="home-more">
        <button type="button" className="link" onClick={onExample}>
          Try an example
        </button>{' '}
        with made-up numbers.
      </p>
      {projects !== null && projects.length > 0 && <ProjectList projects={projects} />}
    </div>
  );
}
