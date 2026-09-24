/**
 * R values, as WebR's `toJs()` gives them, to plain JSON-like values — the
 * shape jsonlite writes with `auto_unbox = TRUE`, which is what fixtures
 * hold. An R `NA` is `null` (an empty cell); `NaN` and `±Inf` stay numbers.
 */

export type Plain = null | number | string | boolean | Plain[] | { [key: string]: Plain };

/** What `RObject.toJs()` returns, as far as statistics results need it. */
export type RJs =
  | { readonly type: 'null' }
  | {
      readonly type: string;
      readonly names: readonly (string | null)[] | null;
      readonly values: readonly unknown[];
    };

const ATOMIC = new Set(['logical', 'integer', 'double', 'character']);

function isRJs(v: unknown): v is RJs {
  return typeof v === 'object' && v !== null && 'type' in v;
}

function atom(v: unknown): Plain {
  if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
    return v;
  }
  throw new TypeError(`unsupported R atomic value: ${typeof v}`);
}

/** Names, when every element has one; otherwise the vector is positional. */
function fullNames(names: readonly (string | null)[] | null): readonly string[] | null {
  if (names === null || names.some((n) => n === null || n === '')) return null;
  return names as readonly string[];
}

export function fromR(x: RJs): Plain {
  if (!('values' in x)) return null;
  const { type, values } = x;
  const names = fullNames(x.names);
  let items: Plain[];
  if (ATOMIC.has(type)) items = values.map(atom);
  else if (type === 'list') {
    items = values.map((v) => {
      if (!isRJs(v)) throw new TypeError('list element was not converted by toJs()');
      return fromR(v);
    });
  } else throw new TypeError(`unsupported R type: ${type}`);

  if (names !== null) return Object.fromEntries(names.map((n, i) => [n, items[i] ?? null]));
  if (ATOMIC.has(type) && items.length === 1) return items[0] ?? null;
  return items;
}
