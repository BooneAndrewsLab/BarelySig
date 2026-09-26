/**
 * Beeswarm layout (note 05), seaborn's swarm algorithm: points are placed
 * in order of value, each at the horizontal offset closest to the centre
 * that doesn't overlap any point already placed. Deterministic: the same
 * values always give the same picture.
 */

export interface Swarm {
  /** Horizontal offset of each input point from the centre, in the same units as `diameter`. */
  readonly offsets: readonly number[];
  /** True when the swarm was wider than `maxHalfWidth` and was squeezed (points may then touch). */
  readonly squeezed: boolean;
}

/**
 * @param ys vertical positions (same units as `diameter`), in input order
 * @param diameter point diameter plus any gap wanted between points
 * @param maxHalfWidth how far from the centre points may go
 */
export function beeswarm(ys: readonly number[], diameter: number, maxHalfWidth: number): Swarm {
  const offsets = placed(ys, diameter);
  let widest = 0;
  for (const x of offsets) widest = Math.max(widest, Math.abs(x));
  if (widest <= maxHalfWidth || widest === 0) return { offsets, squeezed: false };
  const k = maxHalfWidth / widest;
  return { offsets: offsets.map((x) => x * k), squeezed: true };
}

/**
 * Recent layouts by their values: a graph is laid out on every render, and
 * again for its thumbnail, while thousands of points take a noticeable
 * moment to place.
 */
const recent = new Map<string, readonly number[]>();
const RECENT = 16;

function placed(ys: readonly number[], diameter: number): readonly number[] {
  const key = `${String(diameter)}|${ys.join(',')}`;
  const hit = recent.get(key);
  if (hit) {
    recent.delete(key);
    recent.set(key, hit);
    return hit;
  }
  const offsets = place(ys, diameter);
  recent.set(key, offsets);
  if (recent.size > RECENT) recent.delete(recent.keys().next().value ?? key);
  return offsets;
}

function place(ys: readonly number[], diameter: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  // Placed points, in the order placed, which is by value: the ones a new
  // point can touch are a run at the end. (Checking every point against
  // every other was cubic and froze the page on a few thousand values.)
  const px: number[] = [];
  const py: number[] = [];
  let first = 0;
  let left = 0;
  let right = 0;
  const offsets = new Array<number>(ys.length).fill(0);
  // Scratch space, reused for every point.
  const bounds = new Float64Array(2 * ys.length);
  const starts = new Float64Array(ys.length);
  const ends = new Float64Array(ys.length);
  /** Each placed point's blocked interval for the point being placed. */
  const startOf = new Float64Array(ys.length);
  const endOf = new Float64Array(ys.length);
  /** The placed points that can touch the next one, by start and by end. */
  const byStart: number[] = [];
  const byEnd: number[] = [];
  const eps = diameter * 1e-9;
  const side = (x: number) => (x === 0 ? 0 : x > 0 ? right : left);
  /** Closest to the centre; on a tie, the side with fewer points so far; then the lower. */
  const better = (a: number, b: number) =>
    (Math.abs(a) - Math.abs(b) || side(a) - side(b) || a - b) < 0;
  for (const { y, i } of order) {
    while (first < py.length && y - (py[first] ?? 0) >= diameter) first += 1;
    // A position is blocked when it is strictly inside (lo + eps, hi - eps)
    // of a point it would overlap: when more of those intervals start
    // before it than end at or before it.
    const n = px.length - first;
    for (let k = first; k < px.length; k += 1) {
      const dy = y - (py[k] ?? 0);
      const half = Math.sqrt(diameter * diameter - dy * dy);
      const x = px[k] ?? 0;
      bounds[2 * (k - first)] = x - half;
      bounds[2 * (k - first) + 1] = x + half;
      const lo = x - half + eps;
      const hi = x + half - eps;
      // An empty interval blocks nothing: it sorts last and is left out.
      startOf[k] = lo < hi ? lo : Infinity;
      endOf[k] = lo < hi ? hi : Infinity;
    }
    // The window's intervals stay sorted from one point to the next: they
    // move little between neighbouring values, so an insertion sort puts
    // them back in order in about linear time.
    dropBefore(byStart, first);
    dropBefore(byEnd, first);
    insertionSort(byStart, startOf);
    insertionSort(byEnd, endOf);
    let m = 0;
    for (let j = 0; j < byStart.length; j += 1) {
      const lo = startOf[byStart[j] ?? 0] ?? Infinity;
      if (lo === Infinity) break;
      starts[j] = lo;
      ends[j] = endOf[byEnd[j] ?? 0] ?? Infinity;
      m += 1;
    }
    const s = starts.subarray(0, m);
    const e = ends.subarray(0, m);
    const x = choose(bounds.subarray(0, 2 * n), s, e, better);
    byStart.push(px.length);
    byEnd.push(px.length);
    px.push(x);
    py.push(y);
    if (x > 0) right += 1;
    else if (x < 0) left += 1;
    offsets[i] = x;
  }
  return offsets;
}

