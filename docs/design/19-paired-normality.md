# 18. Normality of a paired t test's differences

Written 2026-09-27 before building #53. Builds on note 06 (the `normality`
analysis: D'Agostino-Pearson and Shapiro-Wilk, offered alongside an
unpaired t test and one-way ANOVA) and the usability pass in note 07,
which pulled group normality tests off a paired t test's dialog without
replacing them with anything.

## What was asked

#53 (split from #33): "A paired t test assumes the differences within
each row are Gaussian, not each group; the normality tests (#28) test
groups, so the Analyze dialog no longer offers them with a paired t test
and says why (note 07). Wanted: a normality test of the paired
differences, offered alongside the paired t test, with R-oracle
fixtures."

## New analysis kind

| Kind | Table | Options |
|---|---|---|
| `paired-normality` | Column, two groups paired by row | none (matches `normality`) |

Needs the individual values (never summary data — pairing needs both
groups' raw rows). Rows missing a value on either side drop out of the
pairing, exactly as `pairedGroups` already does for the paired t test
itself; `paired-normality`'s `prepare()` calls that same selector rather
than reimplementing the rule.

## Reusing `normality`'s R code

D'Agostino-Pearson and Shapiro-Wilk are the same two tests as
`normality`; only what they run on changes (the differences, once,
instead of each group, N times). Rather than duplicate
`bs_dagostino`/`bs_normality_one`, `paired-normality`'s R code is
`normality`'s `analysis.R` concatenated with a one-line wrapper
(`bs_paired_normality <- function(d) bs_normality_one(d)`), the same
pattern `twoway` already uses to reuse `oneway`'s `bs_comparisons` (note
06). The module's `code` field (used for the fingerprint) is the
concatenation, so a change to `normality`'s tests invalidates cached
`paired-normality` results too.

The result shape drops `normality`'s `groups` array (there being exactly
one series of differences, not N groups): `PairedNormalityResult` carries
`a`, `b` (which group's the minuend, `b − a`, Prism's paired-t-test
convention), `n`, `droppedRows`, and the same `TestOutcome<...>` shape
`normality` uses for `shapiroWilk`/`dagostino`, imported directly from
`normality/types` rather than redeclared.

## Oracle

`paired-normality`'s `oracle.R` writes its own independent reference (the
same D'Agostino formulas as `normality`'s oracle, from the published
paper, not from the app's `bs_dagostino`), run on `b - a` after dropping
rows with `NA` on either side — the fixture harness passes `a`/`b` as
parallel columns with `NA` for a missing cell, and the reference must
drop incomplete pairs the same way the app's `pairedGroups` does, or a
`NA` would poison every downstream statistic. Checked against
`fBasics::dagoTest` on the differences where n ≥ 20, as `normality`'s
does. Fixture cases: Gaussian differences (one nudged off exact symmetry,
whose true skewness is 0 and only rounding noise), skewed, two pairs (too
few for either test), exactly eight pairs (D'Agostino's minimum), one row
dropped for a missing value with ties among what's left, one outlying
difference among 41 (both P values tiny, kept at full magnitude), and
every difference identical (neither test defined).

## The dialog and the guided chooser

The "before the test" checkbox that offers a companion normality analysis
(note 06) now branches on which companion fits, not just whether one
does: an unpaired t test or an ANOVA still offers `normality` on each
group; a paired t test offers `paired-normality` on the differences
instead, worded "Also test the paired differences for normality (a
separate analysis)". `AnalyzeDialog`'s `offersNormalityFor`/companion
logic and `Guide`'s (the guided chooser, note 15) checkbox both return
which companion kind applies (`'normality' | 'paired-normality' | null`)
rather than a bare boolean, so both surfaces show the right label from
one source of truth. `paired-normality` is also its own tile in "Pick a
test myself" (**Normality of the differences**, two groups), matching
`normality`'s own precedent of being both a companion and a standalone
analysis — needed so "Change analysis" on a companion `paired-normality`
section has a sensible tile selected, and so it can be re-run on its own
without a paired t test alongside it.

## Every other touch point (note 13's lesson)

Grepped for every place `AnalysisKind`/`AnalysisSpec` is matched
exhaustively and added `paired-normality` next to `normality`, since a
missing case in a plain conditional chain compiles clean and renders
nothing:

- `src/model/project.ts`: the `AnalysisSpec` union, `PairedNormalityOptions`,
  `DEFAULT_OPTIONS`.
- `src/analyses/registry.ts`: the module registry.
- `src/ui/analysisKinds.ts`: icon (shares `normality`'s) and `testName`.
- `src/ui/results/ResultsSection.tsx`: `PairedNormalityView`, dispatched
  alongside `NormalityView`.
- `src/ui/results/reading.ts`: `pairedNormalityReading`, the same caution
  as `normalityReading` but about "the paired differences", not "the
  groups".
- `src/ui/notebook/notes.ts`: a margin note.
- `src/analyses/pairwise.ts`: no brackets (added to the same `case
  'descriptive': case 'normality':` arm both switches already have).
- `src/io/bsig.ts`: `optionsJson` and `spec()` (empty options, like
  `normality`'s).
- `src/test/modelArbitraries.ts`: a generator, so the `.bsig` round-trip
  property test actually exercises the new field (note 07's lesson).
- `src/ui/analytics.ts`: `new-paired-normality` added to the `analysis`
  event allow-list.
- `src/ui/help/guide.ts`: `ANALYSIS_PAGE['paired-normality']` points at
  `10-normality.md`'s new "The paired case" section, not a new page — the
  tests, the reading and the caveats are identical; only what they run on
  differs, which one section covers.
- `docs/guide/10-normality.md`, `docs/guide/05-t-tests.md`: guide prose
  (CLAUDE.md: any change a user can notice updates its guide page in the
  same commit).

## Decisions made here

1. **Reuse `normality`'s R code by concatenation**, not a shared file
   imported by both: matches `twoway`/`oneway`'s existing precedent
   exactly (note 06), and keeps the fingerprint correct without a new
   sharing mechanism.
2. **A new analysis kind, not an option on `normality`**: the two have
   different inputs (a table's groups vs. two groups paired by row),
   different `prepare()` validation, and a different result shape (N
   groups vs. one set of differences); `TTestOptions.paired` already
   shows options don't collapse two shapes into one type well here.
3. **Also a standalone tile**, matching `normality`'s own precedent,
   rather than a checkbox-only companion with no tile — chiefly so
   "Change analysis" on the companion has something to select.
