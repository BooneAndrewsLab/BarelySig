import type { Id } from '@/model/ids';
import type { TableType } from '@/model/table';

import { Icon } from '../Icon';
import { TABLE_TYPES } from '../formats';
import { getSession } from '../state/session';
import { useRecentProjects, whenSaved } from './recent';

interface Props {
  readonly onNewTable: (type: TableType) => void;
  readonly onExample: () => void;
  /** The open (empty) project, left out of the list. */
  readonly current: Id;
}

/** The empty project: start a table, or look at an example first. */
export function Home({ onNewTable, onExample, current }: Props) {
  const recent = useRecentProjects(current, current);
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
      {recent.length > 0 && (
        <section className="home-recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Projects in this browser</h2>
          <ul>
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="recent-open"
                  onClick={() => {
                    void getSession().openStored(r.id);
                  }}
                >
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-when">
                    {r.tables === 1 ? '1 table' : `${String(r.tables)} tables`}, saved{' '}
                    {whenSaved(r.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
