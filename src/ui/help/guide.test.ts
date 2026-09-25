import { describe, expect, it } from 'vitest';

import { REGISTRY } from '@/analyses/registry';

import { ANALYSIS_PAGE, GUIDE, guidePage } from './guide';
import {
  type Block,
  type Inline,
  guideLinkTarget,
  headingSlug,
  parseMarkdown,
  plainText,
} from './markdown';

function links(inlines: readonly Inline[]): string[] {
  return inlines.flatMap((i) =>
    i.kind === 'link' ? [i.href, ...links(i.children)] : 'children' in i ? links(i.children) : [],
  );
}

function blockLinks(block: Block): string[] {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return links(block.children);
    case 'list':
      return block.items.flatMap(links);
    case 'table':
      return [...block.header.flatMap(links), ...block.rows.flat().flatMap(links)];
    case 'code':
      return [];
  }
}

describe('the user guide (#34)', () => {
  it('has a titled page per file with unique ids', () => {
    expect(GUIDE.length).toBeGreaterThanOrEqual(16);
    for (const p of GUIDE) {
      expect(p.title).not.toBe(p.id);
      expect(p.markdown.startsWith(`# ${p.title}`)).toBe(true);
    }
    expect(new Set(GUIDE.map((p) => p.id)).size).toBe(GUIDE.length);
  });

  it('only links to pages and sections that exist, and never off the site', () => {
    for (const p of GUIDE) {
      for (const href of parseMarkdown(p.markdown).flatMap(blockLinks)) {
        expect(href, `${p.id} links off the site: ${href}`).not.toMatch(/^[a-z]+:/i);
        const target = guideLinkTarget(href);
        if (target === null) continue;
        const page = guidePage(target);
        expect(page, `${p.id} links to ${href}`).toBeDefined();
        const section = href.split('#')[1];
        if (section && page) {
          const slugs = parseMarkdown(page.markdown).flatMap((b) =>
            b.kind === 'heading' ? [headingSlug(plainText(b.children))] : [],
          );
          expect(slugs, `${p.id} links to ${href}`).toContain(section);
        }
      }
    }
  });

  it('has a page for every analysis a user can run', () => {
    for (const kind of Object.keys(REGISTRY)) {
      if (kind === 'graph-summary') continue;
      const id = ANALYSIS_PAGE[kind as keyof typeof ANALYSIS_PAGE];
      expect(guidePage(id), kind).toBeDefined();
    }
  });

  it('explains the words a results sheet and a graph use', () => {
    const all = GUIDE.map((p) => p.markdown).join('\n');
    for (const word of ['SD', 'SEM', '95% CI', 'P value', 'paired', 'Welch', 'adjusted', 'ns'])
      expect(all).toContain(word);
    for (const keys of ['Ctrl+S', 'Ctrl+O', 'Ctrl+Z', 'Ctrl+V', 'Ctrl+E'])
      expect(all).toContain(keys);
  });
});
