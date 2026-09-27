# 22. Repeated-measures two-way ANOVA (one factor repeated)

Written 2026-09-27 before building #81. Builds on note 06 (ordinary
two-way ANOVA, Type III SS via sum-to-zero contrasts) and note 17
(repeated-measures one-way ANOVA: Geisser-Greenhouse/Huynh-Feldt via
base R's `stats:::sphericity()`). Prism's behaviour comes from
GraphPad's Statistics Guide (repeated-measures two-way ANOVA,
split-plot design).

## What was asked

#81, split off #50's brief ("repeated-measures two-way ANOVA, one or
both factors repeated") as its own, larger piece of work. A Grouped
table: the row factor and the column factor (its data sets), subcolumns
the replicates. One factor repeated by row position: a Grouped table's
subcolumn *s* in data set *c*, row *r* is one subject; when the column
factor is repeated, subject *s* is matched across every column *within
the same row* (the row factor is between-subjects — a classic
split-plot / mixed design, e.g. row = drug group, column = time,
subcolumn = animal). Row-repeated is the mirror image (column
between-subjects). **Both factors repeated is out of scope here**,
filed as its own follow-up issue (below) — a fully within-subject
design where every within term (row, column, and their interaction)
needs its *own* Greenhouse-Geisser/Huynh-Feldt epsilon rather than one
shared epsilon, confirmed against `car::Anova(idata=, idesign=~r*c)` in
throwaway R (`car` is oracle-only, not shipped — see below); a real
enough amount of extra work, and a rarer design in practice, to ship
separately rather than block the common split-plot case on it.

## Where car agreed with base R, and where it didn't

Explored three ways to get GG/HF-corrected split-plot F tests before
picking one, all in throwaway R, none committed:　

1. **`car::Anova(mlmfit, idata=, idesign=~col)`** (`mlmfit <- lm(Y ~
   row)`): matched the classical split-plot SS exactly for `row` (the
   between-subjects term, tested against subjects-within-row) and for
   `row:col` (the interaction), but **its reported `col` (the
   within-subjects main effect) F did not match** `aov(y ~ row*col +
   Error(subj/col))`'s own `col` line, by a small-integer-looking ratio
   — a second instance of note 17's own lesson about oracle bugs (a
   ratio near a small integer means a count/family mismatch), except
   here found in a *reference* package on the very first check, before
   any fixture existed, exactly why CLAUDE.md's Correctness section
   asks for an independent cross-check before trusting one. Not chased
   further since `car` isn't shipped anyway (below); noted here in case
   a future note reaches for it again.
2. **Base R's own `stats:::anova.mlm`, single-object form**
   (`anova(mlmfit, X = ~1, idata = idata, test = "Spherical")`, `mlmfit
   <- lm(Y ~ row)`): matched `aov`'s `col` **and** `row:col` F values
   and SS exactly, on both a balanced and a deliberately unbalanced
   (unequal subjects per row) synthetic dataset, including with `car`'s
   own numbers for the terms where the two agreed. This is exactly note
   17's own tool (`stats:::sphericity()`, which `anova.mlm` calls
   internally for `test = "Spherical"`), already proven in production
   for the one-way case, so no new package or new trust surface.
