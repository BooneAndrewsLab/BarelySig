// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Separator } from '@/io/import/delimited';
import type * as ReadModule from '@/io/import/read';
import { DataFileError, type ReadDataFile, refusal } from '@/io/import/read';
import { readText } from '@/io/import/sheets';
import { createProject } from '@/model/project';
import type { Table } from '@/model/table';

import { App } from '../App';
import { project, store } from '../state/store';
import { OpenDataDialog } from './OpenDataDialog';

/** The worker's reading, on the main thread (jsdom has no workers). */
const readHere: ReadDataFile = async (file: File, separator?: Separator) => {
  const refused = refusal(file);
  if (refused !== null) throw new DataFileError(refused);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readText(bytes, file.name, separator);
};

vi.mock('@/io/import/read', async (original) => {
  const mod = await original<typeof ReadModule>();
  return { ...mod, readDataFile: (file: File, sep?: Separator) => readHere(file, sep) };
});

const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' });

function open(file: File) {
  const onCreate = vi.fn<(t: Table) => void>();
  const onClose = vi.fn();
  render(
    <OpenDataDialog
      file={file}
      read={readHere}
      decimal="."
      onCreate={onCreate}
      onClose={onClose}
    />,
  );
  return { onCreate, onClose };
}

const dialog = () => within(screen.getByRole('dialog', { name: 'Open data file' }));
const preview = () => within(screen.getByRole('table', { name: 'Preview' }));

