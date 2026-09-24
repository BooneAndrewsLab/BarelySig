/** Plain-language names of table types and entry formats, shared by dialogs and the grid (item 03). */
import type { EntryFormat, SummaryStats, TableType } from '@/model/table';

import type { IconName } from './Icon';

export interface TableTypeInfo {
  readonly type: TableType;
  readonly name: string;
  readonly icon: IconName;
  /** One sentence: what the layout is and what it is for. */
  readonly blurb: string;
}

export const TABLE_TYPES: readonly TableTypeInfo[] = [
  {
    type: 'column',
    name: 'Column',
    icon: 'column',
    blurb:
      'Each column is a group, each row a replicate. For t tests, one-way ANOVA and bar graphs.',
  },
  {
    type: 'grouped',
    name: 'Grouped',
    icon: 'grouped',
    blurb:
      'Two factors: rows are one (e.g. genotype), columns the other (e.g. treatment). For two-way ANOVA and grouped bars.',
  },
];

export function tableTypeInfo(type: TableType): TableTypeInfo {
  const info = TABLE_TYPES.find((t) => t.type === type);
  if (!info) throw new Error(`no table type ${type}`);
  return info;
}

export const SUMMARY_LABELS: Readonly<Record<SummaryStats, string>> = {
  'mean-sd-n': 'Mean, SD and n',
  'mean-sem-n': 'Mean, SEM and n',
  'mean-cv-n': 'Mean, %CV and n',
  'mean-sd': 'Mean and SD (graphs only)',
  'mean-sem': 'Mean and SEM (graphs only)',
  'mean-cv': 'Mean and %CV (graphs only)',
};

/** How the table's values were entered, for the sheet header. */
export function formatLabel(format: EntryFormat): string {
  if (format.kind === 'summary') return SUMMARY_LABELS[format.stats];
  return format.count === 1 ? 'Individual values' : `${String(format.count)} replicates per cell`;
}
