/**
 * The formatting inspector (note 07): the controls for one element of a
 * graph, picked by clicking it or from the list. Every change is one
 * `setGraph` edit (colours: a `setDataSet` edit on the table, since a
 * data set's colour is shared by every graph of it).
 */
import { type ReactNode, useState } from 'react';

import { graphTable } from '@/graphs/data';
import type { ElementId } from '@/graphs/hit';
import { COLORBLIND, paletteColor } from '@/graphs/palette';
import { graphTheme } from '@/graphs/themes';
import {
  type ErrorBar,
  type Graph,
  type PointSymbol,
  type Project,
  type StyleNumber,
  hasErrorBars,
} from '@/model/project';

import { store } from '../state/store';
import {
  elementLabel,
  isFormatted,
  offsetOf,
  resetElement,
  withFormat,
  withOffset,
  withStyleValue,
  withSymbol,
} from './formatting';

interface NumberFieldProps {
  readonly label: string;
  readonly value: number | undefined;
  /** Shown when there is no value: the automatic or theme value. */
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly onChange: (v: number | undefined) => void;
}

/** A number typed and committed on Enter or leaving the field; empty means automatic. */
export function NumberField({
  label,
  value,
  placeholder,
  min,
  max,
  unit,
  onChange,
}: NumberFieldProps) {
  const shown = value === undefined ? '' : String(value);
  // What is being typed, for the value it started from: a new value from elsewhere (undo) replaces it.
  const [typing, setTyping] = useState<{ readonly from: string; readonly text: string } | null>(
    null,
  );
  const draft = typing?.from === shown ? typing.text : shown;
  const setDraft = (text: string) => {
    setTyping({ from: shown, text });
  };
  const commit = () => {
    const t = draft.trim().replace(',', '.').replace('−', '-');
    if (t === '') {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const v = Number(t);
    if (!Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max)) {
      setDraft(shown);
      return;
    }
    if (v !== value) onChange(v);
  };
  return (
    <label className="field inspector-field">
      <span>{label}</span>
      <span className="with-unit">
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(shown);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

const ERRORS: readonly (readonly [ErrorBar, string])[] = [
  ['sd', 'SD (spread of the values)'],
  ['sem', 'SEM (precision of the mean)'],
  ['ci95', '95% CI of the mean'],
  ['range', 'Range (min to max)'],
  ['none', 'None'],
];

const SYMBOLS: readonly (readonly [PointSymbol, string])[] = [
  ['circle', 'Circle'],
  ['square', 'Square'],
  ['triangle', 'Triangle'],
  ['diamond', 'Diamond'],
];

interface Props {
  readonly project: Project;
  readonly graph: Graph;
  readonly element: ElementId;
  readonly onDone: () => void;
}

const pct = (v: number) => Math.round(v * 100);

export function Inspector({ project, graph, element, onDone }: Props) {
  const theme = graphTheme(graph.theme, graph.format.style);
  const { plot } = graph;
  const set = (g: Graph) => {
    store.edit({ op: 'setGraph', graph: g });
  };
  const style = (key: StyleNumber, label: string, value: number, unit = 'pt', max = 48) => (
    <NumberField
      label={label}
      unit={unit}
      min={0}
      max={max}
      value={graph.format.style?.[key]}
      placeholder={String(value)}
      onChange={(v) => {
        set(withStyleValue(graph, key, v));
      }}
    />
  );
  const percent = (key: StyleNumber, label: string, value: number, max = 100) => (
    <NumberField
      label={label}
      unit="%"
      min={0}
      max={max}
      value={graph.format.style?.[key] === undefined ? undefined : pct(graph.format.style[key])}
      placeholder={String(pct(value))}
      onChange={(v) => {
        set(withStyleValue(graph, key, v === undefined ? undefined : v / 100));
      }}
    />
  );

  const kind = element.split(':')[0] ?? element;
  const ref = element.slice(kind.length + 1);
  let body: ReactNode = null;
  switch (kind) {
    case 'y-axis': {
      const log = graph.format.yScale === 'log10';
      body = (
        <>
          <fieldset>
            <legend>Range</legend>
            <NumberField
              label="Minimum"
              value={graph.format.yMin}
              placeholder="Auto"
              onChange={(v) => {
                set(withFormat(graph, { yMin: v }));
              }}
            />
            <NumberField
              label="Maximum"
              value={graph.format.yMax}
              placeholder="Auto"
              onChange={(v) => {
                set(withFormat(graph, { yMax: v }));
              }}
            />
            <label className="option">
              <input
                type="checkbox"
                checked={log}
                onChange={(e) => {
                  set(
                    withFormat(graph, {
                      yScale: e.currentTarget.checked ? 'log10' : undefined,
                      yStep: undefined,
                    }),
                  );
                }}
              />
              Logarithmic scale (powers of 10)
            </label>
          </fieldset>
          <fieldset>
            <legend>Ticks</legend>
            {!log && (
              <NumberField
                label="Interval"
                value={graph.format.yStep}
                placeholder="Auto"
                min={0}
                onChange={(v) => {
                  set(withFormat(graph, { yStep: v === 0 ? undefined : v }));
                }}
              />
            )}
            {!log && (
              <NumberField
                label="Decimals"
                value={graph.format.yDecimals}
                placeholder="Auto"
                min={0}
                max={10}
                onChange={(v) => {
                  set(withFormat(graph, { yDecimals: v === undefined ? v : Math.round(v) }));
                }}
              />
            )}
            <label className="field inspector-field">
              <span>Direction</span>
              <select
                value={theme.ticks}
                onChange={(e) => {
                  set(withStyleValue(graph, 'ticks', e.currentTarget.value as 'in' | 'out'));
                }}
              >
                <option value="out">Outward</option>
                <option value="in">Inward</option>
              </select>
            </label>
            {style('lines.tickLength', 'Length', theme.lines.tickLength)}
            {style('font.tick', 'Label size (both axes)', theme.font.tick)}
          </fieldset>
          <fieldset>
            <legend>Lines</legend>
            <label className="field inspector-field">
              <span>Frame</span>
              <select
                value={theme.spines}
                onChange={(e) => {
                  set(
                    withStyleValue(graph, 'spines', e.currentTarget.value as 'left-bottom' | 'box'),
                  );
                }}
              >
                <option value="left-bottom">Left and bottom axes</option>
                <option value="box">Box around the plot</option>
              </select>
            </label>
            {style('lines.axis', 'Axis width (both axes)', theme.lines.axis)}
            {style('lines.tick', 'Tick width', theme.lines.tick)}
          </fieldset>
        </>
      );
      break;
    }
    case 'y-title':
      body = (
        <fieldset>
          <legend>Text</legend>
          <label className="field inspector-field wide">
            <span>Title</span>
            <input
              type="text"
              value={graph.format.yTitle ?? ''}
              placeholder="From the table’s value title and unit"
              onChange={(e) => {
                const v = e.currentTarget.value;
                set(withFormat(graph, { yTitle: v === '' ? undefined : v }));
              }}
            />
          </label>
          {style('font.axisTitle', 'Size', theme.font.axisTitle)}
        </fieldset>
      );
      break;
    case 'x-axis':
      body = (
        <fieldset>
          <legend>Group labels</legend>
          <label className="field inspector-field">
            <span>Angle</span>
            <select
              value={String(graph.format.xAngle ?? 0)}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                set(withFormat(graph, { xAngle: v === 45 || v === 90 ? v : undefined }));
              }}
            >
              <option value="0">Automatic (level, wrapped or turned to fit)</option>
              <option value="45">Turned 45°</option>
              <option value="90">Vertical</option>
            </select>
          </label>
          {style('font.tick', 'Label size (both axes)', theme.font.tick)}
          {style('lines.axis', 'Axis width (both axes)', theme.lines.axis)}
        </fieldset>
      );
      break;
    case 'title':
      body = (
        <fieldset>
          <legend>Title</legend>
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
          <label className="field inspector-field wide">
            <span>Name</span>
            <input
              type="text"
              value={graph.title}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v.trim()) set({ ...graph, title: v });
              }}
            />
          </label>
          {style('font.title', 'Size', theme.font.title)}
        </fieldset>
      );
      break;
    case 'error-bars':
      body = (
        <fieldset>
          <legend>Error bars</legend>
          {hasErrorBars(plot) && (
            <label className="field inspector-field wide">
              <span>Show</span>
              <select
                value={plot.error}
                onChange={(e) => {
                  set({
                    ...graph,
                    plot: { ...plot, error: e.currentTarget.value as ErrorBar },
                  });
                }}
              >
                {ERRORS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {style('lines.error', 'Line width', theme.lines.error)}
          {percent('capWidth', 'Cap width (of the bar)', theme.capWidth, 200)}
        </fieldset>
      );
      break;
    case 'series': {
      const table = graphTable(project, graph);
      const index = table ? table.dataSets.findIndex((d) => d.id === ref) : -1;
      const ds = table?.dataSets[index];
      const current = ds?.color ?? paletteColor(Math.max(0, index));
      body = (
        <>
          {table && ds && plot.kind === 'dots' && plot.colorByReplicate && (
            <fieldset>
              <legend>This data set</legend>
              <p className="hint flush">
                In a SuperPlot, colours and shapes mark the biological replicate, the same in every
                group. Turn “Colour points by biological replicate” off in Plot for a colour and
                symbol per data set.
              </p>
            </fieldset>
          )}
          {table && ds && !(plot.kind === 'dots' && plot.colorByReplicate) && (
            <fieldset>
              <legend>This data set</legend>
              <div className="swatches" role="radiogroup" aria-label="Colour">
                {[...COLORBLIND, '#201e1d', '#6f6a67', '#b0aba8'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={current.toLowerCase() === c}
                    aria-label={c}
                    className="swatch"
                    style={{ background: c }}
                    onClick={() => {
                      store.edit({
                        op: 'setDataSet',
                        table: table.id,
                        dataSet: ds.id,
                        color: c === paletteColor(index) ? null : c,
                      });
                    }}
                  />
                ))}
              </div>
              <p className="hint flush">
                The colour is the data set’s, in every graph of this table.
              </p>
              <label className="field inspector-field">
                <span>Symbol</span>
                <select
                  value={graph.format.symbols?.[ref] ?? 'circle'}
                  onChange={(e) => {
                    set(withSymbol(graph, ref, e.currentTarget.value as PointSymbol));
                  }}
                >
                  {SYMBOLS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          )}
          <fieldset>
            <legend>All data sets</legend>
            {plot.kind !== 'dots' && (
              <>
                {percent(
                  'barWidth',
                  plot.kind === 'bars' ? 'Bar width' : 'Box width',
                  theme.barWidth,
                )}
                {percent('barLighten', 'Fill lightness', theme.barLighten)}
                {style('lines.barEdge', 'Bar edge width', theme.lines.barEdge)}
              </>
            )}
            {style('pointSize', 'Point size', theme.pointSize)}
            {percent('pointOpacity', 'Point opacity', theme.pointOpacity)}
            {style('lines.pointEdge', 'Point edge width', theme.lines.pointEdge)}
          </fieldset>
        </>
      );
      break;
    }
    case 'bracket': {
      const offset = offsetOf(graph, ref);
      const move = (d: number) => {
        set(withOffset(graph, ref, offset + d));
      };
      body = (
        <>
          <fieldset>
            <legend>Position</legend>
            <p className="hint flush">
              Drag the bracket up or down on the graph, or use these (arrow keys on the graph too).
              It can’t go below its automatic place just above the data.
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  move(1);
                }}
              >
                Up 1 pt
              </button>
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => {
                  move(-1);
                }}
              >
                Down 1 pt
              </button>
            </div>
            <p className="hint flush">
              {offset === 0 ? 'At its automatic place.' : `Raised ${String(offset)} pt.`}
            </p>
          </fieldset>
          <fieldset>
            <legend>Look (all brackets)</legend>
            {style('font.bracket', 'Label size', theme.font.bracket)}
            {style('lines.bracket', 'Line width', theme.lines.bracket)}
          </fieldset>
          <button
            type="button"
            onClick={() => {
              set(withFormat(graph, { hiddenBrackets: [...graph.format.hiddenBrackets, ref] }));
              onDone();
            }}
          >
            Hide this bracket
          </button>
        </>
      );
      break;
    }
    case 'legend':
      body = (
        <fieldset>
          <legend>Legend</legend>
          {style('font.legend', 'Text size', theme.font.legend)}
        </fieldset>
      );
      break;
  }

  return (
    <div className="inspector" aria-label={`Format ${elementLabel(element, project, graph)}`}>
      <div className="inspector-head">
        <h2>{elementLabel(element, project, graph)}</h2>
        <button type="button" onClick={onDone}>
          Done
        </button>
      </div>
      {body}
      <button
        type="button"
        className="reset"
        disabled={!isFormatted(graph, element)}
        onClick={() => {
          set(resetElement(graph, element));
        }}
      >
        Reset to the theme
      </button>
    </div>
  );
}