describe('the Open data file dialog', () => {
  it('shows the guess and a preview, and creates the table on Create', async () => {
    const { onCreate } = open(csv('viability.csv', 'WT,KO\n1.5,2\n1.7,oops\n'));
    await dialog().findByText('best guess');
    expect(dialog().getByRole('radio', { name: /Each column is a group/ })).toBeChecked();
    expect(preview().getByRole('columnheader', { name: 'WT' })).toBeInTheDocument();
    expect(preview().getByText('oops').closest('td')).toHaveClass('not-number');
    expect(dialog().getByText(/Column table · Individual values · 2 groups/)).toBeInTheDocument();
    expect(dialog().getByText(/1 cell of text \(“oops”\)/)).toBeInTheDocument();
    expect(dialog().getByRole('textbox', { name: 'Title' })).toHaveValue('viability');
    fireEvent.click(dialog().getByRole('button', { name: 'Create' }));
    const t = onCreate.mock.calls[0]?.[0];
    expect(t?.title).toBe('viability');
    expect(t?.dataSets.map((d) => d.subcolumns[0])).toEqual([
      [1.5, 1.7],
      [2, null],
    ]);
  });

  it('reshapes long data, and follows the columns chosen', async () => {
    const { onCreate } = open(
      csv('long.csv', 'Genotype,Treatment,Value\nWT,A,1\nWT,B,2\nKO,A,3\nKO,B,4\n'),
    );
    await dialog().findByText('best guess');
    expect(dialog().getByRole('radio', { name: /One row per measurement/ })).toBeChecked();
    expect(dialog().getByText(/Reshaped from one row per measurement/)).toBeInTheDocument();
    expect(dialog().getByText(/Grouped table/)).toBeInTheDocument();
    fireEvent.change(dialog().getByRole('combobox', { name: 'Second factor' }), {
      target: { value: '' },
    });
    expect(dialog().getByText(/Column table · Individual values · 2 groups/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Create' }));
    expect(onCreate.mock.calls[0]?.[0].dataSets.map((d) => d.title)).toEqual(['WT', 'KO']);
  });

  it('switches the layout and swaps the factors', async () => {
    open(csv('g.csv', 'Genotype,WT,WT,KO,KO\nCtrl,1,2,3,4\nDrug,5,6,7,8\n'));
    await dialog().findByText('best guess');
    expect(dialog().getByRole('radio', { name: /two factors/ })).toBeChecked();
    expect(dialog().getByRole('radio', { name: /Summary data/ })).toBeDisabled();
    fireEvent.click(dialog().getByRole('checkbox', { name: 'Swap rows and groups' }));
    expect(preview().getByRole('columnheader', { name: 'Ctrl' })).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('radio', { name: /Each column is a group/ }));
    expect(dialog().getByText(/Column table/)).toBeInTheDocument();
  });

  it('recognises a group header over shared subgroup names as Nested, and swaps them', async () => {
    const { onCreate } = open(
      csv(
        'buds.csv',
        'Replicate 1,,Replicate 2,\nUnbudded,Small,Unbudded,Small\n16,17,25,15\n17,18,16,11\n',
      ),
    );
    await dialog().findByText('best guess');
    expect(dialog().getByRole('radio', { name: /named subgroups/ })).toBeChecked();
    expect(preview().getByRole('columnheader', { name: 'Replicate 1' })).toBeInTheDocument();
    expect(preview().getAllByRole('columnheader', { name: 'Unbudded' })).toHaveLength(2);
    expect(dialog().getByText(/Nested table/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('checkbox', { name: 'Swap groups and subgroups' }));
    expect(preview().getByRole('columnheader', { name: 'Unbudded' })).toBeInTheDocument();
    expect(preview().getAllByRole('columnheader', { name: 'Replicate 1' })).toHaveLength(2);
    fireEvent.click(dialog().getByRole('button', { name: 'Create' }));
    const t = onCreate.mock.calls[0]?.[0];
    expect(t?.type).toBe('nested');
    expect(t?.dataSets.map((d) => d.title)).toEqual(['Unbudded', 'Small']);
  });

  it('shows the rows skipped over the preview, and moves the start from its row numbers', async () => {
    open(
      csv(
        'buds.csv',
        'Young cells,,,\nReplicate 1,,Replicate 2,\nUnbudded,Small,Unbudded,Small\n16,17,25,15\n17,18,16,11\n',
      ),
    );
    await dialog().findByText('best guess');
    expect(screen.queryByRole('table', { name: 'Rows of the file' })).not.toBeInTheDocument();
    expect(preview().getByText('Young cells')).toBeInTheDocument();
    expect(preview().getByRole('button', { name: 'Start at row 1' })).toBeInTheDocument();
    expect(preview().getByRole('button', { name: 'Skip row 2' })).toBeInTheDocument();
    expect(preview().getByRole('button', { name: 'Skip row 3' })).toBeInTheDocument();
    expect(dialog().getByRole('radio', { name: /named subgroups/ })).toBeChecked();
    fireEvent.click(preview().getByRole('button', { name: 'Skip row 2' }));
    expect(preview().getByRole('button', { name: 'Start at row 2' })).toBeInTheDocument();
    expect(preview().getByText('Replicate 1')).toBeInTheDocument();
    expect(dialog().getByRole('radio', { name: /named subgroups/ })).not.toBeChecked();
    fireEvent.click(preview().getByRole('button', { name: 'Start at row 1' }));
    expect(preview().queryByRole('button', { name: /Start at row/ })).not.toBeInTheDocument();
    expect(preview().getByRole('button', { name: 'Skip row 1' })).toBeInTheDocument();
  });

  it('folds a long run of skipped rows', async () => {
    open(csv('long.csv', `${'Reader,Tecan\n'.repeat(7)}\nWT,KO,Het\n1,2,3\n4,5,6\n`));
    await dialog().findByText('best guess');
    expect(preview().getAllByRole('button', { name: /Start at row/ })).toHaveLength(5);
    fireEvent.click(preview().getByRole('button', { name: 'Show 3 more skipped rows' }));
    expect(preview().getAllByRole('button', { name: /Start at row/ })).toHaveLength(8);
    expect(preview().getByRole('button', { name: 'Skip row 9' })).toBeInTheDocument();
  });

  it('skips rows and reads with another separator on request', async () => {
    open(csv('semi.txt', 'Exported\n\nWT;KO\n1,5;2,5\n'));
    await dialog().findByText('best guess');
    expect(preview().getByRole('button', { name: 'Start at row 2' })).toBeInTheDocument();
    expect(preview().getByRole('button', { name: 'Skip row 3' })).toBeInTheDocument();
    expect(dialog().getByRole('combobox', { name: 'Separated by' })).toHaveValue(';');
    expect(dialog().getByRole('combobox', { name: 'Decimal mark' })).toHaveValue(',');
    expect(preview().getByText('1,5')).toBeInTheDocument();
    fireEvent.change(dialog().getByRole('combobox', { name: 'Separated by' }), {
      target: { value: ',' },
    });
    await waitFor(() => {
      expect(dialog().getByRole('combobox', { name: 'Separated by' })).toHaveValue(',');
    });
  });

  it('says why a file can’t be opened', async () => {
    open(new File(['x'], 'table.docx'));
    expect(await dialog().findByText(/not documents/)).toBeInTheDocument();
    expect(dialog().getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('says when a sheet has no numbers', async () => {
    open(csv('words.csv', 'a,b\nc,d\n'));
    expect(await dialog().findByText(/No numbers found/)).toBeInTheDocument();
    fireEvent.click(dialog().getByRole('button', { name: 'Start at row 2' }));
    expect(dialog().getByRole('button', { name: 'Start at row 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(dialog().getByRole('button', { name: 'Create' })).toBeDisabled();
  });
});

describe('opening a data file in the app', () => {
  beforeEach(() => {
    act(() => {
      store.load(createProject('Untitled project'));
    });
  });

  it('makes a new project named after the file from the start screen, as one undo step', async () => {
    const { container } = render(<App />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file input');
    expect(input.accept).toContain('.xlsx');
    fireEvent.change(input, { target: { files: [csv('MTT day 3.csv', 'WT,KO\n1,2\n3,4\n')] } });
    fireEvent.click(await dialog().findByRole('button', { name: 'Create' }));
    const p = project(store.getState());
    expect(p.name).toBe('MTT day 3');
    expect([...p.tables.values()].map((t) => t.title)).toEqual(['MTT day 3']);
    expect(screen.getByText('Opened “MTT day 3.csv” as a new experiment: 4 values.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Open data file' }));
    expect(project(store.getState()).tables.size).toBe(0);
    expect(project(store.getState()).name).toBe('Untitled project');
  });

  it('adds an experiment to the open project from a drop', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Column table/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'New experiment' })).getByRole('button', {
        name: 'Create',
      }),
    );
    const files = [csv('more.csv', 'A,B\n1,2\n')];
    fireEvent.drop(window, { dataTransfer: { files, types: ['Files'] } });
    fireEvent.click(await dialog().findByRole('button', { name: 'Create' }));
    const p = project(store.getState());
    expect(p.name).toBe('Untitled project');
    expect([...p.tables.values()].map((t) => t.title)).toEqual(['Data 1', 'more']);
  });

  it('opens a data file from the New experiment dialog', () => {
    const { container } = render(<App />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file input');
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: /Grouped table/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open a data file…' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(click).toHaveBeenCalled();
  });
});
