// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { DescriptiveResult } from '@/analyses/descriptive/types';
import { graphInput, summaryId } from '@/graphs/data';
import { exportSvg } from '@/graphs/export';
import { layoutColumn } from '@/graphs/layout';
import { readText, withChunks } from '@/graphs/png';
import { MODERN } from '@/graphs/theme';
import { resolveTheme } from '@/graphs/themes';
import { applyEdit } from '@/model/edits';
import { type Id, asId } from '@/model/ids';
import type { Json } from '@/model/json';
import { GRAPH_DEFAULTS, type Graph, type Project, createProject } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';
import { createColumnTable } from '@/model/table';

import { readBsig, writeBsig } from './bsig';
import {
  figureKind,
  originSentence,
  pngMeta,
  readFigure,
  recipeProject,
  recipeText,
  svgMeta,
} from './recipe';

const TINY = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

function setup() {
  const t = createColumnTable({ title: 'Viability', groups: ['WT', 'KO'], rows: 3 });
  const [wt, ko] = t.dataSets;
  if (!wt || !ko) throw new Error('unreachable');
  let p: Project = applyEdit(createProject('Big project'), { op: 'addTable', table: t });
  p = applyEdit(p, {
    op: 'addTable',
    table: createColumnTable({ title: 'Unrelated', groups: ['x'] }),
  });
  p = applyEdit(p, {
    op: 'setCells',
    table: t.id,
    cells: t.rows.flatMap((r, i) => [
      { dataSet: wt.id, subcolumn: 0, row: r.id, value: 10 + i },
      { dataSet: ko.id, subcolumn: 0, row: r.id, value: 20 + i * 2 },
    ]),
  });
  p = applyEdit(p, {
    op: 'addAnalysis',
    analysis: {
      id: asId('a_t'),
      title: 't',
      kind: 't-test',
      options: { paired: false, welch: false, tails: 'two' },
      input: { kind: 'table', table: t.id, dataSets: [wt.id, ko.id] },
    },
  });
  const graph: Graph = {
    id: asId('g_1'),
    title: 'Figure 2',
    source: { kind: 'table', table: t.id },
    analyses: [asId('a_t')],
    ...GRAPH_DEFAULTS,
  };
  p = applyEdit(p, { op: 'addGraph', graph });
  const summary: DescriptiveResult = {
    groups: [wt, ko].map((d, i) => ({
      id: d.id,
      title: d.title,
      from: 'values',
      n: 3,
      dropped: null,
      min: 10 + i * 10,
      q1: null,
      median: 11 + i * 11,
      q3: null,
      max: 12 + i * 14,
      range: null,
      mean: 11 + i * 11,
      sd: 1 + i,
      sem: 0.58,
      ciLower: null,
      ciUpper: null,
      cv: null,
      geomean: null,
      sum: null,
    })),
    warnings: [],
  };
  const results = new Map<Id, ResultEntry>([
    [summaryId(graph.id), { inputHash: 'h1', ok: true, value: summary as unknown as Json }],
    [
      asId('a_t'),
      { inputHash: 'h2', ok: true, value: { p: 0.0012, a: { id: wt.id }, b: { id: ko.id } } },
    ],
  ]);
  return { p, graph, results };
}

function inputOf(p: Project, graph: Graph, results: ReadonlyMap<Id, ResultEntry>) {
  const input = graphInput(p, graph, (id) => results.get(id));
  if (!input.ok) throw new Error(input.reason);
  return input.input;
}

/** The figure as drawn from a project and its results, without metadata. */
function figure(p: Project, graph: Graph, results: ReadonlyMap<Id, ResultEntry>): string {
  const input = graphInput(p, graph, (id) => results.get(id));
  if (!input.ok) throw new Error(input.reason);
  return exportSvg(layoutColumn(input.input));
}

const ENGINE = { webr: '0.6.0', r: '4.6.0', packages: {} };
const origin = (withData: boolean) => ({
  app: '0.5.0',
  engine: ENGINE,
  title: 'Figure 2',
  withData,
});

