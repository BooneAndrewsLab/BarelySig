/**
 * Clipboard capture page, development only (`npm run dev`, then open
 * `/?capture`). Paste a block copied from Excel, Sheets or LibreOffice:
 * the page shows every MIME type the clipboard offered and downloads it
 * as a fixture for `src/ui/grid/fixtures/` (note 03, "Captures").
 */
import { useState } from 'react';

interface Captured {
  readonly source: string;
  readonly recorded: true;
  readonly note: string;
  readonly clipboard: Record<string, string>;
}

export function Capture() {
  const [source, setSource] = useState('');
  const [captured, setCaptured] = useState<Captured | null>(null);
  const json = captured ? `${JSON.stringify({ ...captured, source }, null, 2)}\n` : '';
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${source.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'capture'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="capture">
      <h1>Clipboard capture</h1>
      <p>
        Name the source, copy a block of cells in it, click the box and paste (Ctrl+V). Every type
        the clipboard offers is kept, exactly as it came.
      </p>
      <label className="field">
        Source{' '}
        <input
          value={source}
          placeholder="Excel 365 (Windows, en-GB)"
          onChange={(e) => {
            setSource(e.currentTarget.value);
          }}
        />
      </label>
      <div
        className="capture-target"
        tabIndex={0}
        role="textbox"
        aria-label="Paste here"
        onPaste={(e) => {
          e.preventDefault();
          const clipboard: Record<string, string> = {};
          for (const type of e.clipboardData.types) clipboard[type] = e.clipboardData.getData(type);
          setCaptured({
            source,
            recorded: true,
            note: `Recorded ${new Date().toISOString().slice(0, 10)}.`,
            clipboard,
          });
        }}
      >
        Paste here
      </div>
      {captured && (
        <>
          <pre className="capture-json">{json}</pre>
          <button type="button" className="primary" onClick={download}>
            Download fixture
          </button>
        </>
      )}
    </main>
  );
}
