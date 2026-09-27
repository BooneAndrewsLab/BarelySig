# 16. Key numbers first, every number on request

Written 2026-09-26 before building #57, milestone 9 (UI revamp).

## What was asked

Note 08's decision 10 put the reading and its key numbers in a band across
each analysis section, but left Prism's full label/value tables always
visible below them — for a one-way ANOVA with a normality check and
post-hoc comparisons, that is several screens before the graph comes into
view. #57 asks to show the reading and the one table a reader needs first
(for ANOVA, the comparisons), with the rest behind an **All numbers**
disclosure, its open/closed state remembered per section.

## The idea

Every `*View` in `ResultsSection.tsx` already renders, in order: `Headline`
(the reading + key-number figures, unchanged), `method` (one sentence
naming the test), then `.results-grid` (Prism's tables, as `Sections`
label/value cards and `Grid` column tables). That grid is now split in
two:

- **Primary**, shown as before, directly under the method sentence: the
  one table a reader comes back to. For a test with pairwise comparisons
  (one-way ANOVA, two-way ANOVA, Kruskal-Wallis, nested one-way ANOVA)
  that is the **Multiple comparisons** grid — the table the headline's
  "2 of 3 comparisons significant" figure already summarises, and the
  thing a "does A differ from B" question actually needs. When there are
  no comparisons to show (only two groups, comparisons not requested),
  primary is empty and everything falls to All numbers.
- **Everything else** — the ANOVA table, Brown-Forsythe/Bartlett SD
  tests, cell means, data summary, test details, and for two-way the
  source-of-variation table — sits behind **All numbers**, collapsed by
  default, one toggle per section.
- Tests with only one comparison (t test, nested t test, rank test) have
  nothing distinct to promote: the headline already carries the whole
  answer, so their entire `Sections` list moves behind All numbers.
- Normality and descriptive statistics are already just a handful of
  compact tables with no separate "comparisons" table and no headline
  reading to stand alone above them; they are left exactly as they render
  today.

`Sections`/`Grid` (the label/value card and column-table renderers) are
unchanged; only which of their outputs lands above or below the fold
moves. Prism's layout inside All numbers is exactly what today's
`results-grid` renders — nothing is reworded or dropped, per #57 ("keep
Prism's layout inside it").

## Remembered per section

Note 08 decision 8's "hide notes" switch is one global flag. This is
per-section: which analyses have their All numbers open is a `Set<Id>`
kept in this browser's `localStorage` (`barelysig.allNumbers`,
`src/ui/results/openNumbers.ts`: `useAllNumbersOpen`/`setAllNumbersOpen`),
guarded the same way as `notesShown.ts` (missing or refused storage
silently falls back to "closed for this visit"). Default is closed — the
reading and the primary table are the section's front page; a reader who
wants the ANOVA table opens it once and it stays open across reloads for
that analysis, without opening every other section's on a fresh visit.

## Not this note

- The whole-section fold (`nb-fold` in `Section.tsx`, the ▾/▸ that hides
  an entire numbered section) is unrelated and untouched: All numbers is
  a second, inner disclosure for the table stack once a section is
  already open.
- No change to the reading, the figures, the method sentence, or any
  number's wording or precision.

## Testing

- `openNumbers.ts` tested like `notesShown.ts`: read/write through a
  guarded `localStorage`, per id.
- `ResultsSection.test.tsx`: existing assertions that reach into a grid
  now hidden by default (`ANOVA table`, `Test details`, …) open All
  numbers first; a new test opens one section's All numbers, reloads the
  page (a fresh `render`), and checks it is still open while another
  section's is not.
