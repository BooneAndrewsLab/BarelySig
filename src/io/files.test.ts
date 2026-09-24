// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { download, fileNameFor, projectFile } from './files';

describe('files', () => {
  it('makes a safe file name', () => {
    expect(fileNameFor('Knockout: day 3/4')).toBe('Knockout_ day 3_4.bsig');
    expect(fileNameFor('   ')).toBe('Untitled project.bsig');
  });

  it('writes through the save picker where there is one, and drops the handle', async () => {
    const write = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.resolve({ write, close }),
      } as unknown as FileSystemFileHandle),
    );
    expect(await download('a.bsig', '{}', { showSaveFilePicker: picker })).toBe(true);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'a.bsig' }));
    expect(write).toHaveBeenCalledWith('{}');
    expect(close).toHaveBeenCalled();
  });

  it('reports a cancelled save picker as not saved', async () => {
    const picker = vi.fn(() => Promise.reject(new DOMException('cancelled', 'AbortError')));
    expect(await download('a.bsig', '{}', { showSaveFilePicker: picker })).toBe(false);
  });

  it('falls back to a download link', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    expect(await download('a.bsig', '{}', {})).toBe(true);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('picks the .bsig among dropped files', () => {
    const a = new File(['x'], 'notes.txt');
    const b = new File(['y'], 'Project.BSIG');
    expect(projectFile([a, b])).toBe(b);
    expect(projectFile([a])).toBe(a);
    expect(projectFile([])).toBeNull();
  });
});
