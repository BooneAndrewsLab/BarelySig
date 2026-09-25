// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import pkg from '../../../package.json' with { type: 'json' };

import { GUIDE } from './guide';
import { HelpButton } from './HelpButton';
import { openGuide } from './openGuide';

describe('HelpButton', () => {
  it('opens the guide on the first page and lists every page', () => {
    render(<HelpButton />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog', { name: 'BarelySig guide' });
    expect(dialog).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Guide pages' });
    for (const p of GUIDE) expect(nav).toHaveTextContent(p.title);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(GUIDE[0]?.title ?? '');
  });

  it('says which release this is', () => {
    render(<HelpButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog', { name: 'BarelySig guide' });
    expect(dialog).toHaveTextContent(`Version ${pkg.version}`);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('switches pages from the list and from links inside a page', () => {
    render(<HelpButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const nav = screen.getByRole('navigation', { name: 'Guide pages' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Keyboard shortcuts');
    fireEvent.click(within(nav).getByRole('button', { name: 'Getting started' }));
    // Getting started links to the files page in its text.
    const article = screen.getByRole('article');
    fireEvent.click(within(article).getByRole('button', { name: 'Saving, files and privacy' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Saving, files and privacy',
    );
    expect(within(nav).getByRole('button', { name: 'Saving, files and privacy' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens at the page something else asked for', () => {
    render(<HelpButton />);
    act(() => {
      openGuide('15-files');
    });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Saving, files and privacy',
    );
    // Another page while it is up wins; the "?" button goes back to the top.
    act(() => {
      openGuide('16-shortcuts');
    });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Keyboard shortcuts');
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(GUIDE[0]?.title ?? '');
  });

  it('makes a link within a page scroll to that section instead of opening a tab', () => {
    render(<HelpButton />);
    act(() => {
      openGuide('15-files');
    });
    const article = screen.getByRole('article');
    // Every heading is a target, and `[a file](#files)` in the page text is
    // a button in the dialog rather than a link out of it.
    expect(article.querySelector('#files')?.textContent).toBe('Files');
    const links = within(article).getAllByRole('button', { name: 'a file' });
    expect(links.length).toBeGreaterThan(0);
    expect(article.querySelector('a[href="#files"]')).toBeNull();
    const [link] = links;
    if (link === undefined) throw new Error('expected a link to the files section');
    fireEvent.click(link);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Saving, files and privacy',
    );
  });

  it('opens at a section when one is named', () => {
    render(<HelpButton />);
    act(() => {
      openGuide('15-files#privacy');
    });
    const article = screen.getByRole('article');
    expect(article.querySelector('#privacy')?.textContent).toBe('Privacy');
  });

  it('closes with Escape, the Close button and a backdrop click', () => {
    render(<HelpButton />);
    const open = (): void => {
      fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    };
    open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    open();
    const backdrop = screen.getByRole('dialog').parentElement;
    if (backdrop === null) throw new Error('dialog has no backdrop');
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with the ? key unless typing in a text field or the data grid', () => {
    render(
      <>
        <HelpButton />
        <input aria-label="field" />
        <div role="grid" tabIndex={0} aria-label="Data" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('field'), { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('grid', { name: 'Data' }), { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
