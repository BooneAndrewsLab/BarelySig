import type { TableType } from '@/model/table';

import { Icon } from '../Icon';
import { TABLE_TYPES } from '../formats';

interface Props {
  readonly onNewTable: (type: TableType) => void;
  readonly onExample: () => void;
}

/** The empty project: start a table, or look at an example first. */
export function Home({ onNewTable, onExample }: Props) {
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
    </div>
  );
}
