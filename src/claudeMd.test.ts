import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CLAUDE.md is read into every coding session. It holds decisions, rules,
// lessons and pointers; what a release did belongs in the GitHub Release
// notes and open work in issues, so neither may creep back in here as a
// Status section or a paragraph per release (which is how PlasmidPop's
// grew to 270 lines). There is no line budget: what matters belongs in.
const text = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
const lines = text.split('\n');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('CLAUDE.md', () => {
  it('carries no Status section or per-release paragraphs', () => {
    expect(lines.some((line) => /^##\s+Status/.test(line))).toBe(false);
    expect(lines.filter((line) => /^\*\*\d+\.\d+\.\d+\*\*/.test(line))).toEqual([]);
  });

  it("names exactly one current version, package.json's", () => {
    const versions = text.match(/current is (\d+\.\d+\.\d+)/g) ?? [];
    expect(versions).toEqual([`current is ${pkg.version}`]);
  });
});
