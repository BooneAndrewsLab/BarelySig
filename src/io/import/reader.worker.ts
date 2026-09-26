/**
 * Reads a data file off the main thread (item 10, decision 4). Text is
 * parsed here; a spreadsheet loads SheetJS on first use, so the library
 * stays out of the app shell.
 */
import type { ReadRequest, ReadResponse } from './read';
import { readText } from './sheets';

async function handle(req: ReadRequest): Promise<ReadResponse> {
  try {
    if (req.kind === 'text')
      return { ok: true, book: readText(req.bytes, req.name, req.separator) };
    const { readWorkbook, WorkbookError } = await import('./workbook');
    try {
      return { ok: true, book: readWorkbook(req.bytes) };
    } catch (e: unknown) {
      if (e instanceof WorkbookError) return { ok: false, message: e.message };
      throw e;
    }
  } catch {
    return { ok: false, message: 'it couldn’t be read.' };
  }
}

self.onmessage = (e: MessageEvent<ReadRequest>) => {
  void handle(e.data).then((res) => {
    self.postMessage(res);
  });
};
