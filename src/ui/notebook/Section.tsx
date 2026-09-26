import { type ReactNode, useId, useState } from 'react';

import type { Id } from '@/model/ids';

import { sectionDomId } from './experiments';
import { type MenuItem, MoreMenu } from './MoreMenu';
import { RenameInput } from './RenameInput';

interface Props {
  /** The table, analysis or graph the section shows. */
  readonly id: Id;
  /** Its place on the page, from 1. */
  readonly number: number;
  readonly title: string;
  /** Renaming in place; absent for a section whose title is fixed ("Data"). */
  readonly onRename?: (title: string) => void;
  /** Beside the title: what kind of thing this is. */
  readonly chip?: ReactNode;
  /** Buttons at the head's end. */
  readonly actions?: ReactNode;
  /** The ⋯ menu; Rename is added when `onRename` is given. */
  readonly menu?: readonly MenuItem[];
  /** The margin note beside the section (#56), or null. */
  readonly note?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

/** One numbered section of an experiment's page (item 08), with its margin note. */
export function Section({
  id,
  number,
  title,
  onRename,
  chip,
  actions,
  menu = [],
  note = null,
  className,
  children,
}: Props) {
  const headingId = useId();
  const [renaming, setRenaming] = useState(false);
  const [open, setOpen] = useState(true);
  const items: MenuItem[] = [
    ...(onRename
      ? [
          {
            label: 'Rename',
            onSelect: () => {
              setRenaming(true);
            },
          },
        ]
      : []),
    ...menu,
  ];
  return (
    <div className={note ? 'nb-row' : 'nb-row no-note'}>
      <section
        id={sectionDomId(id)}
        className={className ? `nb-section ${className}` : 'nb-section'}
        aria-labelledby={headingId}
      >
        <header className="nb-head">
          <span className="nb-num" aria-hidden="true">
            {number}
          </span>
          {renaming && onRename ? (
            <RenameInput
              className="nb-rename"
              label="Name"
              value={title}
              onRename={onRename}
              onDone={() => {
                setRenaming(false);
              }}
            />
          ) : (
            <h2
              id={headingId}
              onDoubleClick={() => {
                if (onRename) setRenaming(true);
              }}
            >
              {title}
            </h2>
          )}
          {chip}
          <span className="nb-actions">
            {actions}
            <button
              type="button"
              className="nb-fold"
              aria-expanded={open}
              aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
              title={open ? 'Collapse' : 'Expand'}
              onClick={() => {
                setOpen((o) => !o);
              }}
            >
              {open ? '▾' : '▸'}
            </button>
            {items.length > 0 && <MoreMenu label={`More for ${title}`} items={items} />}
          </span>
        </header>
        {open && <div className="nb-body">{children}</div>}
      </section>
      {note && <aside className="nb-note">{note}</aside>}
    </div>
  );
}
