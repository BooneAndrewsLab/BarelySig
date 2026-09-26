/**
 * A graph's own settings (notes 05, 07): what to plot, error bars,
 * brackets, theme and size. Shown in the inspector when no element of the
 * graph is selected.
 */
import { openGuide } from '../help/openGuide';
import { bracketChoices, graphTable, withBracket, withPair } from '@/graphs/data';
import {
  type ColumnPlot,
  type ErrorBar,
  type Graph,
  type GraphPlot,
  type Project,
  type Whiskers,
  hasErrorBars,
} from '@/model/project';

import { store } from '../state/store';
import { hasFormatting, resetAll, switchPlot, withFormat } from './formatting';

const ERRORS: readonly (readonly [ErrorBar, string])[] = [
  ['sd', 'SD'],
  ['sem', 'SEM'],
  ['ci95', '95% CI'],
  ['range', 'Range'],
  ['none', 'None'],
];

const PLOTS: readonly (readonly [ColumnPlot['kind'], string])[] = [
  ['bars', 'Bars'],
  ['dots', 'Dots (every value)'],
  ['box', 'Box and whiskers'],
  ['violin', 'Violin'],
];

const WHISKER_CHOICES: readonly (readonly [Whiskers, string])[] = [
  ['min-max', 'Min to max'],
  ['tukey', 'Tukey (1.5 × IQR)'],
  ['p10-90', '10th to 90th percentile'],
  ['p5-95', '5th to 95th percentile'],
  ['p2.5-97.5', '2.5th to 97.5th percentile'],
  ['p1-99', '1st to 99th percentile'],
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
  const setPlot = (next: GraphPlot) => {
    set({ plot: next });
  };
  const { plot } = graph;
  const nested = graphTable(project, graph)?.type === 'nested';
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
        {plot.kind === 'grouped-bars' && (
          <>
            {(
              [
                ['interleaved', 'Bars side by side in each row (interleaved)'],
                ['separated', 'Each data set’s bars together (separated)'],
              ] as const
            ).map(([arrangement, label]) => (
              <label key={arrangement} className="option">
                <input
                  type="radio"
                  name="arrangement"
                  checked={plot.arrangement === arrangement}
                  onChange={() => {
                    setPlot({ ...plot, arrangement });
                  }}
                />
                {label}
              </label>
            ))}
            <label className="option">
              <input
                type="checkbox"
                checked={plot.points}
                onChange={(e) => {
                  setPlot({ ...plot, points: e.currentTarget.checked });
                }}
              />
              Show the individual values
            </label>
            {plot.arrangement === 'interleaved' && (
              <label className="field inspector-field wide">
                <span>Legend</span>
                <select
                  value={graph.format.legend ?? 'right'}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    set(withFormat(graph, { legend: v === 'top' || v === 'none' ? v : undefined }));
                  }}
                >
                  <option value="right">At the right</option>
                  <option value="top">Above the graph</option>
                  <option value="none">None</option>
                </select>
              </label>
            )}
          </>
        )}
        {plot.kind !== 'grouped-bars' &&
          PLOTS.map(([kind, label]) => (
            <label key={kind} className="option">
              <input
                type="radio"
                name="plot"
                checked={plot.kind === kind}
                onChange={() => {
                  setPlot(switchPlot(plot, kind));
                }}
              />
              {label}
            </label>
          ))}
        {plot.kind === 'bars' && (
          <label className="option">
            <input
              type="checkbox"
              checked={plot.points}
              onChange={(e) => {
                setPlot({ ...plot, points: e.currentTarget.checked });
              }}
            />
            Show the individual values
          </label>
        )}
        {plot.kind === 'dots' && (
          <label className="field">
            Line at the{' '}
            <select
              value={plot.center}
              onChange={(e) => {
                setPlot({ ...plot, center: e.currentTarget.value as 'mean' | 'median' });
              }}
            >
              <option value="mean">mean</option>
              <option value="median">median</option>
            </select>
          </label>
        )}
        {plot.kind === 'dots' && nested && (
          <label className="option">
            <input
              type="checkbox"
              checked={plot.colorByReplicate ?? false}
              onChange={(e) => {
                setPlot({ ...plot, colorByReplicate: e.currentTarget.checked });
              }}
            />
            Colour points by biological replicate (SuperPlot)
          </label>
        )}
        {plot.kind === 'box' && (
          <>
            <label className="field inspector-field wide">
              <span>Whiskers</span>
              <select
                value={plot.whiskers}
                onChange={(e) => {
                  const whiskers = e.currentTarget.value as Whiskers;
                  setPlot({
                    ...plot,
                    whiskers,
                    // Min to max leaves nothing beyond the whiskers.
                    points:
                      whiskers === 'min-max' && plot.points === 'outliers' ? 'all' : plot.points,
                  });
                }}
              >
                {WHISKER_CHOICES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field inspector-field wide">
              <span>Points</span>
              <select
                value={plot.points}
                onChange={(e) => {
                  setPlot({
                    ...plot,
                    points: e.currentTarget.value as 'none' | 'outliers' | 'all',
                  });
                }}
              >
                <option value="all">Every value</option>
                {plot.whiskers !== 'min-max' && (
                  <option value="outliers">Values beyond the whiskers</option>
                )}
                <option value="none">None</option>
              </select>
            </label>
          </>
        )}
        {plot.kind === 'violin' && (
          <>
            <label className="field inspector-field wide">
              <span>Inside the violin</span>
              <select
                value={plot.inner}
                onChange={(e) => {
                  setPlot({
                    ...plot,
                    inner: e.currentTarget.value as 'quartiles' | 'box' | 'points' | 'none',
                  });
                }}
              >
                <option value="quartiles">Median and quartile lines</option>
                <option value="box">A thin box plot</option>
                <option value="points">Every value</option>
                <option value="none">Nothing</option>
              </select>
            </label>
            <label className="field inspector-field wide">
              <span>Smoothing</span>
              <select
                value={String(plot.smoothing)}
                onChange={(e) => {
                  setPlot({ ...plot, smoothing: Number(e.currentTarget.value) });
                }}
              >
                <option value="0.5">Less (½ × Silverman’s rule)</option>
                <option value="0.75">A little less (¾ ×)</option>
                <option value="1">Silverman’s rule of thumb</option>
                <option value="1.5">A little more (1½ ×)</option>
                <option value="2">More (2 ×)</option>
              </select>
            </label>
          </>
        )}
      </fieldset>
      {hasErrorBars(plot) && (
        <fieldset>
          <legend>
            Error bars{' '}
            <button
              type="button"
              className="link small"
              onClick={() => {
                openGuide('12-graphs#error-bars');
              }}
            >
              SD, SEM or CI?
            </button>
          </legend>
          <select
            aria-label="Error bars"
            value={plot.error}
            onChange={(e) => {
              setPlot({ ...plot, error: e.currentTarget.value as ErrorBar });
            }}
          >
            {ERRORS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </fieldset>
      )}
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
