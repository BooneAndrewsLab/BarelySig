import type { ReactNode } from 'react';

import type { Id } from '@/model/ids';
import type { TableType } from '@/model/table';

import { Icon } from '../Icon';
import { Logo } from '../Logo';
import { TABLE_TYPES } from '../formats';
import { ProjectList } from './ProjectList';
import { useProjects } from './recent';

interface Props {
  readonly onNewTable: (type: TableType) => void;
  /** No type: the whole-app example; a type: that table type's own. */
  readonly onExample: (type?: TableType) => void;
  /** Open… for a data file (item 10). */
  readonly onOpenFile: () => void;
  /** The open project when it is blank, left out of the list. */
  readonly current: Id | null;
  /** Header actions at the right (the guide), filled in by the app. */
  readonly children?: ReactNode;
}

const PROMISES = [
  {
    title: 'Numbers you can trust',
    text: 'Every test runs in R, in your browser, and is checked against desktop R before it ships.',
  },
  {
    title: 'Figures ready for the journal',
    text: 'Bars, dots, boxes and violins with significance brackets; SVG or PNG at exact size.',
  },
  {
    title: 'Your data stay here',
    text: 'No account, no upload. Projects are kept in this browser; download a file any time.',
  },
];

/**
 * The front page (item 09): what BarelySig is, start a project with a
 * table or a data file, or open one kept in this browser. No project is
 * open here, so there is no sidebar, project name or undo.
 */
export function Home({ onNewTable, onExample, onOpenFile, current, children }: Props) {
  const projects = useProjects(current ?? undefined);
  return (
    <div className="landing">
      <header className="landing-bar">
        <Logo height={24} />
        <div className="bar-actions">
          <button
            type="button"
            onClick={onOpenFile}
            title="Open a .bsig project, a figure exported from BarelySig, or a data file (Ctrl+O)"
          >
            Open…
          </button>
          {children}
        </div>
      </header>
      <div className="home">
        <section className="hero">
          <p className="hero-tag">
            No license required. Asterisks included<span className="hero-star">*</span>
          </p>
          <h1 className="hero-title">Statistics and graphs for the bench.</h1>
          <p className="hero-lead">
            Enter your data, click an analysis, get a publishable graph with its P values. Free,
            open source, and it runs entirely in your browser.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                onExample();
              }}
            >
              Try an example
            </button>
            <button type="button" className="outline" onClick={onOpenFile}>
              Open a data file
            </button>
          </div>
          <p className="hero-note">
            .csv, .xlsx, .xls, .ods or .txt, or drop it on the window: BarelySig works out how it is
            laid out and shows you before making anything.
          </p>
        </section>

        {projects !== null && projects.length > 0 && (
          <ProjectList
            projects={projects}
            onEmpty={() => {
              onNewTable('column');
            }}
          />
        )}

        <section className="start" aria-labelledby="start-title">
          <h2 id="start-title">Start with a table</h2>
          <p className="home-lead">
            Pick how your data are laid out. You can paste straight from Excel once it is open.
          </p>
          <div className="home-types">
            {TABLE_TYPES.map((t) => (
              <div key={t.type} className="home-type">
                <Icon name={t.icon} size={40} />
                <button
                  type="button"
                  className="type-open"
                  onClick={() => {
                    onNewTable(t.type);
                  }}
                >
                  {t.name} table
                </button>
                <span className="type-blurb">{t.blurb}</span>
                <button
                  type="button"
                  className="type-example"
                  onClick={() => {
                    onExample(t.type);
                  }}
                >
                  Open an example
                </button>
              </div>
            ))}
          </div>
        </section>

        <ul className="promises">
          {PROMISES.map((p) => (
            <li key={p.title}>
              <strong>{p.title}</strong>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>

        <footer className="landing-foot">
          BarelySig {__APP_VERSION__} · MIT licence · <span className="hero-star">*</span> P &lt;
          0.05
        </footer>
      </div>
    </div>
  );
}
