import { type ReactNode, useState, useSyncExternalStore } from 'react';

import { type GraphInput, graphInput, summaryId } from '@/graphs/data';
import { imageOf } from '@/graphs/cache';
import type { Id } from '@/model/ids';
import type { Project } from '@/model/project';
import { duplicateTable } from '@/model/table';

import { Icon } from '../Icon';
import { copyName } from '../copyName';
import { Logo } from '../Logo';
import { tableTypeInfo } from '../formats';
import { deletionNote } from '../shell/tables';
import { getSession } from '../state/session';
import { getResults } from '../state/results';
import { type Sheet, store } from '../state/store';
import { partsOf, sectionsOf, summaryLine } from './experiments';
import { MoreMenu } from './MoreMenu';
import { RenameInput } from './RenameInput';
import { useComplete, useFigure } from '../graphs/useFigure';

const NO_GRAPH: GraphInput = { ok: false, reason: '' };

/** The experiment's first graph, small; its table's icon until it has one. */
function Thumbnail({ project, table }: { readonly project: Project; readonly table: Id }) {
  const bridge = getResults();
  const graph = partsOf(project, table).graphs[0];
  const input: GraphInput = graph
    ? graphInput(project, graph, (id) => bridge.recompute.result(id))
    : NO_GRAPH;
  const state = graph ? bridge.recompute.status(summaryId(graph.id)).state : null;
  const ready = useComplete(input, state === 'running' || state === 'stale');
  const { drawn } = useFigure(`thumb:${graph?.id ?? table}`, ready);
  if (!drawn) {
    const t = project.tables.get(table);
    return (
      <span className="thumb icon-thumb" aria-hidden="true">
        {t && <Icon name={tableTypeInfo(t.type).icon} size={24} />}
      </span>
    );
  }
  return (
    <span className="thumb" aria-hidden="true">
      {/* The figure's own picture, scaled down (note 05, item 11). */}
      <img src={imageOf(drawn)} width={drawn.width} height={drawn.height} alt="" />
    </span>
  );
}

interface ItemProps {
  readonly project: Project;
  readonly id: Id;
  readonly active: boolean;
}

function ExperimentItem({ project, id, active }: ItemProps) {
  const [renaming, setRenaming] = useState(false);
  const table = project.tables.get(id);
  if (!table) return null;
  const titleId = `exp-title-${id}`;
  const summaryId = `exp-summary-${id}`;
  return (
    <li className={active ? 'exp-item active' : 'exp-item'}>
      {renaming ? (
        <RenameInput
          className="exp-rename"
          label="Name"
          value={table.title}
          onRename={(title) => {
            store.edit({ op: 'setTableInfo', table: id, title });
          }}
          onDone={() => {
            setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="exp-link"
          aria-current={active ? 'page' : undefined}
          aria-labelledby={titleId}
          aria-describedby={summaryId}
          onClick={() => {
            store.show({ kind: 'table', id });
          }}
          onDoubleClick={() => {
            setRenaming(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'F2') setRenaming(true);
          }}
        >
          <Thumbnail project={project} table={id} />
          <span className="exp-text">
            <span className="exp-title" id={titleId}>
              {table.title}
            </span>
            <span className="exp-summary" id={summaryId}>
              {summaryLine(project, id)}
            </span>
          </span>
        </button>
      )}
      <MoreMenu
        label={`More for ${table.title}`}
        items={[
          {
            label: 'Rename',
            onSelect: () => {
              setRenaming(true);
            },
          },
          {
            label: 'Duplicate',
            onSelect: () => {
              const copy = duplicateTable(
                table,
                copyName(table.title, new Set([...project.tables.values()].map((t) => t.title))),
              );
              store.edit(
                { op: 'addTable', table: copy, at: project.order.tables.indexOf(id) + 1 },
                { show: { kind: 'table', id: copy.id } },
              );
            },
          },
          {
            label: 'Delete',
            onSelect: () => {
              const note = deletionNote(project, id);
              if (store.edit({ op: 'removeTable', table: id })) {
                store.notify(`Deleted “${table.title}”${note}. Undo brings it back (Ctrl+Z).`);
              }
            },
          },
        ]}
      />
    </li>
  );
}

function ProjectName({ name }: { readonly name: string }) {
  const [renaming, setRenaming] = useState(false);
  return renaming ? (
    <RenameInput
      className="project-name editing"
      label="Project name"
      value={name}
      onRename={(v) => {
        store.edit({ op: 'renameProject', name: v });
      }}
      onDone={() => {
        setRenaming(false);
      }}
    />
  ) : (
    <button
      type="button"
      className="project-name"
      title="Close this project and go to the front page (double-click, or F2, to rename)"
      onClick={() => {
        void getSession().closeProject();
      }}
      onDoubleClick={() => {
        setRenaming(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'F2') setRenaming(true);
      }}
    >
      {name}
    </button>
  );
}

interface Props {
  readonly project: Project;
  readonly sheet: Sheet;
  /** The open experiment, if any. */
  readonly experiment: Id | null;
  readonly onNewExperiment: () => void;
  /** File actions and the save state, at the foot. */
  readonly children?: ReactNode;
}

/** The notebook's sidebar (item 08): the project, its experiments, the open page's sections. */
export function Sidebar({ project, sheet, experiment, onNewExperiment, children }: Props) {
  const bridge = getResults();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
  const sections = experiment ? sectionsOf(project, experiment) : [];
  return (
    <div className="side">
      <div className="side-head">
        <button
          type="button"
          className="logo-home"
          title="Close this project and go to the front page"
          onClick={() => {
            void getSession().closeProject();
          }}
        >
          <Logo height={20} />
        </button>
        {experiment !== null && <ProjectName name={project.name} />}
      </div>
      {experiment !== null && (
        <nav className="experiments" aria-label="Experiments">
          <h2>Experiments</h2>
          <ul>
            {project.order.tables.map((id) => (
              <ExperimentItem key={id} project={project} id={id} active={id === experiment} />
            ))}
          </ul>
          <button type="button" className="exp-new" onClick={onNewExperiment}>
            <Icon name="new-table" size={16} /> New experiment
          </button>
        </nav>
      )}
      {sections.length > 0 && (
        <nav className="on-page" aria-label="On this page">
          <h2>On this page</h2>
          <ol>
            {sections.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={sheet.kind !== 'home' && sheet.id === s.id ? 'true' : undefined}
                  onClick={() => {
                    store.show({ kind: s.kind, id: s.id });
                  }}
                >
                  <span className="on-page-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="side-foot">{children}</div>
    </div>
  );
}
