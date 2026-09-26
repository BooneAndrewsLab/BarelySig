import { useEffect, useMemo, useState } from 'react';

import { SEPARATORS, type Separator } from '@/io/import/delimited';
import {
  type Guess,
  type ImportChoice,
  type ImportResult,
  LAYOUTS,
  buildTable,
  guessLayout,
  markKey,
} from '@/io/import/guess';
import { DataFileError, type ReadDataFile, readDataFile } from '@/io/import/read';
import type { SourceBook } from '@/io/import/sheets';
import type { Table } from '@/model/table';

import { subcolumnLabels } from '../grid/layout';
import { type DecimalSeparator, browserDecimalSeparator, formatCell } from '../grid/numbers';
import { Dialog } from './Dialog';
import { LAYOUT_INFO, describeImport, madeLine, stem } from './openData';

interface Props {
  readonly file: File;
  readonly onCreate: (table: Table, result: ImportResult) => void;
  readonly onClose: () => void;
  /** Replaced in tests (jsdom has no workers). */
  readonly read?: ReadDataFile;
  readonly decimal?: DecimalSeparator;
}

const SEPARATOR_NAMES: Readonly<Record<Separator, string>> = {
  '\t': 'Tab',
  ',': 'Comma',
  ';': 'Semicolon',
  '|': 'Vertical bar',
};

const PREVIEW_ROWS = 12;

