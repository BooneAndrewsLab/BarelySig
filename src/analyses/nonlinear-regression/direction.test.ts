import { describe, expect, it } from 'vitest';
import { wrongWayWarning } from './direction';
import type { DoseResponseOutcome, FitParameter } from './types';

const par = (value: number): FitParameter => ({
  value,
  status: 'fitted',
  se: 1,
  lower: null,
  upper: null,
  dependency: 0,
  ambiguous: false,
});

function fit(bottom: number, top: number): DoseResponseOutcome {
  return { ran: true, bottom: par(bottom), top: par(top) } as unknown as DoseResponseOutcome;
}

const rising = [1, 2, 3, 4].map((x) => ({ x, y: x * 10 }));
const falling = [1, 2, 3, 4].map((x) => ({ x, y: 100 - x * 10 }));

describe('wrong-way standard-slope warning (#108)', () => {
  it('warns for an agonist standard-slope fit of falling data, naming the inhibitor model', () => {
    const w = wrongWayWarning('log-agonist-standard-slope', 'A', falling, fit(90, 10));
    expect(w).toContain('A:');
    expect(w).toContain('wrong way');
    expect(w).toContain('log(inhibitor) vs. response (three parameters, HillSlope = −1)');
  });

  it('warns for an inhibitor standard-slope fit of rising data', () => {
    const w = wrongWayWarning('log-inhibitor-standard-slope', 'B', rising, fit(80, 10));
    expect(w).toContain('log(agonist) vs. response (three parameters, HillSlope = 1)');
  });

  it('is silent when the fit runs the right way, or the slope is free', () => {
    expect(wrongWayWarning('log-agonist-standard-slope', 'A', rising, fit(5, 95))).toBeNull();
    expect(wrongWayWarning('log-inhibitor-standard-slope', 'A', falling, fit(5, 95))).toBeNull();
    expect(wrongWayWarning('log-agonist-variable-slope', 'A', falling, fit(90, 10))).toBeNull();
  });

  it('judges a normalized standard-slope fit by the data trend', () => {
    const w = wrongWayWarning('log-agonist-normalized-standard-slope', 'N', falling, fit(0, 100));
    expect(w).toContain('log(inhibitor) vs. normalized response (HillSlope = −1)');
    expect(
      wrongWayWarning('log-agonist-normalized-standard-slope', 'N', rising, fit(0, 100)),
    ).toBeNull();
  });

  it('is silent when the fit did not run', () => {
    const none = { ran: false } as unknown as DoseResponseOutcome;
    expect(wrongWayWarning('log-agonist-standard-slope', 'A', falling, none)).toBeNull();
  });
});
