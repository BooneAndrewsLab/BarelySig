import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { play, resolve, sessionArb } from '@/test/modelArbitraries';

import { EditError, applyEdit } from './edits';
import { createProject } from './project';
import { validateProject } from './validate';

const RUNS = 300;

describe('random editing sessions', () => {
  it('keep every model invariant', () => {
    fc.assert(
      fc.property(sessionArb, (shapes) => {
        const { project } = play(shapes);
        expect(validateProject(project)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it('leave the project an edit was given exactly as it was, refused or not', () => {
    fc.assert(
      fc.property(sessionArb, (shapes) => {
        let project = createProject('Session');
        for (const s of shapes) {
          const edit = resolve(project, s);
          if (!edit) continue;
          const snapshot = structuredClone(project);
          try {
            applyEdit(project, edit);
          } catch (e: unknown) {
            if (!(e instanceof EditError)) throw e;
          }
          expect(project).toStrictEqual(snapshot);
          try {
            project = applyEdit(project, edit);
          } catch {
            // refused: keep the project
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('generate calculated tables, by row and detached, so the properties above cover them', () => {
    const seen = { made: 0, byRow: 0, summary: 0, detached: 0 };
    fc.assert(
      fc.property(sessionArb, (shapes) => {
        const { project, applied } = play(shapes);
        project.tables.forEach((t) => {
          if (!t.derived) return;
          seen.made += 1;
          if (t.derived.options.by === 'row') seen.byRow += 1;
          if (t.format.kind === 'summary') seen.summary += 1;
        });
        seen.detached += applied.filter((e) => e.op === 'detachDerived').length;
      }),
      { numRuns: 1000 },
    );
    expect(seen.made).toBeGreaterThan(0);
    expect(seen.byRow).toBeGreaterThan(0);
    expect(seen.detached).toBeGreaterThan(0);
  });
});