type Status =
  | { readonly kind: 'reading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly book: SourceBook };

/**
 * Open data file (item 10): shows how the file will be read, with the
 * layout guessed and a preview of the table, and creates nothing until
 * Create.
 */
export function OpenDataDialog({
  file,
  onCreate,
  onClose,
  read = readDataFile,
  decimal: fallback = browserDecimalSeparator(),
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'reading' });
  const [separator, setSeparator] = useState<Separator | undefined>(undefined);
  const [sheetIndex, setSheetIndex] = useState(0);
  /** Rows skipped and decimal mark the user set: the guess is made again with them. */
  const [given, setGiven] = useState<Partial<Pick<ImportChoice, 'skip' | 'decimal'>>>({});
  /** The user's other changes, on top of the guess. */
  const [edits, setEdits] = useState<Partial<ImportChoice>>({});
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    read(file, separator).then(
      (book) => {
        if (live) setStatus({ kind: 'ready', book });
      },
      (e: unknown) => {
        if (!live) return;
        setStatus({
          kind: 'error',
          message: e instanceof DataFileError ? e.message : 'it couldn’t be read.',
        });
      },
    );
    return () => {
      live = false;
    };
  }, [file, read, separator]);

  const book = status.kind === 'ready' ? status.book : null;
  const sheet = book?.sheets[sheetIndex] ?? null;
  const guess = useMemo(
    () => (sheet ? guessLayout(sheet, fallback, given) : null),
    [sheet, fallback, given],
  );
  const choice = useMemo(
    (): ImportChoice | null =>
      guess
        ? {
            ...guess.choice,
            ...edits,
            // A layout picked before the guess changed stays only while it still fits.
            layout:
              edits.layout && guess.possible.includes(edits.layout)
                ? edits.layout
                : guess.choice.layout,
          }
        : null,
    [guess, edits],
  );

  const defaultTitle =
    book?.kind === 'workbook' && book.sheets.length > 1 && sheet ? sheet.name : stem(file.name);
  const name = (title ?? defaultTitle).trim() || defaultTitle;

  const result = useMemo(
    () => (sheet && choice ? buildTable(sheet, choice, name) : null),
    [sheet, choice, name],
  );

  /** A new sheet or separator starts from a fresh guess. */
  const restart = () => {
    setGiven({});
    setEdits({});
    setTitle(null);
  };

  const change = (c: Partial<ImportChoice>) => {
    setEdits({ ...edits, ...c });
  };

  if (status.kind !== 'ready' || !sheet || !choice || !guess) {
    return (
      <Dialog title="Open data file" onClose={onClose}>
        <p className="import-status" role="status">
          {status.kind === 'error'
            ? `“${file.name}”: ${status.message}`
            : `Reading “${file.name}”…`}
        </p>
        <div className="actions">
          <button type="button" onClick={onClose}>
            {status.kind === 'error' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </Dialog>
    );
  }

  const bestGuess = guess.possible[0];
  const twoFactor = result?.table.type === 'grouped';
  const words = result ? describeImport(result.notes) : null;

  return (
    <Dialog title="Open data file" onClose={onClose} wide>
      <form
        className="import"
        onSubmit={(e) => {
          e.preventDefault();
          if (result) onCreate(result.table, result);
        }}
      >
        <div className="import-controls">
          <p className="import-file">
            “{file.name}”
            {book && book.sheets.length > 1 && (
              <label className="field">
                Sheet
                <select
                  value={sheetIndex}
                  onChange={(e) => {
                    setSheetIndex(Number(e.currentTarget.value));
                    restart();
                  }}
                >
                  {book.sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </p>

          <fieldset>
            <legend>How is it laid out?</legend>
            {LAYOUTS.map((l) => {
              const possible = guess.possible.includes(l);
              return (
                <label key={l} className={possible ? 'layout-option' : 'layout-option unfit'}>
                  <input
                    type="radio"
                    name="layout"
                    value={l}
                    checked={choice.layout === l}
                    disabled={!possible}
                    onChange={() => {
                      change({ layout: l });
                    }}
                  />
                  <span className="layout-name">
                    {LAYOUT_INFO[l].name}
                    {l === bestGuess && <span className="best-guess">best guess</span>}
                  </span>
                  <span className="layout-blurb">
                    {possible ? LAYOUT_INFO[l].blurb : 'Doesn’t fit this sheet.'}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {choice.layout === 'long' && (
            <fieldset className="import-columns">
              <legend>Which columns</legend>
              <ColumnPick
                label="Groups"
                value={choice.groupColumn}
                guess={guess}
                onChange={(v) => {
                  if (v !== null) change({ groupColumn: v });
                }}
              />
              <ColumnPick
                label="Second factor"
                value={choice.factorColumn}
                guess={guess}
                none="None"
                onChange={(v) => {
                  change({ factorColumn: v });
                }}
              />
              <ColumnPick
                label="Values"
                value={choice.valueColumn}
                guess={guess}
                onChange={(v) => {
                  if (v !== null) change({ valueColumn: v });
                }}
              />
            </fieldset>
          )}

          <fieldset className="import-options">
            <legend>Reading</legend>
            {(choice.layout === 'columns' || choice.layout === 'grouped') && (
              <label className="option">
                <input
                  type="checkbox"
                  checked={choice.header}
                  onChange={(e) => {
                    change({ header: e.currentTarget.checked });
                  }}
                />
                The first row holds titles
              </label>
            )}
            {(twoFactor || choice.swap) && choice.layout !== 'columns' && (
              <label className="option">
                <input
                  type="checkbox"
                  checked={choice.swap}
                  onChange={(e) => {
                    change({ swap: e.currentTarget.checked });
                  }}
                />
                Swap rows and groups
              </label>
            )}
            <label className="field">
              Skip rows at the top
              <input
                type="number"
                min={0}
                max={Math.max(0, sheet.cells.length - 1)}
                value={choice.skip}
                onChange={(e) => {
                  const v = e.currentTarget.valueAsNumber;
                  if (Number.isInteger(v) && v >= 0) {
                    setGiven({ ...given, skip: Math.min(v, sheet.cells.length) });
                  }
                }}
              />
            </label>
            {book?.kind === 'text' && (
              <label className="field">
                Separated by
                <select
                  value={book.separator ?? '\t'}
                  onChange={(e) => {
                    setSeparator(e.currentTarget.value as Separator);
                    restart();
                  }}
                >
                  {SEPARATORS.map((s) => (
                    <option key={s} value={s}>
                      {SEPARATOR_NAMES[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Decimal mark
              <select
                value={choice.decimal}
                onChange={(e) => {
                  setGiven({ ...given, decimal: e.currentTarget.value as DecimalSeparator });
                }}
              >
                <option value=".">Point (1.5)</option>
                <option value=",">Comma (1,5)</option>
              </select>
            </label>
          </fieldset>

          <label className="field">
            Title
            <input
              value={title ?? defaultTitle}
              onChange={(e) => {
                setTitle(e.currentTarget.value);
              }}
            />
          </label>
        </div>

        <div className="import-preview">
          {result ? (
            <>
              <p className="import-made">{madeLine(result.table)}</p>
              <Preview result={result} decimal={choice.decimal} />
              {words && (
                <ul className={words.warning ? 'import-notes warn' : 'import-notes'}>
                  {words.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="import-empty">
              {guess.possible.length === 0
                ? 'No numbers found in this sheet. Check the rows skipped, the separator and the decimal mark.'
                : 'This layout doesn’t make a table from the sheet. Pick another, or check the columns.'}
            </p>
          )}
        </div>

        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!result}>
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ColumnPick({
  label,
  value,
  guess,
  none,
  onChange,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly guess: Guess;
  readonly none?: string;
  readonly onChange: (v: number | null) => void;
}) {
  return (
    <label className="field">
      {label}
      <select
        value={value === null ? '' : String(value)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          onChange(v === '' ? null : Number(v));
        }}
      >
        {none !== undefined && <option value="">{none}</option>}
        {guess.columns.map((c) => (
          <option key={c.index} value={c.index}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The first rows of the table as it will be made; cells that aren't numbers struck through. */
function Preview({
  result,
  decimal,
}: {
  readonly result: ImportResult;
  readonly decimal: DecimalSeparator;
}) {
  const { table, marks } = result;
  const labels = subcolumnLabels(table);
  const sub = labels.length > 1;
  const rows = table.rows.slice(0, PREVIEW_ROWS);
  const grouped = table.type === 'grouped';
  return (
    <div className="import-scroll">
      <table className="import-table" aria-label="Preview">
        <thead>
          <tr>
            {grouped && <th rowSpan={sub ? 2 : 1} aria-label="Row titles" />}
            {table.dataSets.map((d) => (
              <th key={d.id} colSpan={labels.length} scope="colgroup">
                {d.title}
              </th>
            ))}
          </tr>
          {sub && (
            <tr>
              {table.dataSets.map((d) =>
                labels.map((l, k) => (
                  <th key={`${d.id}:${String(k)}`} className="sub" scope="col">
                    {l}
                  </th>
                )),
              )}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              {grouped && <th scope="row">{r.title ?? ''}</th>}
              {table.dataSets.map((d, g) =>
                d.subcolumns.map((col, k) => {
                  const mark = marks.get(markKey(g, k, i));
                  const v = col[i] ?? null;
                  return mark !== undefined ? (
                    <td
                      key={`${d.id}:${String(k)}`}
                      className="not-number"
                      title="Not a number: left empty"
                    >
                      <s>{mark}</s>
                    </td>
                  ) : (
                    <td key={`${d.id}:${String(k)}`}>{v === null ? '' : formatCell(v, decimal)}</td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > rows.length && (
        <p className="import-more">
          and {String(table.rows.length - rows.length)} more{' '}
          {table.rows.length - rows.length === 1 ? 'row' : 'rows'}
        </p>
      )}
    </div>
  );
}
