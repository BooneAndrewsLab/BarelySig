/**
 * Exporting a graph (note 05): SVG for editing or PNG at 300 or 600 DPI,
 * at a size set in millimetres, with journal column widths as presets.
 * The size is the graph's own (changing it here is an undoable edit), so
 * what is exported is what the sheet shows.
 */
import { useState } from 'react';

import { type ExportMeta, PRESETS, exportPng, exportSvg } from '@/graphs/export';
import type { Scene } from '@/graphs/scene';
import { download, fileNameFor } from '@/io/files';
import type { Graph } from '@/model/project';

import { analytics } from '../analytics';
import { Dialog } from '../shell/Dialog';
import { store } from '../state/store';

interface Props {
  readonly graph: Graph;
  /** The figure's scene, laid out when an export starts (item 11). */
  readonly scene: () => Promise<Scene>;
  readonly onClose: () => void;
  /** What the file should carry besides the figure (origin, recipe; #43). */
  readonly meta?: (
    format: 'svg' | 'png',
    dpi: number,
    withData: boolean,
    drawn: Scene,
  ) => Promise<ExportMeta>;
  /** Called after a successful export. */
  readonly onExported?: (format: 'svg' | 'png', dpi: number, fileName: string) => void;
}

export function ExportDialog({ graph, scene, onClose, meta, onExported }: Props) {
  const [format, setFormat] = useState<'svg' | 'png'>('svg');
  const [dpi, setDpi] = useState(300);
  const [name, setName] = useState(graph.title);
  const [busy, setBusy] = useState(false);
  const [withData, setWithData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resize = (width: number) => {
    const height = Math.round(((graph.size.height * width) / graph.size.width) * 10) / 10;
    store.edit({ op: 'setGraph', graph: { ...graph, size: { width, height } } });
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const drawn = await scene();
      const m = meta ? await meta(format, dpi, withData, drawn) : {};
      const file = fileNameFor(name, format === 'svg' ? '.svg' : '.png', 'Figure');
      const ok =
        format === 'svg'
          ? await download(file, exportSvg(drawn, m), undefined, {
              description: 'SVG image',
              mime: 'image/svg+xml',
              extension: '.svg',
            })
          : await download(file, await exportPng(drawn, dpi, m), undefined, {
              description: 'PNG image',
              mime: 'image/png',
              extension: '.png',
            });
      if (ok) {
        analytics.trackOnce('graph', format === 'svg' ? 'export-svg' : 'export-png');
        onExported?.(format, dpi, file);
        store.notify(`Exported “${file}”.`);
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const px = {
    w: Math.round((graph.size.width / 25.4) * dpi),
    h: Math.round((graph.size.height / 25.4) * dpi),
  };

  return (
    <Dialog title="Export graph" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <fieldset>
          <legend>Format</legend>
          <label className="option">
            <input
              type="radio"
              name="format"
              checked={format === 'svg'}
              onChange={() => {
                setFormat('svg');
              }}
            />
            SVG: vector, for journals and for editing in Illustrator or Inkscape
          </label>
          <label className="option">
            <input
              type="radio"
              name="format"
              checked={format === 'png'}
              onChange={() => {
                setFormat('png');
              }}
            />
            PNG: an image, for slides and documents
          </label>
          {format === 'png' && (
            <label className="indent">
              Resolution{' '}
              <select
                value={dpi}
                onChange={(e) => {
                  setDpi(Number(e.currentTarget.value));
                }}
              >
                <option value={300}>300 DPI</option>
                <option value={600}>600 DPI (line art)</option>
              </select>{' '}
              <span className="hint-inline">
                {px.w} × {px.h} pixels
              </span>
            </label>
          )}
        </fieldset>
        <fieldset>
          <legend>Size at print</legend>
          <p className="hint flush">
            {graph.size.width} × {graph.size.height} mm. Text and lines keep their point sizes at
            any width.
          </p>
          <div className="preset-row">
            {PRESETS.map(([label, w]) => (
              <button
                key={w}
                type="button"
                aria-pressed={graph.size.width === w}
                onClick={() => {
                  resize(w);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Reopening later</legend>
          <label className="option">
            <input
              type="checkbox"
              checked={withData}
              onChange={(e) => {
                setWithData(e.currentTarget.checked);
              }}
            />
            Include the data so this figure can be reopened
          </label>
          <p className="hint">
            {withData
              ? 'The file then contains this graph’s data, analyses and settings, so opening it in BarelySig gets the exact figure back. Turn this off for unpublished data.'
              : 'The file will only say it was made with BarelySig; it can’t be reopened.'}
          </p>
        </fieldset>
        <label className="field">
          File name{' '}
          <input
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
            }}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
