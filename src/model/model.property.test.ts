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
});
