// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GridMenu } from './GridMenu';

const items = [{ label: 'Insert rows above', run: () => undefined }];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GridMenu', () => {
  it('opens at the pointer', () => {
    render(<GridMenu x={100} y={50} items={items} onClose={() => undefined} />);
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('50px');
  });

  it('stays on screen when opened near the right or bottom edge', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 120),
    );
    const x = window.innerWidth - 10;
    const y = window.innerHeight - 10;
    render(<GridMenu x={x} y={y} items={items} onClose={() => undefined} />);
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe(`${String(window.innerWidth - 204)}px`);
    expect(menu.style.top).toBe(`${String(window.innerHeight - 124)}px`);
  });
});
