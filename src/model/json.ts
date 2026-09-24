/** JSON values, and the canonical form content hashes are taken of (item 02). */

export type Json =
  null | boolean | number | string | readonly Json[] | Readonly<{ [key: string]: Json }>;

/**
 * JSON with object keys sorted, so equal values always give the same
 * string whatever order their keys were written in. Numbers use JS's
 * shortest round-trip form, so no digits are lost.
 */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`not representable in JSON: ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${(value as readonly Json[]).map(canonicalJson).join(',')}]`;
  const obj = value as Readonly<Record<string, Json>>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k] ?? null)}`).join(',')}}`;
}

/**
 * A 128-bit hash of a string as 32 hex digits: four 32-bit MurmurHash3
 * lanes with different seeds. For telling inputs apart, not for security;
 * synchronous, because `crypto.subtle` exists only in a secure context.
 */
export function hashString(s: string): string {
  let out = '';
  for (const seed of [0x9747b28c, 0x2f1a3b5d, 0x6c8e9cf5, 0x51ed270b]) {
    out += murmur3(s, seed).toString(16).padStart(8, '0');
  }
  return out;
}

function murmur3(s: string, seed: number): number {
  let h = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const mix = (k0: number): void => {
    let k = Math.imul(k0, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  };
  // UTF-16 code units, two per 32-bit block.
  const n = s.length;
  let i = 0;
  for (; i + 1 < n; i += 2) mix(s.charCodeAt(i) | (s.charCodeAt(i + 1) << 16));
  if (i < n) {
    let k = Math.imul(s.charCodeAt(i), c1);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, c2);
  }
  h ^= n * 2;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const hashJson = (value: Json): string => hashString(canonicalJson(value));
