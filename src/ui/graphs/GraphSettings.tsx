/**
 * A graph's own settings (notes 05, 07): what to plot, error bars,
 * brackets, theme and size. Shown in the inspector when no element of the
 * graph is selected.
 */
import { bracketChoices, withBracket, withPair } from '@/graphs/data';
import type { ColumnPlot, ErrorBar, Graph, Project } from '@/model/project';

import { store } from '../state/store';
import { hasFormatting, resetAll, withFormat } from './formatting';

const ERRORS: readonly (readonly [ErrorBar, string])[] = [
  ['sd', 'SD'],
  ['sem', 'SEM'],
  ['ci95', '95% CI'],
  ['range', 'Range'],
  ['none', 'None'],
];

interface Props {
  readonly project: Project;
  readonly graph: Graph;
}

export function GraphSettings({ project, graph }: Props) {
  const choices = bracketChoices(project, graph);
  const set = (patch: Partial<Graph>) => {
    store.edit({ op: 'setGraph', graph: { ...graph, ...patch } });
  };
  const setPlot = (plot: ColumnPlot) => {
    set({ plot });
  };
  return (
    <form
      className="graph-controls"
      aria-label="Graph settings"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <p className="hint flush">Click any part of the graph to format it.</p>
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
          <p className="hint flush">
            Compare groups of this table (a t test, for example) to add brackets.
          </p>
        )}
        {choices.map((c) => (
          <div key={c.id}>
            <label className="option">
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
            {c.shown &&
              c.pairs.map((x) => (
                <label key={x.key} className="option nested">
                  <input
                    type="checkbox"
                    checked={x.shown}
                    onChange={(e) => {
                      store.edit({
                        op: 'setGraph',
                        graph: withPair(graph, x.key, e.currentTarget.checked),
                      });
                    }}
                  />
                  {x.label}
                </label>
              ))}
          </div>
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
                set(
                  withFormat(
                    graph,
                    v === 'exact'
                      ? { bracketLabels: 'exact', starScheme: undefined }
                      : v === 'apa'
                        ? { bracketLabels: 'stars', starScheme: 'apa' }
                        : { bracketLabels: 'stars', starScheme: undefined },
                  ),
                );
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
        <label className="option">
          <input
            type="checkbox"
            checked={graph.format.showTitle === true}
            onChange={(e) => {
              set(withFormat(graph, { showTitle: e.currentTarget.checked || undefined }));
            }}
          />
          Show the graph’s name above it
        </label>
        <button
          type="button"
          disabled={!hasFormatting(graph)}
          onClick={() => {
            set(resetAll(graph));
          }}
        >
          Reset all formatting
        </button>
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
  );
}