describe('figure recipes', () => {
  it('keep only what the figure needs, with the theme resolved', () => {
    const { p, graph, results } = setup();
    const r = recipeProject(p, graph, results);
    expect([...r.project.tables.values()].map((t) => t.title)).toEqual(['Viability']);
    expect([...r.project.analyses.keys()]).toEqual(['a_t']);
    const g = r.project.graphs.get(graph.id);
    expect(g?.theme.kind).toBe('fixed');
    expect(g && resolveTheme(g.theme)).toEqual(MODERN);
    expect([...r.results.keys()].sort()).toEqual(['a_t', 'g_1/summary']);
  });

  it('reopen from an SVG as the identical figure', async () => {
    const { p, graph, results } = setup();
    const recipe = recipeText(p, graph, results, ENGINE, '0.5.0');
    const meta = await svgMeta(origin(true), recipe);
    const file = new TextEncoder().encode(
      exportSvg(layoutColumn(inputOf(p, graph, results)), meta),
    );
    expect(figureKind('fig.svg', file)).toBe('svg');
    const back = await readFigure('svg', file);
    const g = back.project.graphs.get(graph.id);
    if (!g) throw new Error('no graph');
    expect(figure(back.project, g, back.results)).toBe(figure(p, graph, results));
  });

  it('reopen from a PNG as the identical figure', async () => {
    const { p, graph, results } = setup();
    const recipe = recipeText(p, graph, results, ENGINE, '0.5.0');
    const png = withChunks(TINY, await pngMeta(origin(true), recipe));
    expect(figureKind('whatever', png)).toBe('png');
    const back = await readFigure('png', png);
    const g = back.project.graphs.get(graph.id);
    if (!g) throw new Error('no graph');
    expect(figure(back.project, g, back.results)).toBe(figure(p, graph, results));
  });

  it('say where they came from, in the places viewers look, with or without the data', async () => {
    const withData = await svgMeta(origin(true), 'x');
    expect(withData.prolog).toMatch(
      /^<\?xml version="1.0" encoding="UTF-8"\?>\n<!-- Made with BarelySig 0\.5\.0 \(WebR 0\.6\.0, R 4\.6\.0\)\. Open this file in BarelySig/,
    );
    expect(withData.head).toContain('<desc>Made with BarelySig 0.5.0');
    expect(withData.head).toContain('xmp:CreatorTool="BarelySig 0.5.0"');
    expect(withData.head).toContain('<barelysig:recipe');
    const without = await svgMeta(origin(false), null);
    expect(without.head).not.toContain('barelysig:recipe');
    expect(originSentence(origin(false))).toContain(
      'The data were not included, so it can’t be reopened',
    );
    const png = withChunks(TINY, await pngMeta(origin(false), null));
    expect(readText(png, 'Software')).toBe('BarelySig 0.5.0');
    expect(readText(png, 'Description')).toContain("can't be reopened");
    expect(readText(png, 'XML:com.adobe.xmp')).toContain('xmp:CreatorTool="BarelySig 0.5.0"');
  });

  it('explain why a figure without its data, or someone else’s, can’t be reopened', async () => {
    const png = withChunks(TINY, await pngMeta(origin(false), null));
    await expect(readFigure('png', png)).rejects.toThrow('exported without its data');
    await expect(readFigure('png', TINY)).rejects.toThrow('wasn’t made with BarelySig');
    await expect(
      readFigure('svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toThrow('wasn’t made with BarelySig');
  });

  it('are kept in the project’s export history, and survive saving', () => {
    const { p, graph, results } = setup();
    const recipe = JSON.parse(recipeText(p, graph, results, ENGINE, '0.5.0')) as Json;
    const withExport = applyEdit(p, {
      op: 'addExport',
      record: {
        id: asId('x_1'),
        graph: graph.id,
        exportedAt: '2026-09-24T12:00:00.000Z',
        fileName: 'Figure 2.png',
        format: 'png',
        dpi: 600,
        size: { width: 89, height: 60 },
        recipe,
      },
    });
    const back = readBsig(
      writeBsig({ project: withExport, results: new Map(), engine: null, app: '0.5.0' }),
    );
    expect(back.project.exports).toStrictEqual(withExport.exports);
    const restored = readBsig(JSON.stringify(back.project.exports[0]?.recipe));
    expect([...restored.project.graphs.keys()]).toEqual([graph.id]);
  });
});
