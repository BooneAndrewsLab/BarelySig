/**
 * A graph as a section of its experiment's page (notes 05, 08): the
 * figure at its real proportions; Format (or clicking a part of the
 * figure) opens the settings a graph needs (what to plot, error bars,
 * theme, size) or the inspector beside it; notes say what the marks show. The figure is the same SVG an
 * export writes.
 */
import { type ReactNode, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { graphInput, summaryId } from '@/graphs/data';
import { outlinePath, pickIn } from '@/graphs/drawn';
import type { ElementId } from '@/graphs/hit';
import { getRenderer } from '@/graphs/renderer';
import { describePlot } from '@/graphs/layout';
import type { Json } from '@/model/json';
import type { Graph, Project } from '@/model/project';

import { Icon } from '../Icon';
import { schemeText } from '../results/format';
import { getResults } from '../state/results';
import { pngMeta, recipeText, svgMeta } from '@/io/recipe';
import { newId } from '@/model/ids';

import { getSession } from '../state/session';
import { store } from '../state/store';
import { ExportDialog } from './ExportDialog';
import { elementLabel, offsetOf, withOffset } from './formatting';
import { GraphSettings } from './GraphSettings';
import { engineNotice } from './engineNotice';
import { Inspector } from './Inspector';
import { useComplete, useFigure } from './useFigure';
import { Section } from '../notebook/Section';

interface Props {
  readonly project: Project;
  readonly graph: Graph;
  /** Its place on the experiment's page. */
  readonly number: number;
  readonly note?: ReactNode;
}

/** Screen pixels per millimetre at 100% (CSS px are 1/96 in). */
const PX_PER_MM = 96 / 25.4;

export function GraphSection({ project, graph: saved, number, note }: Props) {
  const bridge = getResults();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
  const [picked, setSelected] = useState<ElementId | null>(null);
  // A bracket being dragged is drawn where it would go; the edit comes on release.
  const [preview, setPreview] = useState<{ key: string; offset: number } | null>(null);
  const drag = useRef<{ key: string; startY: number; base: number; moved: boolean } | null>(null);
  const figure = useRef<HTMLDivElement>(null);
  // One object per preview, so what is drawn from it is kept (item 10).
  const graph = useMemo(
    () => (preview ? withOffset(saved, preview.key, preview.offset) : saved),
    [saved, preview],
  );
  const input = graphInput(project, graph, (id) => bridge.recompute.result(id));
  const summaryStatus = bridge.recompute.status(summaryId(graph.id));
  const engine = bridge.engineState();
  const [exporting, setExporting] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const lastRecipe = useRef<string | null>(null);
  const history = project.exports.filter((x) => x.graph === graph.id).reverse();

  const calculating =
    input.ok &&
    !input.summaryReady &&
    summaryStatus.state !== 'blocked' &&
    summaryStatus.state !== 'error';
  const layoutInput = useComplete(input, calculating) ?? (input.ok ? input.input : null);
  const view = useFigure(saved.id, layoutInput);
  const drawn = view.drawn;
  const elements = drawn?.elements ?? [];
  const notice = engineNotice(getSession().baseline, project, saved, bridge.info, (id) =>
    bridge.recompute.result(id),
  );
  // A selection whose element went away (a bracket hidden, the title turned off) lapses.
  const selected = picked !== null && elements.includes(picked) ? picked : null;
  const scaleOf = () => {
    const w = figure.current?.getBoundingClientRect().width ?? 0;
    return drawn && w > 0 ? drawn.width / w : 1;
  };
  const toScene = (cx: number, cy: number) => {
    const r = figure.current?.getBoundingClientRect();
    if (!r || !drawn || r.width <= 0) return null;
    const k = drawn.width / r.width;
    return { x: (cx - r.left) * k, y: (cy - r.top) * k };
  };
  const pickAt = (cx: number, cy: number) => {
    const at = toScene(cx, cy);
    return at && drawn ? pickIn(drawn.regions, at.x, at.y) : null;
  };
  const notes = [
    `${describePlot(graph.plot)}.`,
    ...(input.ok && input.input.brackets.length > 0 && graph.format.bracketLabels === 'stars'
      ? [`Asterisks: ${schemeText(graph.format.starScheme ?? 'prism')}.`]
      : []),
    ...(drawn?.notes ?? []),
  ];

  // A problem stays until fixed, so it gets a banner; work in progress is
  // shown over the figure, where coming and going moves nothing (item 11).
  let status: string | null = null;
  let working: string | null = null;
  if (!input.ok) status = input.reason;
  else if (!input.summaryReady) {
    if (summaryStatus.state === 'blocked' || summaryStatus.state === 'error')
      status = summaryStatus.message ?? null;
    else if (engine.kind === 'starting')
      working = 'Starting the statistics engine for the error bars (the first time only)…';
    else working = 'Calculating the means and error bars…';
  }
  const busy = view.busy || working !== null;

  const panel = formatting || selected !== null;

  return (
    <Section
      id={saved.id}
      number={number}
      title={saved.title}
      className="graph-section"
      onRename={(title) => {
        store.edit({ op: 'setGraph', graph: { ...saved, title } });
      }}
      menu={[
        {
          label: 'Delete',
          onSelect: () => {
            if (store.edit({ op: 'removeGraph', graph: saved.id })) {
              store.notify(`Deleted “${saved.title}”. Undo brings it back (Ctrl+Z).`);
            }
          },
        },
      ]}
      chip={
        <span className="chip">
          <Icon name={graph.plot.kind === 'bars' ? 'bar-error' : 'dot-plot'} size={16} />
          Graph
        </span>
      }
      actions={
        <>
          <button
            type="button"
            aria-pressed={panel}
            onClick={() => {
              if (panel) {
                setFormatting(false);
                setSelected(null);
              } else setFormatting(true);
            }}
          >
            <Icon name="format" size={16} /> Format
          </button>
          <button
            type="button"
            className="primary"
            disabled={!layoutInput}
            onClick={() => {
              setExporting(true);
            }}
          >
            <Icon name="export" size={16} /> Export…
          </button>
        </>
      }
      note={note}
    >
      <div className={panel ? 'graph-body' : 'graph-body no-panel'}>
        {panel && (
          <div className="graph-side">
            <label className="field inspector-pick">
              <span>Format</span>
              <select
                value={selected ?? ''}
                onChange={(e) => {
                  setSelected(e.currentTarget.value || null);
                }}
              >
                <option value="">The whole graph</option>
                {elements.map((el) => (
                  <option key={el} value={el}>
                    {elementLabel(el, project, graph)}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <Inspector
                project={project}
                graph={graph}
                element={selected}
                onDone={() => {
                  setSelected(null);
                }}
              />
            ) : (
              <GraphSettings project={project} graph={graph} />
            )}
          </div>
        )}
        <figure className="graph-figure">
          {status && (
            <p className="status-banner" role="status">
              {status}
            </p>
          )}
          {notice && (
            <div className={`engine-notice ${notice.kind}`} role="status">
              <p>{notice.text}</p>
              {notice.kind === 'changed' && (
                <ul>
                  {notice.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {view.error && (
            <p className="status-banner error" role="alert">
              {view.error}
            </p>
          )}
          {layoutInput && (
            <div
              className={busy ? 'graph-canvas busy' : 'graph-canvas'}
              aria-busy={busy}
              style={{ width: `${String(graph.size.width * PX_PER_MM * 1.5)}px` }}
              tabIndex={0}
              aria-label="Graph: click a part of it to format it"
              onPointerDown={(e) => {
                const el = pickAt(e.clientX, e.clientY);
                setSelected(el);
                if (el?.startsWith('bracket:')) {
                  const key = el.slice('bracket:'.length);
                  drag.current = {
                    key,
                    startY: e.clientY,
                    base: offsetOf(graph, key),
                    moved: false,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) {
                  const k = scaleOf();
                  const dy = (d.startY - e.clientY) * k;
                  if (Math.abs(dy) >= 0.5) d.moved = true;
                  if (d.moved) setPreview({ key: d.key, offset: Math.max(0, d.base + dy) });
                  return;
                }
                const el = pickAt(e.clientX, e.clientY);
                e.currentTarget.style.cursor = el
                  ? el.startsWith('bracket:')
                    ? 'ns-resize'
                    : 'pointer'
                  : '';
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                if (d?.moved && preview) {
                  store.edit({ op: 'setGraph', graph: withOffset(graph, d.key, preview.offset) });
                }
                setPreview(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSelected(null);
                if (
                  selected?.startsWith('bracket:') &&
                  (e.key === 'ArrowUp' || e.key === 'ArrowDown')
                ) {
                  e.preventDefault();
                  const key = selected.slice('bracket:'.length);
                  const step = (e.shiftKey ? 5 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
                  store.edit({
                    op: 'setGraph',
                    graph: withOffset(graph, key, offsetOf(graph, key) + step),
                  });
                }
              }}
            >
              {drawn?.picture.kind === 'svg' ? (
                <div
                  ref={figure}
                  role="img"
                  aria-label={`${graph.title}: ${describePlot(graph.plot)}`}
                  // The same SVG an export writes (note 05).
                  dangerouslySetInnerHTML={{ __html: drawn.picture.svg }}
                />
              ) : (
                <div
                  ref={figure}
                  role="img"
                  aria-label={`${graph.title}: ${describePlot(graph.plot)}`}
                  className="graph-picture"
                  // The graph's proportions until its picture comes (item 11).
                  style={
                    drawn
                      ? undefined
                      : {
                          aspectRatio: `${String(graph.size.width)} / ${String(graph.size.height)}`,
                        }
                  }
                >
                  {/* The scene painted by the worker (item 11); exports are its SVG. */}
                  {drawn?.picture.kind === 'png' && (
                    <img
                      src={drawn.picture.url}
                      // Its proportions before it has loaded, so nothing moves when it does.
                      width={drawn.width}
                      height={drawn.height}
                      alt=""
                      draggable={false}
                    />
                  )}
                </div>
              )}
              {selected && drawn && (
                <svg
                  className="graph-overlay"
                  viewBox={`0 0 ${String(drawn.width)} ${String(drawn.height)}`}
                  aria-hidden="true"
                >
                  <path d={outlinePath(drawn.outlines.get(selected) ?? new Float32Array(), 1.5)} />
                </svg>
              )}
              {busy && (
                <div className={drawn ? 'graph-busy' : 'graph-busy first'} role="status">
                  <span className="busy-note">
                    <span className="spinner" aria-hidden="true" />
                    <span>{working ?? (drawn ? 'Redrawing…' : 'Drawing the graph…')}</span>
                  </span>
                </div>
              )}
            </div>
          )}
          <figcaption className="legend">{notes.join(' ')}</figcaption>
          {history.length > 0 && (
            <section className="exports" aria-labelledby="exports-title">
              <h2 id="exports-title">Exported</h2>
              <ul>
                {history.map((x) => (
                  <li key={x.id}>
                    <span className="export-file">{x.fileName}</span>
                    <span className="export-detail">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(x.exportedAt))}
                      , {x.size.width} × {x.size.height} mm{x.dpi ? `, ${String(x.dpi)} DPI` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void getSession().openRecipe(x.recipe);
                      }}
                    >
                      Restore this figure
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </figure>
      </div>
      {exporting && layoutInput && (
        <ExportDialog
          graph={graph}
          scene={() => getRenderer().scene(layoutInput)}
          onClose={() => {
            setExporting(false);
          }}
          meta={async (format, _dpi, withData, drawn) => {
            const recipe = recipeText(
              project,
              graph,
              bridge.current(),
              bridge.info,
              __APP_VERSION__,
              drawn.resolvedXAngle,
            );
            lastRecipe.current = recipe;
            const origin = {
              app: __APP_VERSION__,
              engine: bridge.info,
              title: graph.title,
              withData,
            };
            return format === 'svg'
              ? await svgMeta(origin, withData ? recipe : null)
              : { pngChunks: await pngMeta(origin, withData ? recipe : null) };
          }}
          onExported={(format, dpi, fileName) => {
            const recipe = lastRecipe.current;
            if (!recipe) return;
            // The project remembers every export's recipe (#43), whatever the file carries.
            store.edit({
              op: 'addExport',
              record: {
                id: newId('x'),
                graph: graph.id,
                exportedAt: new Date().toISOString(),
                fileName,
                format,
                dpi: format === 'png' ? dpi : null,
                size: graph.size,
                recipe: JSON.parse(recipe) as Json,
              },
            });
          }}
        />
      )}
    </Section>
  );
}
