/**
 * Figure recipes (#43, note 05): an exported figure carries what made it,
 * a `.bsig` document cut down to the graph, its table, the analyses it
 * draws and their results, with the theme resolved so a later change to
 * a default never changes the figure. It also says, in the places file
 * viewers show, that it was made with BarelySig and where to open it.
 */
import { summaryId } from '@/graphs/data';
import { iTXt, iTXtPlain, readCompressedText, readText, tEXt } from '@/graphs/png';
import { resolveTheme, themeJson } from '@/graphs/themes';
import { escapeXml } from '@/graphs/svg';
import { type Id, newId } from '@/model/ids';
import type { EngineInfo } from '@/model/inputs';
import type { Graph, Project } from '@/model/project';
import type { ResultEntry } from '@/model/recompute';

import { BsigError, type SavedProject, readBsig, writeBsig } from './bsig';

export const APP_URL: string =
  (import.meta.env as { VITE_APP_URL?: string }).VITE_APP_URL ??
  'https://booneandrewslab.github.io/BarelySig/';

const NS = 'https://barelysig.org/ns/recipe/1';
const PNG_KEY = 'barelysig-recipe';

/**
 * The project a figure needs: its graph (theme resolved, and its group-label
 * angle too if it was left automatic, note 12), table, drawn analyses and
 * their results.
 */
export function recipeProject(
  project: Project,
  graph: Graph,
  results: ReadonlyMap<Id, ResultEntry>,
  /** The angle `layoutColumn` drew with, when the graph's own setting was automatic. */
  resolvedXAngle?: 45 | 90,
): { readonly project: Project; readonly results: Map<Id, ResultEntry> } {
  const tableId = graph.source.kind === 'table' ? graph.source.table : null;
  const table = tableId ? project.tables.get(tableId) : undefined;
  const analyses = graph.analyses.flatMap((id) => {
    const a = project.analyses.get(id);
    return a?.input.kind === 'table' && a.input.table === tableId ? [a] : [];
  });
  const fixed: Graph = {
    ...graph,
    analyses: analyses.map((a) => a.id),
    theme: { kind: 'fixed', theme: themeJson(resolveTheme(graph.theme)) },
    format:
      graph.format.xAngle === undefined && resolvedXAngle !== undefined
        ? { ...graph.format, xAngle: resolvedXAngle }
        : graph.format,
  };
  const kept = new Map<Id, ResultEntry>();
  for (const id of [...analyses.map((a) => a.id), summaryId(graph.id)]) {
    const r = results.get(id);
    if (r) kept.set(id, r);
  }
  return {
    project: {
      id: newId('p'),
      name: graph.title,
      tables: new Map(table ? [[table.id, table]] : []),
      analyses: new Map(analyses.map((a) => [a.id, a])),
      graphs: new Map([[fixed.id, fixed]]),
      layouts: new Map(),
      order: {
        tables: table ? [table.id] : [],
        analyses: analyses.map((a) => a.id),
        graphs: [fixed.id],
        layouts: [],
      },
      exports: [],
    },
    results: kept,
  };
}

export interface Origin {
  readonly app: string;
  readonly engine: EngineInfo | null;
  readonly title: string;
  readonly withData: boolean;
}

/** The sentence every export carries, with or without its data. */
export function originSentence(o: Origin): string {
  const made = `Made with BarelySig ${o.app}${o.engine ? ` (WebR ${o.engine.webr}, R ${o.engine.r})` : ''}.`;
  return o.withData
    ? `${made} Open this file in BarelySig (${APP_URL}) to edit the figure; it contains the data and settings that made it.`
    : `${made} The data were not included, so it can’t be reopened; ${APP_URL}`;
}

// --- compression ----------------------------------------------------------------

async function run(
  stream: CompressionStream | DecompressionStream,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  // A plain stream rather than Blob.stream(), which not every environment has.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
  const reader = source.pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(r.value);
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of parts) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

const toBase64 = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// --- SVG ------------------------------------------------------------------------

