// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyEdit } from '@/model/edits';
import { newId } from '@/model/ids';
import { GRAPH_DEFAULTS, XY_DEFAULT, createProject } from '@/model/project';
import { createXyTable } from '@/model/table';

import { project, store } from '../state/store';
import { GraphSettings } from './GraphSettings';

// Regression for the "Fitted line" select snapping back to "None" after
// picking a linear-regression analysis (item 31 follow-up): its onChange
// used to fire two sequential store.edit('setGraph', …) calls, each built
// from the same stale `graph` prop, so the second (setting plot.fit) wiped
// out the analyses id the first had just set.
describe('the XY graph settings panel', () => {
  const analysisId = newId('a');
  const graphId = newId('g');

  beforeEach(() => {
    const table = createXyTable({ title: 'Anscombe', groups: ['Y'], rows: 4 });
    let p = applyEdit(createProject('P'), { op: 'addTable', table });
    p = applyEdit(p, {
      op: 'addAnalysis',
      analysis: {
        id: analysisId,
        title: 'Linear regression of Anscombe',
        kind: 'linear-regression',
        options: {},
        input: { kind: 'table', table: table.id, dataSets: [] },
      },
    });
    p = applyEdit(p, {
      op: 'addGraph',
      graph: {
        id: graphId,
        title: table.title,
        source: { kind: 'table', table: table.id },
        analyses: [],
        ...GRAPH_DEFAULTS,
        plot: XY_DEFAULT,
      },
    });
    act(() => {
      store.load(p);
    });
  });

  it('keeps the picked regression selected instead of snapping back to None', () => {
    const p = project(store.getState());
    const graph = p.graphs.get(graphId);
    if (!graph) throw new Error('graph');
    render(<GraphSettings project={p} graph={graph} />);

    const select = screen.getByLabelText('Fitted line');
    expect(select).toHaveValue('');
    fireEvent.change(select, { target: { value: analysisId } });

    const after = project(store.getState()).graphs.get(graphId);
    expect(after?.plot).toMatchObject({ kind: 'xy-scatter', fit: true });
    expect(after?.analyses).toEqual([analysisId]);
  });
});
