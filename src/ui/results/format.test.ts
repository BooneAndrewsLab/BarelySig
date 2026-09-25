import { describe, expect, it } from 'vitest';

import { dfText, howOften, pPhrase, pValue, sig, stars } from './format';

describe('P values', () => {
  it.each([
    [0.1234, '0.1234'],
    [0.0021, '0.0021'],
    [0.0001, '0.0001'],
    [0.00009999, '< 0.0001'],
    [1e-26, '< 0.0001'],
    [0, '< 0.0001'],
    [1, '1.0000'],
    [0.04996, '0.0499'],
    [0.009996, '0.0099'],
    [0.050004, '0.0500'],
    [0.03999, '0.0400'],
  ])('shows %s as %s', (p, text) => {
    expect(pValue(p)).toBe(text);
  });

  it('never contradicts its asterisks', () => {
    for (let p = 0.00005; p < 0.06; p += 0.0000013) {
      const shown = pValue(p);
      const value = shown.startsWith('<') ? 0 : Number(shown);
      if (stars(p) !== 'ns') expect(value, shown).toBeLessThan(0.05);
      if (p < 0.01) expect(value, shown).toBeLessThan(0.01);
    }
  });

  it('writes sentences and asterisks by Prism’s thresholds', () => {
    expect(pPhrase(0.0021)).toBe('P = 0.0021');
    expect(pPhrase(1e-9)).toBe('P < 0.0001');
    expect([0.049, 0.00099, 1e-9].map((p) => stars(p, 'apa'))).toEqual(['*', '***', '***']);
    expect([0.2, 0.05, 0.049, 0.0099, 0.00099, 0.000099].map((p) => stars(p))).toEqual([
      'ns',
      'ns',
      '*',
      '**',
      '***',
      '****',
    ]);
    expect(pValue(Number.NaN)).toBe('—');
  });
});

describe('numbers', () => {
  it('uses four significant digits', () => {
    expect([3.16227766, 12345.678, 0.000123456, 1234567, -2.5, 0].map((x) => sig(x))).toEqual([
      '3.162',
      '12350',
      '0.0001235',
      '1.235e6',
      '-2.5',
      '0',
    ]);
    expect(sig(null)).toBe('—');
  });

  it('keeps whole degrees of freedom whole', () => {
    expect(dfText(8)).toBe('8');
    expect(dfText(6.8231)).toBe('6.823');
  });

  it('says how often in words', () => {
    expect(howOften(0.23)).toBe('about 23% of experiments');
    expect(howOften(0.0021)).toBe('about 0.2% of experiments');
    expect(howOften(0.00052)).toBe('about 5 in 10,000 experiments');
    expect(howOften(0.0081)).toBe('about 0.8% of experiments');
    expect(howOften(1e-8)).toBe('fewer than 1 in 10,000 experiments');
  });
});
