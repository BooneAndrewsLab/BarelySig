// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyEdit } from '@/model/edits';
import { createProject } from '@/model/project';
import { createColumnTable as createColumnTableModel } from '@/model/table';

import { App } from './App';
import { getSession } from './state/session';
import { project, store } from './state/store';

beforeEach(() => {
  act(() => {
    store.load(createProject('Untitled project'));
  });
});

const nav = () => within(screen.getByRole('navigation', { name: 'Experiments' }));
const onPage = () => within(screen.getByRole('navigation', { name: 'On this page' }));

function createColumnTable() {
  fireEvent.click(screen.getByRole('button', { name: /Column table/ }));
  const dialog = screen.getByRole('dialog', { name: 'New experiment' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
}

describe('app shell', () => {
  it('starts on the home screen and creates a table from it', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Start with a table' })).toBeInTheDocument();
    createColumnTable();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Data 1' })).toBeInTheDocument();
    expect(screen.getByText(/Column table, individual values/)).toBeInTheDocument();
    expect(nav().getByRole('button', { name: 'Data 1' })).toHaveAttribute('aria-current', 'page');
    // The page's first section is the data, and the next steps follow it.
    expect(screen.getByRole('heading', { level: 2, name: 'Data' })).toBeInTheDocument();
    expect(onPage().getByRole('button', { name: /Data/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analyze…/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New graph/ })).toBeInTheDocument();
  });

  it('keeps a description of the experiment, as one undo step', () => {
    render(<App />);
    createColumnTable();
    fireEvent.click(screen.getByRole('button', { name: /Add a description/ }));
    const box = screen.getByRole('textbox', { name: 'Description' });
    fireEvent.change(box, { target: { value: 'HeLa, MTT assay' } });
    fireEvent.blur(box);
    expect(screen.getByRole('button', { name: 'HeLa, MTT assay' })).toBeInTheDocument();
    expect([...project(store.getState()).tables.values()][0]?.notes).toBe('HeLa, MTT assay');
    fireEvent.click(screen.getByRole('button', { name: 'Undo Edit table info' }));
    expect(screen.getByRole('button', { name: /Add a description/ })).toBeInTheDocument();
  });

  it('builds a Grouped table of summary data from the dialog', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Grouped table/ }));
    const dialog = screen.getByRole('dialog', { name: 'New experiment' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Summary data/ }));
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Summary data' }), {
      target: { value: 'mean-sem-n' },
    });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Growth' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    const t = [...project(store.getState()).tables.values()][0];
    expect(t).toMatchObject({
      type: 'grouped',
      title: 'Growth',
      format: { kind: 'summary', stats: 'mean-sem-n' },
    });
  });

  it('cancels the dialog with Escape', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Grouped table/ }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(project(store.getState()).tables.size).toBe(0);
  });

  it('renames, duplicates and deletes tables, and undo brings a deleted one back', () => {
    render(<App />);
    createColumnTable();
    fireEvent.click(nav().getByRole('button', { name: 'More for Data 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = nav().getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Viability' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(nav().getByRole('button', { name: 'Viability' })).toBeInTheDocument();

    fireEvent.click(nav().getByRole('button', { name: 'More for Viability' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Viability (copy)' })).toBeInTheDocument();

    fireEvent.click(nav().getByRole('button', { name: 'More for Viability (copy)' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(nav().queryByRole('button', { name: 'Viability (copy)' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Deleted “Viability (copy)”. Undo brings it back',
    );

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(nav().getByRole('button', { name: 'Viability (copy)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo Delete table' })).toBeEnabled();
  });

  it('renames the project from the bar, as one undo step', () => {
    render(<App />);
    createColumnTable();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Untitled project' }));
    const input = screen.getByRole('textbox', { name: 'Project name' });
    fireEvent.change(input, { target: { value: 'Knockout screen' } });
    fireEvent.blur(input);
    expect(screen.getByRole('button', { name: 'Knockout screen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Rename project' }));
    expect(screen.getByRole('button', { name: 'Untitled project' })).toBeInTheDocument();
  });

  it('clicking the logo or project name closes the project and goes to the front page', async () => {
    render(<App />);
    createColumnTable();
    expect(screen.getByRole('heading', { level: 1, name: 'Data 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Untitled project' }));
    await screen.findByRole('heading', { name: 'Start with a table' });
    expect(screen.queryByRole('button', { name: 'Untitled project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Experiments' })).not.toBeInTheDocument();
  });

  it('opens the example project, one experiment per table', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
    await screen.findByRole('heading', { level: 1, name: 'Cell viability (example data)' });
    // Two experiments, each a table with an analysis and a graph.
    expect(
      nav().getAllByRole('button', {
        name: /^(Cell viability|Growth by genotype) \(example data\)$/,
      }),
    ).toHaveLength(2);
    expect(nav().getByText('One-way ANOVA · 1 graph')).toBeInTheDocument();
    expect(nav().getByText('Two-way ANOVA · 1 graph')).toBeInTheDocument();
    // The open one's page: data, its analysis, its graph, numbered in that order.
    const sections = onPage().getAllByRole('button');
    expect(sections.map((b) => b.textContent)).toEqual([
      '1Data',
      '2One-way ANOVA of Cell viability (example data)',
      '3Cell viability (example data)',
    ]);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One-way ANOVA of Cell viability (example data)',
      }),
    ).toBeInTheDocument();
  });

  it('scrolls to a section when it is shown, and not when the data change', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
    await screen.findByRole('heading', { level: 1, name: 'Cell viability (example data)' });
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    fireEvent.click(onPage().getByRole('button', { name: /One-way ANOVA/ }));
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.contexts[0]).toHaveProperty('id', expect.stringMatching(/^section-/));
    // The same entry again scrolls again; an edit doesn't.
    fireEvent.click(onPage().getByRole('button', { name: /One-way ANOVA/ }));
    expect(scrolled).toHaveBeenCalledTimes(2);
    act(() => {
      store.edit({ op: 'renameProject', name: 'Renamed' });
    });
    expect(scrolled).toHaveBeenCalledTimes(2);
    scrolled.mockRestore();
  });

  it('shows the other experiment when its entry is clicked', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
    await screen.findByRole('heading', { level: 1, name: 'Cell viability (example data)' });
    fireEvent.click(nav().getByRole('button', { name: 'Growth by genotype (example data)' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Growth by genotype (example data)' }),
    ).toBeInTheDocument();
    expect(
      nav().getByRole('button', { name: 'Growth by genotype (example data)' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

describe('margin notes (#56)', () => {
  it('shows a note beside each section, and hides them all, remembered in this browser', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
    await screen.findByRole('heading', { level: 1, name: 'Cell viability (example data)' });
    expect(screen.getByText('Replicates, not means')).toBeInTheDocument();
    expect(screen.getByText(/^Tukey’s test compares every pair of groups/)).toBeInTheDocument();
    expect(screen.getByText(/^Error bars show the SD/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide notes' }));
    expect(screen.queryByText('Replicates, not means')).not.toBeInTheDocument();
    expect(localStorage.getItem('barelysig.notes')).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Show notes' }));
    expect(screen.getByText('Replicates, not means')).toBeInTheDocument();
    expect(localStorage.getItem('barelysig.notes')).toBeNull();
  });
});

describe('closing a project', () => {
  // Closing saves to IndexedDB first; under a full parallel test run that can take over the
  // default second.
  const slow = { timeout: 5000 };

  it('returns to the start screen, which lists it to reopen', async () => {
    render(<App />);
    // No project is open on the front page: nothing to close, undo or name.
    expect(screen.getByRole('heading', { name: 'Start with a table' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projects' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(screen.queryByText('Untitled project')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }));
    await screen.findByRole('heading', { level: 1, name: 'Cell viability (example data)' }, slow);
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    await screen.findByRole('heading', { name: 'Start with a table' }, slow);
    const recent = await screen.findByRole('region', { name: 'Your projects' }, slow);
    // Earlier tests saved example projects too; the newest comes first.
    const [newest] = within(recent).getAllByRole('button', { name: /Example project/ });
    if (!newest) throw new Error('not listed');
    fireEvent.click(newest);
    await screen.findByRole('heading', { level: 1, name: 'Cell viability (example data)' }, slow);
  });
});

describe('the project list', () => {
  const slow = { timeout: 5000 };

  async function keep(name: string, opts: { downloaded?: boolean } = {}) {
    const p = applyEdit(createProject(name), {
      op: 'addTable',
      table: createColumnTableModel({ title: 'T', groups: ['A'], rows: 1 }),
    });
    await getSession().storage.save(p, '1.0.0', opts);
    return p;
  }

  const row = (list: HTMLElement, name: string) => {
    const item = within(list)
      .getAllByRole('listitem')
      .find((li) => li.querySelector('.proj-name')?.textContent === name);
    if (!item) throw new Error(`${name} is not listed`);
    return within(item);
  };

  it('says what each project holds, and renames and duplicates one without opening it', async () => {
    await keep('Western blots');
    render(<App />);
    const list = await screen.findByRole('region', { name: 'Your projects' }, slow);
    await within(list).findByText('Western blots', {}, slow);
    expect(row(list, 'Western blots').getByText(/1 experiment/)).toHaveTextContent(
      '1 experiment · edited just now · not downloaded',
    );

    fireEvent.click(
      row(list, 'Western blots').getByRole('button', { name: 'More for Western blots' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = screen.getByRole('textbox', { name: 'Project name' });
    fireEvent.change(box, { target: { value: 'Westerns, June' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await within(list).findByText('Westerns, June', {}, slow);

    fireEvent.click(
      row(list, 'Westerns, June').getByRole('button', { name: 'More for Westerns, June' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await within(list).findByText('Westerns, June (copy)', {}, slow);
  });

  it('warns before deleting a project that was never downloaded', async () => {
    await keep('Only here');
    render(<App />);
    const list = await screen.findByRole('region', { name: 'Your projects' }, slow);
    await within(list).findByText('Only here', {}, slow);
    fireEvent.click(row(list, 'Only here').getByRole('button', { name: 'More for Only here' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Only here”?' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'You haven’t downloaded this project since it last changed.',
    );
    expect(within(dialog).getByRole('button', { name: 'Download a copy' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete without a copy' }));
    await vi.waitFor(() => {
      expect(within(list).queryByText('Only here')).not.toBeInTheDocument();
    }, slow);
    expect(screen.getByRole('status')).toHaveTextContent('Deleted “Only here” from this browser.');
  });

  it('deletes a downloaded project without the warning', async () => {
    await keep('Filed away', { downloaded: true });
    render(<App />);
    const list = await screen.findByRole('region', { name: 'Your projects' }, slow);
    await within(list).findByText('Filed away', {}, slow);
    expect(row(list, 'Filed away').queryByText(/not downloaded/)).not.toBeInTheDocument();
    fireEvent.click(row(list, 'Filed away').getByRole('button', { name: 'More for Filed away' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Filed away”?' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => {
      expect(within(list).queryByText('Filed away')).not.toBeInTheDocument();
    }, slow);
  });

  it('deletes the open project once closed, from the Projects button', async () => {
    const p = await keep('Open one');
    await act(() => getSession().openStored(p.id));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    const list = await screen.findByRole('region', { name: 'Your projects' }, slow);
    await within(list).findByText('Open one', {}, slow);
    fireEvent.click(row(list, 'Open one').getByRole('button', { name: 'More for Open one' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Open one”?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete without a copy' }));
    await vi.waitFor(async () => {
      expect(await getSession().storage.load(p.id)).toBeNull();
    }, slow);
  });

  it('filters by name once the list is long', async () => {
    for (let i = 1; i <= 7; i += 1) await keep(`Plate ${String(i)}`);
    await keep('Mouse cohort');
    render(<App />);
    const list = await screen.findByRole('region', { name: 'Your projects' }, slow);
    await within(list).findByText('Mouse cohort', {}, slow);
    fireEvent.change(within(list).getByRole('searchbox', { name: 'Find a project' }), {
      target: { value: 'mouse' },
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(within(list).getByRole('searchbox', { name: 'Find a project' }), {
      target: { value: 'zebrafish' },
    });
    expect(within(list).getByText('No project’s name contains “zebrafish”.')).toBeInTheDocument();
  });
});
