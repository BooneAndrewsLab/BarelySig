/**
 * Repeated-measures two-way ANOVA, both factors repeated (item 23, #84):
 * request and result.
 */
import type { RepeatedTwoWayBothOptions } from '@/model/project';

import type { Named } from '../ttest/types';

export interface RepeatedTwoWayBothRequest {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  readonly options: RepeatedTwoWayBothOptions;
  /** One entry per kept subject: its value at every row × column cell, row-major. */
  readonly subjects: readonly { readonly values: readonly number[] }[];
  readonly droppedSubjects: number;
}

/** SS/df/MS, and F/P where the term is tested (the descriptive `subjects` term has neither). */
export interface RepeatedTwoWayBothTerm {
  readonly ss: number;
  readonly df: number;
  readonly ms: number;
  readonly f: number | null;
  readonly p: number | null;
}

/** One within-subject term's error stratum, and its own GG/HF correction. */
export interface RepeatedTwoWayBothError {
  readonly ss: number;
  readonly df: number;
  readonly ms: number;
  readonly ggEpsilon: number;
  readonly hfEpsilon: number;
  readonly ggP: number;
  readonly hfP: number;
}

export interface RepeatedTwoWayBothResult {
  readonly rows: readonly Named[];
  readonly columns: readonly Named[];
  readonly options: RepeatedTwoWayBothOptions;
  readonly rowLevels: number;
  readonly columnLevels: number;
  readonly n: number;
  readonly droppedSubjects: number;
  /** Descriptive only: every subject's own mean, no error term of its own left to test against. */
  readonly subjects: RepeatedTwoWayBothTerm;
  readonly row: RepeatedTwoWayBothTerm;
  readonly rowError: RepeatedTwoWayBothError;
  readonly column: RepeatedTwoWayBothTerm;
  readonly columnError: RepeatedTwoWayBothError;
  readonly interaction: RepeatedTwoWayBothTerm;
  readonly interactionError: RepeatedTwoWayBothError;
  readonly total: { readonly ss: number; readonly df: number };
  readonly warnings: readonly string[];
}
