import { describe, expect, it } from 'vitest';

import { type Graph, GRAPH_DEFAULTS } from '@/model/project';

import {
  hasFormatting,
  isFormatted,
  resetAll,
  resetElement,
  withFormat,
  withOffset,
  withStyleValue,
  withSymbol,
} from './formatting';

const graph: Graph = {
  id: 'g' as never,
  title: 'G',
  source: { kind: 'table', table: 't' as never },
  analyses: [],
  ...GRAPH_DEFAULTS,
};

describe('formatting a graph', () => {
  it('sets and clears overrides without leaving empty ones behind', () => {
    const a = withStyleValue(graph, 'font.tick', 9);
    expect(a.format.style).toEqual({ 'font.tick': 9 });
    expect(withStyleValue(a, 'font.tick', undefined).format).toEqual(graph.format);
    expect(withFormat(graph, { yMin: 0 }).format.yMin).toBe(0);
    expect('yMin' in withFormat(withFormat(graph, { yMin: 0 }), { yMin: undefined }).format).toBe(
      false,
    );
  });

  it('stores a circle as no symbol, and bracket offsets only above zero', () => {
    expect(withSymbol(graph, 'd1', 'square').format.symbols).toEqual({ d1: 'square' });
    expect(
      withSymbol(withSymbol(graph, 'd1', 'square'), 'd1', 'circle').format.symbols,
    ).toBeUndefined();
    expect(withOffset(graph, 'k', 3.04).format.bracketOffsets).toEqual({ k: 3 });
    expect(withOffset(withOffset(graph, 'k', 3), 'k', -2).format.bracketOffsets).toBeUndefined();
  });

  it('resets one element’s overrides and leaves the others', () => {
    let g = withStyleValue(graph, 'lines.error', 1.5);
    g = withStyleValue(g, 'font.axisTitle', 10);
    g = withFormat(g, { yScale: 'log10', yStep: 5, yTitle: 'Signal' });
    g = withSymbol(g, 'd1', 'diamond');
    g = withOffset(g, 'k', 4);
    expect(isFormatted(g, 'error-bars')).toBe(true);
    const e = resetElement(g, 'error-bars');
    expect(e.format.style).toEqual({ 'font.axisTitle': 10 });
    const y = resetElement(g, 'y-axis');
    expect(y.format.yScale).toBeUndefined();
    expect(y.format.yTitle).toBe('Signal');
    expect(resetElement(g, 'series:d1').format.symbols).toBeUndefined();
    expect(resetElement(g, 'bracket:k').format.bracketOffsets).toBeUndefined();
    expect(isFormatted(graph, 'y-axis')).toBe(false);
  });

  it('resets everything but the brackets chosen and how they are labelled', () => {
    const g = withFormat(withStyleValue(graph, 'barWidth', 0.4), {
      xAngle: 45,
      showTitle: true,
      bracketLabels: 'exact',
      hiddenBrackets: ['x'],
    });
    expect(hasFormatting(g)).toBe(true);
    const r = resetAll(g);
    expect(hasFormatting(r)).toBe(false);
    expect(r.format).toEqual({ ...graph.format, bracketLabels: 'exact', hiddenBrackets: ['x'] });
  });
});
