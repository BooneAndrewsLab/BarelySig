/**
 * Getting a project out of and into the app as a file (item 03). Saving
 * is download only, as PlasmidPop's item 24: `showSaveFilePicker` is used
 * for that one write where it exists and its handle dropped at once;
 * elsewhere an `<a download>`. Opening reads a `File`.
 */
import { EXTENSION } from './bsig';

/** A file-system-safe name for a project, with the extension. */
export function fileNameFor(name: string): string {
  const stem =
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ') || 'Untitled project';
  return `${stem}${EXTENSION}`;
}

interface SaveWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: readonly { description: string; accept: Record<string, readonly string[]> }[];
    id: string;
  }) => Promise<FileSystemFileHandle>;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

function anchorDownload(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Saves text as a download; resolves false when the user cancelled the save dialog. */
export async function download(
  fileName: string,
  text: string,
  w: SaveWindow = globalThis as SaveWindow,
): Promise<boolean> {
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'BarelySig project', accept: { 'application/json': [EXTENSION] } }],
        id: 'barelysig-save',
      });
      const out = await handle.createWritable();
      try {
        await out.write(text);
      } finally {
        await out.close();
      }
      // The handle goes out of scope here: nothing keeps a way back to the file.
      return true;
    } catch (e: unknown) {
      if (isAbort(e)) return false;
      throw e;
    }
  }
  anchorDownload(fileName, text);
  return true;
}

/** The first `.bsig` among dropped or picked files (any file if none is named so). */
export function projectFile(files: Iterable<File>): File | null {
  const all = [...files];
  return all.find((f) => f.name.toLowerCase().endsWith(EXTENSION)) ?? all[0] ?? null;
}
