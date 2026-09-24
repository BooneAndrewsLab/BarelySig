/**
 * Resolving a graph's theme (note 05): a named theme is the app's current
 * default of that name; a fixed theme (from a figure recipe) is read field
 * by field over Modern, so a recipe from an older version with fewer
 * fields still renders, with what it saved.
 */
import type { Json } from '@/model/json';
import type { GraphThemeRef } from '@/model/project';

import { type GraphTheme, MODERN, THEMES } from './theme';

function merge<T>(base: T, over: Json | undefined): T {
  if (over === null || over === undefined || typeof over !== 'object' || Array.isArray(over))
    return base;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    if (b === undefined) continue;
    if (Array.isArray(b))
      out[k] = Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : b;
    else if (b !== null && typeof b === 'object') out[k] = merge(b, v);
    else if (b === null || typeof v === typeof b) out[k] = v;
  }
  return out as T;
}

export function resolveTheme(ref: GraphThemeRef): GraphTheme {
  return ref.kind === 'named' ? THEMES[ref.name] : merge(MODERN, ref.theme);
}

/** A theme as plain data, for a figure recipe's fixed theme. */
export const themeJson = (t: GraphTheme): Json => JSON.parse(JSON.stringify(t)) as Json;
