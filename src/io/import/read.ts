/**
 * Reading a data file from the main thread (item 10): the bytes go to a
 * worker made for this file, which posts back the sheets and is ended.
 */
import type { Separator } from './delimited';
import { type DataFileKind, MAX_BYTES, type SourceBook, dataFileKind, isDocument } from './sheets';

export interface ReadRequest {
  readonly kind: DataFileKind;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly separator?: Separator;
}

export type ReadResponse =
  | { readonly ok: true; readonly book: SourceBook }
  | { readonly ok: false; readonly message: string };

/** Why a file can't be opened, in words that finish "“name”: …". */
export class DataFileError extends Error {}

/** Reads a data file into sheets; the separator re-reads a text file with that one. */
export type ReadDataFile = (file: File, separator?: Separator) => Promise<SourceBook>;

function inWorker(req: ReadRequest): Promise<ReadResponse> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<ReadResponse>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve({ ok: false, message: 'it couldn’t be read.' });
    };
    worker.postMessage(req, [req.bytes.buffer]);
  });
}

/** What `readDataFile` checks before any reading; null when the file may be read. */
export function refusal(file: { readonly name: string; readonly size: number }): string | null {
  if (isDocument(file.name)) {
    return 'BarelySig reads spreadsheets and text files, not documents. Copy the table into a spreadsheet and save it as .xlsx or .csv, or paste it into a table.';
  }
  if (dataFileKind(file.name) === null) {
    return 'BarelySig opens .bsig projects, figures it exported, and data files (.csv, .tsv, .txt, .xlsx, .xls, .ods).';
  }
  if (file.size > MAX_BYTES) return 'it is over 50 MB, too big to open here.';
  if (file.size === 0) return 'the file is empty.';
  return null;
}

export const readDataFile: ReadDataFile = async (file, separator) => {
  const refused = refusal(file);
  const kind = dataFileKind(file.name);
  if (refused !== null || kind === null) throw new DataFileError(refused ?? '');
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new DataFileError('it couldn’t be read.');
  }
  const res = await inWorker({
    kind,
    name: file.name,
    bytes,
    ...(separator ? { separator } : {}),
  });
  if (!res.ok) throw new DataFileError(res.message);
  if (res.book.sheets.length === 0) throw new DataFileError('there is nothing in it to read.');
  return res.book;
};