3. **Hand SS decomposition** (below): matched `aov` exactly too, on both
   datasets, and is what ships (base R's `sphericity()` supplies only
   the epsilon, not required to also trust its F/SS bookkeeping for a
   design it hasn't shipped in yet).

**Decision:** ship the hand SS decomposition for every reported number
except epsilon, and call `stats:::sphericity()` (already in production,
note 17) for GG/HF only — never `car`, which stays oracle-only
(CLAUDE.md's package list) and, per (1), isn't even trusted as an
oracle for this design without its own cross-check first (not done;
the oracle uses `aov(Error())` instead, itself base R, see below).

## The split-plot decomposition (one factor repeated)

Let the *between* factor (not repeated) have levels *a* = 1..p, the
*repeated* factor *b* = 1..q. Subject *i* belongs to exactly one
between-level; *n_a* subjects in level *a*, *N* = Σ *n_a* total. Every
kept subject has one value *Y_ib* per repeated-level (a subject missing
any repeated-level's value is dropped entirely, `matchedGroups`'
style, not just that cell — reported as `droppedSubjects`, same wording
as note 17's `droppedRows`). **Unequal *n_a* is fully supported** (an
uneven number of subjects per between-level, e.g. animals lost from one
treatment arm): confirmed against `aov(Error())` above, not just the
balanced textbook case.

Two independent pieces, computed from two different views of the same
subject × repeated-level matrix *Y* (*N* rows, *q* columns):

**Between-subjects part**, from each subject's own mean across the
repeated levels, *M_i* = mean_b(Y_ib) — an ordinary one-way ANOVA of
*M_i* by the between factor, scaled by *q* (the identity that lets a
plain one-way decomposition stand in for the classical split-plot
between-stratum, confirmed against `aov` on both datasets above, not
assumed from the textbook page alone):
- SS(between) = *q* · Σ_a *n_a* (mean(M in a) − grand(M))², df = p − 1
- SS(subjects) = *q* · Σ_i (M_i − mean(M in *i*'s level))², df = N − p
- F(between) = MS(between) / MS(subjects). No sphericity correction:
  this is an ordinary between-subjects F, the same reason the
  one-way-RM module's own `ss_subjects` term needs none.

**Within-subjects part**, from *D_ib* = *Y_ib* − *M_i* (each subject's
own deviation from its mean, so every subject's row of *D* sums to
zero) pooled over **all** subjects regardless of between-level:
- SS(repeated) = *N* · Σ_b (mean_i(D_ib))², df = q − 1
- SS(interaction) = Σ_a *n_a* · Σ_b (mean(D in a,b) − mean(D in a) −
  mean_i(D_ib))², df = (p − 1)(q − 1) — mean(D in *a*) is 0 by
  construction, kept in the formula for symmetry with the textbook page
  rather than dropped as an always-zero term, so the code reads the
  same as the equal-*n* case.
- SS(residual), the split-plot's "B × S/A" error = ΣΣ D² − SS(repeated)
  − SS(interaction), df = (N − p)(q − 1)
- F(repeated) = MS(repeated) / MS(residual); F(interaction) =
  MS(interaction) / MS(residual). **Both share one epsilon** (Box's,
  from the pooled within-subject covariance structure — confirmed
  against `car`'s own split-plot output where the two agreed: identical
  GG epsilon printed for `col` and `row:col`), from
  `stats:::sphericity(SSD(lm(Y ~ between)), X = ~1)` exactly as note
  17's one-way module calls it, then clamped to Prism's stated
  `[1 / (q − 1), 1]` the same way. With *q* = 2 the clamp forces epsilon
  to 1 with no special case, same as the one-way module.

**Refused, not computed:** fewer than two levels of either factor
(`row < 2 || column < 2`, echoing `bs_twoway`'s own check); fewer than
two subjects in some between-level after dropping incomplete ones (df =
0 residual for that stratum); zero residual scatter in either stratum.
**Not attempted:** an empty between-level, unequal replicate counts
*within* a level's repeated dimension (impossible by construction: a
subject with any repeated-level missing is dropped whole, so every kept
subject has exactly *q* values), summary data (matching one-way RM:
pairing needs every subject's row, not a mean/SD/n).

## New analysis kind

| Kind | Table | Options |
|---|---|---|
| `repeated-two-way-anova` | Grouped, values only | `repeatedFactor: 'row' \| 'column'` |

No comparisons in this first slice — filed as its own follow-up issue
(below), the same staged delivery note 17 used for #82/#83: the two
strata here (between-error for a between-level family, within-error for
a repeated-level or simple-effect family) is real extra design work
that a first, correct ANOVA table shouldn't wait on.

`RepeatedTwoWayRequest`/`Result` (`src/analyses/repeatedTwoway/types.ts`)
follow `TwoWayResult`'s shape where the concepts line up (`rows`,
`columns`, `cells[r][c]`, `TwoWayTerm`-shaped terms) and
`RepeatedMeasuresResult`'s where they don't (`ggEpsilon`/`hfEpsilon`/
`ggP`/`hfP`, `droppedSubjects` for `droppedRows`). The between-subjects
term is reported as `subjects` (SS/df/MS only, no F/P — mirroring how
`repeated-measures-anova` reports its own `ssSubjects` term: descriptive,
not a test Prism reports a P for either) alongside the tested `between`
term.

## Wiring (grep for every place an analysis kind is matched, note 13)

New module `src/analyses/repeatedTwoway/` (`analysis.R`, `oracle.R`,
`types.ts`, `index.ts`, its own `.test.ts`), built on `twoway`'s and
`repeated`'s as templates. Touch points, each already listing every
other analysis kind: `src/model/project.ts` (new `AnalysisSpec` case,
`RepeatedTwoWayOptions`), `src/analyses/registry.ts`,
`src/ui/analysisKinds.ts` (icon, test name), `src/ui/notebook/notes.ts`
(margin notes), `src/ui/shell/AnalyzeDialog.tsx` (a `repeatedFactor`
radio, Grouped-table-only like ordinary two-way's own fields),
`src/ui/shell/chooser.ts` ("help me choose": a Grouped table with
matched replicates resolves here rather than to `two-way-anova`),
`src/ui/help/guide.ts` and a `docs/guide/` page, `src/io/bsig.ts`
(serialisation both ways), `src/test/modelArbitraries.ts` (round-trip
generator), `src/ui/results/ResultsSection.tsx` (a new view; the
conditional chain isn't exhaustive, note 13's own lesson — a missed
case compiles clean and renders nothing), `src/ui/analytics.ts` (one
new `EVENTS` entry, "ran repeated-measures two-way ANOVA"). No
`pairwise.ts` entry yet: no comparisons in this slice.

A new selector, `src/model/selectors.ts`'s `groupedMatchedSubjects(table,
repeatedFactor)`: for a Grouped table, returns each kept subject's
between-level index and its *q* values in repeated-level order, subjects
dropped for a missing value anywhere counted separately — the two-way,
subcolumn-indexed generalisation of `matchedGroups`' row-indexed one.

## Correctness (CLAUDE.md)

**Oracle independence.** `repeatedTwoway/oracle.R`'s reference is
`aov(y ~ between*repeated + Error(subject/repeated), data = long)` for
every SS/F/P in the ANOVA table (a different R function than the app's
own hand SS decomposition, checked against it on balanced and
deliberately unbalanced fixtures before any fixture is written, per
CLAUDE.md's independent-reference habit) plus `stats:::sphericity()`
for epsilon (the same helper the app calls — no independent epsilon
implementation exists in any installed package; noted as a limit, the
same one note 17 accepted for the one-way case).

**Fixtures** (`repeatedTwoway/fixtures/`): balanced (equal subjects per
between-level) and unbalanced sets, a dropped-subject case (one subject
short a value in one repeated-level), the fewest-subjects case
(*N* = *p* + 1, one stratum at df = 1), a `q = 2` case (epsilon forced
to 1, no correction visible), and a `row`-repeated case (the mirror
image of `column`-repeated, to catch a transposition bug rather than
trusting the two paths are symmetric by inspection).

## Follow-ups filed, not built here

- **Both factors repeated** (fully within-subject two-way, no
  between-subjects factor): each within term needs its own epsilon
  (confirmed distinct in throwaway `car::Anova` output above), a
  materially different computation from this note's shared-epsilon
  split-plot case.
- **Comparisons** after repeated-measures two-way ANOVA (post-hoc
  families, per stratum), the same staged split note 17 used for #83.
