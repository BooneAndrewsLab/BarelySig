/**
 * Getting a project out of and into the app as a file (item 03). Saving
 * is download only, as PlasmidPop's item 24: `showSaveFilePicker` is used
 * for that one write where it exists and its handle dropped at once;
 * elsewhere an `<a download>`. Opening reads a `File`.
 */
import { EXTENSION } from './bsig';

/** A file-system-safe name, with the extension (a project's by default). */
export function fileNameFor(
  name: string,
  extension: string = EXTENSION,
  fallback = 'Untitled project',
): string {
  const stem =
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ') || fallback;
  return `${stem}${extension}`;
}

/** What kind of file a download is, for the save dialog. */
export interface FileKind {
  readonly description: string;
  readonly mime: string;
  readonly extension: string;
}

export const BSIG_FILE: FileKind = {
  description: 'BarelySig project',
  mime: 'application/json',
  extension: EXTENSION,
};

interface SaveWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: readonly { description: string; accept: Record<string, readonly string[]> }[];
    id: string;
  }) => Promise<FileSystemFileHandle>;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

function anchorDownload(fileName: string, data: string | Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
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

/** Saves a file as a download; resolves false when the user cancelled the save dialog. */
export async function download(
  fileName: string,
  data: string | Uint8Array,
  w: SaveWindow = globalThis as SaveWindow,
  kind: FileKind = BSIG_FILE,
): Promise<boolean> {
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: kind.description, accept: { [kind.mime]: [kind.extension] } }],
        id: kind.extension === EXTENSION ? 'barelysig-save' : 'barelysig-export',
      });
      const out = await handle.createWritable();
      try {
        await out.write(data as FileSystemWriteChunkType);
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
  anchorDownload(fileName, data, kind.mime);
  return true;
}

/** The first `.bsig` among dropped or picked files (any file if none is named so). */
export function projectFile(files: Iterable<File>): File | null {
  const all = [...files];
  return all.find((f) => f.name.toLowerCase().endsWith(EXTENSION)) ?? all[0] ?? null;
}