/**
 * The best free position: 0 when nothing covers it, else the first free
 * candidate beyond each end of the blocked stretch around 0, whichever is
 * `better`. Every free candidate lies beyond those ends, so this is the
 * best of all of them, found without sorting them by preference.
 */
function choose(
  bounds: Float64Array,
  starts: Float64Array,
  ends: Float64Array,
  better: (a: number, b: number) => boolean,
): number {
  // The blocked stretch (lo, hi) around 0: the union of the open intervals,
  // swept in order; an interval ending where another starts leaves that
  // point free, so ends go first on a tie.
  const count = ends.length;
  let a = 0;
  let cover = 0;
  let from = 0;
  let lo = 0;
  let hi = Number.NaN;
  for (let b = 0; b < count;) {
    const end = ends[b] ?? 0;
    if (a < count && (starts[a] ?? 0) < end) {
      if (cover === 0) from = starts[a] ?? 0;
      cover += 1;
      a += 1;
    } else {
      cover -= 1;
      b += 1;
      if (cover === 0) {
        if (from >= 0) break;
        if (end > 0) {
          lo = from;
          hi = end;
          break;
        }
      }
    }
  }
  if (Number.isNaN(hi)) return 0;
  const free = (x: number) => below(starts, x, false) <= below(ends, x, true);
  // The nearest free candidate at or beyond each end (almost always the
  // first one looked at).
  const nearest = (beyond: (v: number) => boolean, closer: (v: number, w: number) => boolean) => {
    let floor = Number.NaN;
    for (;;) {
      let found = Number.NaN;
      for (const v of bounds) {
        if (!beyond(v) || (!Number.isNaN(floor) && !closer(floor, v))) continue;
        if (Number.isNaN(found) || closer(v, found)) found = v;
      }
      if (Number.isNaN(found) || free(found)) return found;
      floor = found;
    }
  };
  const right = nearest(
    (v) => v >= hi && v > 0,
    (v, w) => v < w,
  );
  const left = nearest(
    (v) => v <= lo && v < 0,
    (v, w) => v > w,
  );
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : right;
  if (Number.isNaN(right)) return left;
  return better(left, right) ? left : right;
}

/** Removes the points placed before `first` (no longer close enough to touch). */
function dropBefore(list: number[], first: number): void {
  let w = 0;
  for (const k of list) if (k >= first) list[w++] = k;
  list.length = w;
}

function insertionSort(list: number[], key: Float64Array): void {
  for (let a = 1; a < list.length; a += 1) {
    const k = list[a] ?? 0;
    const v = key[k] ?? 0;
    let b = a - 1;
    while (b >= 0 && (key[list[b] ?? 0] ?? 0) > v) {
      list[b + 1] = list[b] ?? 0;
      b -= 1;
    }
    list[b + 1] = k;
  }
}

/** How many of the sorted values are below x (or at most x). */
function below(sorted: Float64Array, x: number, orEqual: boolean): number {
  let a = 0;
  let b = sorted.length;
  while (a < b) {
    const mid = (a + b) >> 1;
    const v = sorted[mid] ?? 0;
    if (v < x || (orEqual && v === x)) a = mid + 1;
    else b = mid;
  }
  return a;
}
