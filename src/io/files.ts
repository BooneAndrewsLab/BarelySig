/**
 * Getting a project out of and into the app as a file (item 03). Saving
 * is download only, as PlasmidPop's item 24: `showSaveFilePicker` is used
 * for that one write where it exists and its handle dropped at once;
 * elsewhere an `<a download>`. Opening reads a `File`.
 */
import { EXTENSION } from './bsig';
import { dataFileKind, isDocument } from './import/sheets';

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

/**
 * What to open from dropped or picked files: the first `.bsig`, else a
 * figure, else a data file (item 10) or a document (whose message asks for the
 * spreadsheet), else any file, which the project reader explains it can't
 * open.
 */
export function pickFile(
  files: Iterable<File>,
): { readonly kind: 'project' | 'data'; readonly file: File } | null {
  const all = [...files];
  const named = (ext: string) => all.find((f) => f.name.toLowerCase().endsWith(ext));
  const project = named(EXTENSION) ?? named('.svg') ?? named('.png');
  if (project) return { kind: 'project', file: project };
  const data =
    all.find((f) => dataFileKind(f.name) !== null) ?? all.find((f) => isDocument(f.name));
  if (data) return { kind: 'data', file: data };
  const first = all[0];
  return first ? { kind: 'project', file: first } : null;
}
