/** Words for opening a data file (item 10): the layouts, and what the reading did. */
import type { ImportNotes, LayoutKind } from '@/io/import/guess';
import type { Table } from '@/model/table';

import { formatLabel } from '../formats';

export interface LayoutInfo {
  readonly name: string;
  /** What it looks like in the file. */
  readonly blurb: string;
}

export const LAYOUT_INFO: Readonly<Record<LayoutKind, LayoutInfo>> = {
  columns: {
    name: 'Each column is a group',
    blurb: 'Group names across the top, the values under them.',
  },
  grouped: {
    name: 'Rows and columns are two factors',
    blurb:
      'Row names down the left (e.g. genotype), groups across the top (e.g. treatment); repeated names are replicates.',
  },
  nested: {
    name: 'Groups of named subgroups',
    blurb:
      'Group names across the top (e.g. replicate), the same subgroup names repeated under each (e.g. cage, dish); raw values below.',
  },
  summary: {
    name: 'Summary data',
    blurb: 'Means with SD, SEM or %CV (and n), already calculated.',
  },
  long: {
    name: 'One row per measurement',
    blurb: 'A column naming the group of each value, and a column of values.',
  },
};

/** What a table will be, in small print under the preview: "Column table · Mean, SD and n". */
export function madeLine(table: Table): string {
  const kind =
    table.type === 'column'
      ? 'Column table'
      : table.type === 'nested'
        ? 'Nested table'
        : 'Grouped table';
  const groups = table.dataSets.length;
  return `${kind} · ${formatLabel(table.format)} · ${String(groups)} ${groups === 1 ? 'group' : 'groups'}${
    table.type === 'grouped'
      ? ` × ${String(table.rows.length)} ${table.rows.length === 1 ? 'row' : 'rows'}`
      : ''
  }`;
}

const n = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

const quoted = (names: readonly string[]) => names.map((s) => `‘${s}’`).join(', ');

/** What reading the file did, one sentence each; `warning` for anything left out or reinterpreted. */
export function describeImport(notes: ImportNotes): {
  readonly lines: readonly string[];
  readonly warning: boolean;
} {
  const lines: string[] = [];
  let warning = false;
  lines.push(`${n(notes.values, 'value', 'values')} read.`);
  if (notes.reshaped) lines.push('Reshaped from one row per measurement into a table.');
  if (notes.skipped > 0) lines.push(`Skipped ${n(notes.skipped, 'row', 'rows')} above the table.`);
  if (notes.leftOut.length > 0) {
    const shown = notes.leftOut.slice(0, 4);
    const more = notes.leftOut.length - shown.length;
    lines.push(
      `Not used: ${notes.leftOut.length === 1 ? 'the column' : 'the columns'} ${quoted(shown)}${
        more > 0 ? ` and ${String(more)} more` : ''
      }.`,
    );
  }
  const missing = [...notes.missing.values()].reduce((a, b) => a + b, 0);
  if (missing > 0) {
    const markers = [...notes.missing.keys()].slice(0, 3).join(', ');
    lines.push(
      `${n(missing, 'cell', 'cells')} with ${markers} ${missing === 1 ? 'is' : 'are'} left empty.`,
    );
  }
  if (notes.text.count > 0) {
    const ex = notes.text.examples.map((e) => `“${e}”`).join(', ');
    lines.push(
      `${n(notes.text.count, 'cell', 'cells')} of text (${ex}) ${
        notes.text.count === 1 ? 'isn’t a number and is' : 'aren’t numbers and are'
      } left empty; struck through in the preview.`,
    );
    warning = true;
  }
  if (notes.percent > 0) {
    lines.push(
      `${n(notes.percent, 'percentage is', 'percentages are')} read as the number shown (85% as 85).`,
    );
    warning = true;
  }
  if (notes.unlabelled > 0) {
    lines.push(
      `${n(notes.unlabelled, 'value has', 'values have')} no group and ${notes.unlabelled === 1 ? 'is' : 'are'} left out.`,
    );
    warning = true;
  }
  if (notes.repeats > 0) {
    lines.push(
      `${n(notes.repeats, 'row repeats', 'rows repeat')} a combination already read and ${notes.repeats === 1 ? 'is' : 'are'} left out.`,
    );
    warning = true;
  }
  if (notes.unusedStats.length > 0) {
    lines.push(
      `The ${notes.unusedStats.join(' and ')} ${notes.unusedStats.length === 1 ? 'column is' : 'columns are'} not used: a table holds one kind of spread.`,
    );
    warning = true;
  }
  if (notes.unit !== null) lines.push(`The unit ${notes.unit} became the table’s unit.`);
  if (notes.decimal === ',') lines.push('Read with a decimal comma.');
  if (notes.truncated) {
    lines.push('Only the first 10,000 rows and 500 columns are read.');
    warning = true;
  }
  return { lines, warning };
}

/** A file name without its extension, for titles. */
export function stem(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim() || 'Data';
}
