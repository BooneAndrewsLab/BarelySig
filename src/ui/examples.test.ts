import { describe, expect, it } from 'vitest';

import { validateProject } from '@/model/validate';

import { exampleProject } from './examples';
import { TABLE_TYPES } from './formats';

describe('the example project', () => {
  it('shows tables, analyses and graphs, all valid', () => {
    const p = exampleProject();
    expect(validateProject(p)).toEqual([]);
    expect([...p.analyses.values()].map((a) => a.kind)).toEqual([
      'one-way-anova',
      'two-way-anova',
      'linear-regression',
      'correlation',
      'growth-curve',
    ]);
    expect([...p.graphs.values()].map((g) => [g.plot.kind, g.analyses.length])).toEqual([
      ['bars', 1],
      ['grouped-bars', 1],
      ['xy-scatter', 1],
      ['xy-scatter', 1],
    ]);
  });

  it('has one valid example per table type, made of that type only', () => {
    for (const type of TABLE_TYPES.map((t) => t.type)) {
      const p = exampleProject(type);
      expect(validateProject(p)).toEqual([]);
      expect([...p.tables.values()].map((t) => t.type)).toSatisfy((types: string[]) =>
        types.every((t) => t === type),
      );
      expect(p.tables.size).toBeGreaterThan(0);
      expect(p.analyses.size).toBeGreaterThan(0);
    }
  });
});
