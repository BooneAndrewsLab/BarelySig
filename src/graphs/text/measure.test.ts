import { describe, expect, it } from 'vitest';

import { textWidth, wrap } from './measure';

describe('wrap', () => {
  it('breaks at spaces, never cutting a word', () => {
    const text = 'Vehicle control, DMSO 0.1%';
    const w = textWidth('DMSO', 7);
    const lines = wrap(text, w + 2, 7);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
  });

  it('also breaks after an underscore, keeping it with the piece before it', () => {
    const text = 'CGA_DMSO_3day';
    const w = textWidth('DMSO_', 7) + 1;
    const lines = wrap(text, w, 7);
    expect(lines).toEqual(['CGA_', 'DMSO_', '3day']);
    // No line exceeds the width it was wrapped to.
    for (const line of lines) expect(textWidth(line, 7)).toBeLessThanOrEqual(w + 0.01);
  });

  it('keeps a piece whole, never cutting it, when it alone is wider than the width', () => {
    const text = 'Supercalifragilisticexpialidocious_ok';
    const lines = wrap(text, 10, 7);
    expect(lines.some((l) => l.startsWith('Supercalifragilisticexpialidocious'))).toBe(true);
  });

  it('only spaces a piece before the start of a new source word', () => {
    // "a_b c_d": the underscore pieces of the same word never get a space,
    // only the boundary between "a_b" and "c_d" does.
    const lines = wrap('a_b c_d', 1000, 7);
    expect(lines).toEqual(['a_b c_d']);
  });
});
