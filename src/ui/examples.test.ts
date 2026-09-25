import { describe, expect, it } from 'vitest';

import { validateProject } from '@/model/validate';

import { exampleProject } from './examples';

describe('the example project', () => {
  it('shows tables, analyses and graphs, all valid', () => {
    const p = exampleProject();
    expect(validateProject(p)).toEqual([]);
    expect([...p.analyses.values()].map((a) => a.kind)).toEqual(['one-way-anova', 'two-way-anova']);
    expect([...p.graphs.values()].map((g) => [g.plot.kind, g.analyses.length])).toEqual([
      ['bars', 1],
      ['grouped-bars', 1],
    ]);
  });
});
