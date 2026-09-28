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
import type { SourceBook, SourceCell, SourceSheet } from '@/io/import/sheets';
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
/** Sheet rows shown to pick the start from, at least; more when the start is further down. */
const START_ROWS = 30;
/** Sheet columns shown there: enough to recognise the rows. */
const START_COLUMNS = 12;
/** Skipped rows shown over the preview; more on request. */
const SKIPPED_SHOWN = 5;

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
  const twoFactor = result?.table.type === 'grouped' || result?.table.type === 'nested';
  const words = result ? describeImport(result.notes) : null;
  // Which factor is which: shown under the chosen layout it applies to,
  // not in the reading options, where it sat far from the choice it qualifies.
  const swapControl = (twoFactor || choice.swap) && choice.layout !== 'columns' && (
    <div className="layout-swap">
      <label className="option">
        <input
          type="checkbox"
          checked={choice.swap}
          onChange={(e) => {
            change({ swap: e.currentTarget.checked });
          }}
        />
        {choice.layout === 'nested' ? 'Swap groups and subgroups' : 'Swap rows and groups'}
      </label>
      {choice.layout === 'nested' && (
        <p className="hint">
          The test compares the groups and treats the subgroups as biological replicates within
          each. Files often put each experiment on top with the conditions repeated under it; if the
          preview shows your replicates as the groups, tick this.
        </p>
      )}
    </div>
  );

  const setSkip = (skip: number) => {
    setGiven({ ...given, skip });
  };
  const headerControl = (choice.layout === 'columns' ||
    choice.layout === 'grouped' ||
    choice.layout === 'nested') && (
    <label className="option">
      <input
        type="checkbox"
        checked={choice.header}
        onChange={(e) => {
          change({ header: e.currentTarget.checked });
        }}
      />
      It starts with a row of titles
    </label>
  );

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
                <div key={l} className="layout-choice">
                  <label className={possible ? 'layout-option' : 'layout-option unfit'}>
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
                  {choice.layout === l && l !== 'long' && swapControl}
                </div>
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
              {swapControl}
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
              <div className="import-start">
                <p className="hint flush">
                  Struck-through rows at the top of the file are skipped (a title, an instrument’s
                  notes). Click a row’s number to skip it or to bring it back.
                </p>
                {headerControl}
              </div>
              <Preview
                result={result}
                sheet={sheet}
                skip={choice.skip}
                decimal={choice.decimal}
                onSkip={setSkip}
              />
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
                ? 'No numbers found in this sheet. Check where the table starts, the separator and the decimal mark.'
                : 'This layout doesn’t make a table from the sheet. Pick another, or check the columns.'}
            </p>
          )}
          {!result && (
            <>
              <div className="import-start">
                <p className="hint flush">
                  Click the row with the table’s titles; rows above it are skipped.
                </p>
                {headerControl}
              </div>
              <StartRows
                sheet={sheet}
                skip={choice.skip}
                decimal={choice.decimal}
                onPick={setSkip}
              />
            </>
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

/** A sheet cell as written, for picking rows. */
function cellText(c: SourceCell | undefined, decimal: DecimalSeparator): string {
  if (c === undefined) return '';
  if (typeof c === 'number') return formatCell(c, decimal);
  if (typeof c === 'string') return c.trim();
  return `${formatCell(c.percent, decimal)}%`;
}

/** A sheet row's filled cells as written. */
function rowTexts(r: readonly SourceCell[] | undefined, decimal: DecimalSeparator): string[] {
  return (r ?? []).map((c) => cellText(c, decimal)).filter((t) => t !== '');
}

/**
 * The top of the sheet as it is, each row a button, for when no table
 * can be made to preview: the one clicked is where the table starts.
 */
function StartRows({
  sheet,
  skip,
  decimal,
  onPick,
}: {
  readonly sheet: SourceSheet;
  readonly skip: number;
  readonly decimal: DecimalSeparator;
  readonly onPick: (skip: number) => void;
}) {
  const shown = sheet.cells.slice(0, Math.max(START_ROWS, skip + 5));
  const width = Math.min(
    START_COLUMNS,
    Math.max(
      1,
      ...shown.map((r) => {
        let n = r.length;
        while (n > 0 && cellText(r[n - 1], decimal) === '') n -= 1;
        return n;
      }),
    ),
  );
  return (
    <div className="import-scroll start-rows">
      <table className="import-table" aria-label="Rows of the file">
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className={i < skip ? 'start-skipped' : undefined}>
              <th scope="row" className="row-pick">
                <button
                  type="button"
                  aria-pressed={i === skip}
                  aria-label={`Start at row ${String(i + 1)}`}
                  title="Start the table here"
                  onClick={() => {
                    onPick(i);
                  }}
                >
                  {i + 1}
                </button>
              </th>
              {Array.from({ length: width }, (_, j) => {
                const t = cellText(r[j], decimal);
                return (
                  <td key={j} title={t.length > 14 ? t : undefined}>
                    {t}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

/** A row-number button in the preview's gutter, to move where the table starts. */
function RowPick({
  row,
  skipped,
  onClick,
}: {
  /** The sheet row, from 0. */
  readonly row: number;
  readonly skipped: boolean;
  readonly onClick: () => void;
}) {
  const n = String(row + 1);
  return (
    <th scope="row" className="row-pick">
      <button
        type="button"
        aria-label={skipped ? `Start at row ${n}` : `Skip row ${n}`}
        title={skipped ? 'Start the table here' : 'Skip this row'}
        onClick={onClick}
      >
        {n}
      </button>
    </th>
  );
}

/**
 * The first rows of the table as it will be made, under the file's rows
 * skipped above it (struck through) — one table to see both where the
 * table starts and what it becomes. Row numbers in the gutter are the
 * file's: a skipped row's starts the table there, a title row's skips it.
 * Cells that aren't numbers are struck through.
 */
function Preview({
  result,
  sheet,
  skip,
  decimal,
  onSkip,
}: {
  readonly result: ImportResult;
  readonly sheet: SourceSheet;
  readonly skip: number;
  readonly decimal: DecimalSeparator;
  readonly onSkip: (skip: number) => void;
}) {
  const [allSkipped, setAllSkipped] = useState(false);
  const { table, marks, notes } = result;
  const labels = subcolumnLabels(table);
  const sub = labels.length > 1;
  const rows = table.rows.slice(0, PREVIEW_ROWS);
  const grouped = table.type === 'grouped';
  const width = (grouped ? 1 : 0) + table.dataSets.length * labels.length;
  const hidden = allSkipped ? 0 : Math.max(0, skip - SKIPPED_SHOWN);
  const skipped = Array.from({ length: skip - hidden }, (_, i) => hidden + i);
  // Title rows are the sheet rows straight under the skipped ones; with
  // none, the first data row is the first row of the sheet the table reads.
  const pick = (k: number) =>
    k < Math.max(1, notes.titleRows) ? (
      <RowPick
        row={skip + k}
        skipped={false}
        onClick={() => {
          onSkip(skip + k + 1);
        }}
      />
    ) : (
      <th scope="row" className="row-pick" aria-hidden />
    );
  return (
    <div className="import-scroll">
      <table className="import-table" aria-label="Preview">
        <thead>
          {hidden > 0 && (
            <tr className="start-skipped">
              <th className="row-pick" aria-hidden />
              <td colSpan={width}>
                <button
                  type="button"
                  className="link"
                  aria-label={`Show ${String(hidden)} more skipped ${hidden === 1 ? 'row' : 'rows'}`}
                  onClick={() => {
                    setAllSkipped(true);
                  }}
                >
                  ↑ {hidden} more
                </button>
              </td>
            </tr>
          )}
          {skipped.map((i) => (
            <tr key={`skip:${String(i)}`} className="start-skipped">
              <RowPick
                row={i}
                skipped
                onClick={() => {
                  onSkip(i);
                }}
              />
              <td colSpan={width} title={rowTexts(sheet.cells[i], decimal).join('  ')}>
                {rowTexts(sheet.cells[i], decimal).map((t, j) => (
                  <span key={j}>{t}</span>
                ))}
              </td>
            </tr>
          ))}
          <tr className="titles">
            {notes.titleRows > 0 ? pick(0) : <th scope="row" className="row-pick" aria-hidden />}
            {grouped && <th rowSpan={sub ? 2 : 1} aria-label="Row titles" />}
            {table.dataSets.map((d) => (
              <th key={d.id} colSpan={labels.length} scope="colgroup">
                {d.title}
              </th>
            ))}
          </tr>
          {sub && (
            <tr className="titles">
              {notes.titleRows > 1 ? pick(1) : <th scope="row" className="row-pick" aria-hidden />}
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
              {i === 0 && notes.titleRows === 0 ? (
                pick(0)
              ) : (
                <th scope="row" className="row-pick" aria-hidden />
              )}
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
