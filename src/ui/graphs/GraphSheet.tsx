/**
 * A graph's sheet (note 05): the figure at its real proportions, the
 * settings a first graph needs (what to plot, error bars, theme, size),
 * and notes saying what the marks show. The figure is the same SVG an
 * export writes.
 */
import { useSyncExternalStore } from 'react';

import { bracketChoices, graphInput, summaryId, withBracket } from '@/graphs/data';
import { describePlot, layoutColumn } from '@/graphs/layout';
import { sceneToSvg } from '@/graphs/svg';
import type { ColumnPlot, ErrorBar, Graph, Project } from '@/model/project';

import { Icon } from '../Icon';
import { schemeText } from '../results/format';
import { getResults } from '../state/results';
import { store } from '../state/store';

interface Props {
  readonly project: Project;
  readonly graph: Graph;
}

const ERRORS: readonly (readonly [ErrorBar, string])[] = [
  ['sd', 'SD'],
  ['sem', 'SEM'],
  ['ci95', '95% CI'],
  ['range', 'Range'],
  ['none', 'None'],
];

/** Screen pixels per millimetre at 100% (CSS px are 1/96 in). */
const PX_PER_MM = 96 / 25.4;

export function GraphSheet({ project, graph }: Props) {
  const bridge = getResults();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
  const input = graphInput(project, graph, (id) => bridge.recompute.result(id));
  const table = graph.source.kind === 'table' ? project.tables.get(graph.source.table) : undefined;
  const summaryStatus = bridge.recompute.status(summaryId(graph.id));
  const engine = bridge.engineState();
  const choices = bracketChoices(project, graph);

  const set = (patch: Partial<Graph>) => {
    store.edit({ op: 'setGraph', graph: { ...graph, ...patch } });
  };
  const setPlot = (plot: ColumnPlot) => {
    set({ plot });
  };

  const scene = input.ok ? layoutColumn(input.input) : null;
  const svg = scene ? sceneToSvg(scene) : '';
  const notes = [
    `${describePlot(graph.plot)}.`,
    ...(input.ok && input.input.brackets.length > 0 && graph.format.bracketLabels === 'stars'
      ? [`Asterisks: ${schemeText(graph.format.starScheme ?? 'prism')}.`]
      : []),
    ...(scene?.notes ?? []),
  ];

  let status: string | null = null;
  if (!input.ok) status = input.reason;
  else if (!input.summaryReady) {
    if (summaryStatus.state === 'blocked' || summaryStatus.state === 'error')
      status = summaryStatus.message ?? null;
    else if (engine.kind === 'starting')
      status = 'Starting the statistics engine for the error bars (the first time only)…';
    else status = 'Calculating the means and error bars…';
  }

  return (
    <section className="sheet graph-sheet" aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">{graph.title}</h1>
        {table && (
          <button
            type="button"
            className="chip link-chip"
            onClick={() => {
              store.show({ kind: 'table', id: table.id });
            }}
          >
            <Icon name={graph.plot.kind === 'bars' ? 'bar-error' : 'dot-plot'} size={16} />
            Data: {table.title}
          </button>
        )}
      </header>
      <div className="graph-body">
        <form
          className="graph-controls"
          aria-label="Graph settings"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <fieldset>
            <legend>Plot</legend>
            <label className="option">
              <input
                type="radio"
                name="plot"
                checked={graph.plot.kind === 'bars'}
                onChange={() => {
                  setPlot({ kind: 'bars', error: graph.plot.error, points: true });
                }}
              />
              Bars
            </label>
            <label className="option">
              <input
                type="radio"
                name="plot"
                checked={graph.plot.kind === 'dots'}
                onChange={() => {
                  setPlot({ kind: 'dots', center: 'mean', error: graph.plot.error });
                }}
              />
              Dots (every value)
            </label>
            {graph.plot.kind === 'bars' ? (
              <label className="option">
                <input
                  type="checkbox"
                  checked={graph.plot.points}
                  onChange={(e) => {
                    setPlot({ ...graph.plot, kind: 'bars', points: e.currentTarget.checked });
                  }}
                />
                Show the individual values
              </label>
            ) : (
              <label className="field">
                Line at the{' '}
                <select
                  value={graph.plot.center}
                  onChange={(e) => {
                    setPlot({
                      kind: 'dots',
                      error: graph.plot.error,
                      center: e.currentTarget.value as 'mean' | 'median',
                    });
                  }}
                >
                  <option value="mean">mean</option>
                  <option value="median">median</option>
                </select>
              </label>
            )}
          </fieldset>
          <fieldset>
            <legend>Error bars</legend>
            <select
              aria-label="Error bars"
              value={graph.plot.error}
              onChange={(e) => {
                setPlot({ ...graph.plot, error: e.currentTarget.value as ErrorBar });
              }}
            >
              {ERRORS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>Significance</legend>
            {choices.length === 0 && (
              <p className="hint flush">Run a t test on this table to add its bracket.</p>
            )}
            {choices.map((c) => (
              <label key={c.id} className="option">
                <input
                  type="checkbox"
                  checked={c.shown}
                  onChange={(e) => {
                    store.edit({
                      op: 'setGraph',
                      graph: withBracket(graph, c.id, e.currentTarget.checked),
                    });
                  }}
                />
                {c.title}
              </label>
            ))}
            {choices.length > 0 && (
              <>
                <select
                  aria-label="Bracket labels"
                  value={
                    graph.format.bracketLabels === 'exact'
                      ? 'exact'
                      : (graph.format.starScheme ?? 'prism')
                  }
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    const { starScheme: _drop, ...rest } = graph.format;
                    set({
                      format:
                        v === 'exact'
                          ? { ...rest, bracketLabels: 'exact' }
                          : v === 'apa'
                            ? { ...rest, bracketLabels: 'stars', starScheme: 'apa' }
                            : { ...rest, bracketLabels: 'stars' },
                    });
                  }}
                >
                  <option value="prism">Asterisks (Prism: up to ****)</option>
                  <option value="apa">Asterisks (APA: up to ***)</option>
                  <option value="exact">Exact P values</option>
                </select>
                <label className="option">
                  <input
                    type="checkbox"
                    checked={graph.format.showNs}
                    onChange={(e) => {
                      set({ format: { ...graph.format, showNs: e.currentTarget.checked } });
                    }}
                  />
                  Show “ns” for differences that aren’t significant
                </label>
              </>
            )}
          </fieldset>
          <fieldset>
            <legend>Look</legend>
            <select
              aria-label="Theme"
              value={graph.theme.kind === 'named' ? graph.theme.name : 'fixed'}
              onChange={(e) => {
                set({
                  theme: { kind: 'named', name: e.currentTarget.value as 'modern' | 'classic' },
                });
              }}
            >
              <option value="modern">Modern</option>
              <option value="classic">Classic (Prism-like)</option>
              {graph.theme.kind === 'fixed' && <option value="fixed">As exported</option>}
            </select>
          </fieldset>
          <fieldset>
            <legend>Size (mm)</legend>
            <span className="size-fields">
              <input
                type="number"
                aria-label="Width in millimetres"
                min={20}
                max={500}
                value={graph.size.width}
                onChange={(e) => {
                  const w = e.currentTarget.valueAsNumber;
                  if (w >= 20 && w <= 500) set({ size: { ...graph.size, width: w } });
                }}
              />
              ×
              <input
                type="number"
                aria-label="Height in millimetres"
                min={20}
                max={500}
                value={graph.size.height}
                onChange={(e) => {
                  const h = e.currentTarget.valueAsNumber;
                  if (h >= 20 && h <= 500) set({ size: { ...graph.size, height: h } });
                }}
              />
            </span>
          </fieldset>
        </form>
        <figure className="graph-figure">
          {status && (
            <p className="status-banner" role="status">
              {status}
            </p>
          )}
          {scene && (
            <div
              className="graph-canvas"
              role="img"
              aria-label={`${graph.title}: ${describePlot(graph.plot)}`}
              style={{ width: `${String(graph.size.width * PX_PER_MM * 1.5)}px` }}
              // The same SVG an export writes (note 05).
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
          <figcaption className="legend">{notes.join(' ')}</figcaption>
        </figure>
      </div>
    </section>
  );
}