function rdf(o: Origin): string {
  const sentence = escapeXml(originSentence(o));
  return (
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">` +
    `<rdf:Description rdf:about="" xmp:CreatorTool="BarelySig ${escapeXml(o.app)}">` +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(o.title)}</rdf:li></rdf:Alt></dc:title>` +
    `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${sentence}</rdf:li></rdf:Alt></dc:description>` +
    `<dc:source>${escapeXml(APP_URL)}</dc:source>` +
    `</rdf:Description></rdf:RDF>`
  );
}

/** The SVG's origin comment, and its <title>, <desc> and <metadata> (with the recipe when included). */
export async function svgMeta(
  o: Origin,
  recipe: string | null,
): Promise<{ prolog: string; head: string }> {
  const sentence = originSentence(o);
  const payload = recipe
    ? `<barelysig:recipe xmlns:barelysig="${NS}" encoding="gzip+base64">${toBase64(await run(new CompressionStream('gzip'), new TextEncoder().encode(recipe)))}</barelysig:recipe>`
    : '';
  return {
    prolog: `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${sentence.replace(/--/g, '—')} -->\n`,
    head: `<title>${escapeXml(o.title)}</title><desc>${escapeXml(sentence)}</desc><metadata>${rdf(o)}${payload}</metadata>`,
  };
}

// --- PNG ------------------------------------------------------------------------

function xmp(o: Origin): string {
  return `<?xpacket begin="\u{feff}" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">${rdf(o)}</x:xmpmeta><?xpacket end="r"?>`;
}

/** Latin-1 text for tEXt chunks: anything outside it becomes "?". */
const latin1Safe = (s: string) =>
  s.replace(/[^ -ÿ]/g, (c) => (c === '’' ? "'" : c === '—' ? '-' : '?'));

export async function pngMeta(o: Origin, recipe: string | null): Promise<Uint8Array[]> {
  const chunks = [
    tEXt('Software', `BarelySig ${o.app}`),
    tEXt('Title', latin1Safe(o.title)),
    tEXt('Description', latin1Safe(originSentence(o))),
    iTXtPlain('XML:com.adobe.xmp', xmp(o)),
  ];
  if (recipe) {
    // PNG's compressed text is zlib ("deflate" in the Compression Streams API).
    chunks.push(
      iTXt(
        PNG_KEY,
        await run(new CompressionStream('deflate'), new TextEncoder().encode(recipe)),
        true,
      ),
    );
  }
  return chunks;
}

// --- reading back -----------------------------------------------------------------

export type FigureKind = 'svg' | 'png';

export function figureKind(name: string, head: Uint8Array): FigureKind | null {
  if (head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71) return 'png';
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) return 'svg';
  const text = new TextDecoder().decode(head.subarray(0, 512));
  return /<svg[\s>]/.test(text) ? 'svg' : null;
}

/** The project a figure carries, or a message saying why there is none. */
export async function readFigure(kind: FigureKind, bytes: Uint8Array): Promise<SavedProject> {
  let recipe: string | null = null;
  let madeHere: boolean;
  if (kind === 'png') {
    madeHere = (readText(bytes, 'Software') ?? '').startsWith('BarelySig');
    const packed = readCompressedText(bytes, PNG_KEY);
    if (packed)
      recipe = new TextDecoder().decode(await run(new DecompressionStream('deflate'), packed));
  } else {
    const text = new TextDecoder().decode(bytes);
    madeHere = text.includes('BarelySig');
    const m = /<barelysig:recipe[^>]*encoding="gzip\+base64"[^>]*>([^<]+)<\/barelysig:recipe>/.exec(
      text,
    );
    if (m?.[1])
      recipe = new TextDecoder().decode(
        await run(new DecompressionStream('gzip'), fromBase64(m[1].trim())),
      );
  }
  if (recipe === null) {
    throw new BsigError(
      madeHere
        ? 'This figure was exported without its data, so it can’t be reopened. Open the project it came from instead.'
        : 'This image wasn’t made with BarelySig, so there is nothing to reopen.',
    );
  }
  return readBsig(recipe);
}

/** The recipe text for a graph. */
export function recipeText(
  project: Project,
  graph: Graph,
  results: ReadonlyMap<Id, ResultEntry>,
  engine: EngineInfo | null,
  app: string,
  resolvedXAngle?: 45 | 90,
): string {
  const r = recipeProject(project, graph, results, resolvedXAngle);
  return writeBsig({ project: r.project, results: r.results, engine, app });
}
