# 23. Repeated-measures two-way ANOVA, both factors repeated

Written 2026-09-27 before building #84. Addendum to note 22 (split-plot,
one factor repeated, #81): note 22 already scoped this case out and
named its shape ("each within term needs its own
Greenhouse-Geisser/Huynh-Feldt epsilon rather than one shared epsilon,
confirmed distinct in throwaway `car::Anova(idata=, idesign=~r*c)`
output"). This note settles the R mechanism and edge cases; it does not
revisit anything note 22 already decided for the split-plot case.

## What was asked

#84, split off #50's brief alongside #81. A Grouped table where **every
subject is measured at every row × column combination** — no
between-subjects factor at all (e.g. the same animals at every
treatment × time-point cell). No comparisons (a separate follow-up if
ever needed, mirroring #85 for the split-plot case).

## The R mechanism

Base R's `stats:::anova.mlm` (note 17's, note 22's own tool) is normally
called as a single-term test (`X`/`M` default to the whole within-subject
space). For a design with **two crossed within-subject factors**, it can
still be called once per term by choosing `M`/`X` formulas over `idata`
that isolate that term's own contrast, confirmed in throwaway R against
`aov(y ~ row*col + Error(subject/(row*col)))` before any fixture was
written (CLAUDE.md's independent-check habit):

```r
idata <- expand.grid(col = factor(1:q), row = factor(1:p))  # matches Ywide's column order
mlmfit <- lm(Ywide ~ 1)                       # no between-subjects predictors at all
anova(mlmfit, M = ~row,       X = ~1,        idata = idata, test = "Spherical")  # row main effect
anova(mlmfit, M = ~col,       X = ~1,        idata = idata, test = "Spherical")  # column main effect
anova(mlmfit, M = ~row * col, X = ~row + col, idata = idata, test = "Spherical") # interaction only
```

Each call's F, df and uncorrected P matched `aov`'s `Error(subject/(row*col))`
stratification exactly (row: F = 0.596 on both; column: F = 8.002; interaction:
F = 5.561, checked on a synthetic 3×2×8 dataset), and each reported its
**own** Greenhouse-Geisser/Huynh-Feldt epsilon — materially different
per term (0.996/1 for row, 1/1 for column with q = 2, 0.667/0.765 for
the interaction on that dataset) — confirming note 22's finding was not
an artefact of `car`. `car::Anova` was not re-tried here: it stays
oracle-only regardless (CLAUDE.md's package list), and note 22 already
found it unreliable for a within-subject main effect on the split-plot
case.

**What ships:** the same hand SS decomposition style as note 22 (an
independent, auditable formula for every SS/F/P), with `stats:::sphericity()`
called three times — once per term, each with its own contrast subspace
built the same way as the `anova.mlm` calls above — for GG/HF only.

## The decomposition (both factors repeated)

*N* subjects, each with one value at every (row *i* = 1..*p*, column
*j* = 1..*q*) cell — a subject missing any cell drops out whole
(`droppedSubjects`, same wording as notes 17 and 22). Let *Y_ijk* be
subject *k*'s value at (*i*,*j*); *M_k* its own mean; *R_i*, *C_j*,
*X_ij* the row, column and cell means (over subjects); *Y_i·k*,
*Y_·jk* subject *k*'s own mean at row *i* (over columns) and column *j*
(over rows); grand the overall mean.

- SS(total) = ΣΣΣ(Y−grand)², df = *pqN* − 1
- SS(subjects) = *pq* Σ_k(M_k−grand)², df = *N*−1 — descriptive only,
  reported the same way note 22's `subjects` term is, but here it is
  simply "the subjects effect", not an error term for anything (there
  is no between-subjects factor left to test against it).
- **Row**: SS = *qN* Σ_i(R_i−grand)², df = *p*−1; error SS(row×S) =
  *q* ΣΣ(Y_i·k−R_i−M_k+grand)², df = (*p*−1)(*N*−1)
- **Column**: SS = *pN* Σ_j(C_j−grand)², df = *q*−1; error SS(col×S) =
  *p* ΣΣ(Y_·jk−C_j−M_k+grand)², df = (*q*−1)(*N*−1)
- **Interaction**: SS = *N* ΣΣ(X_ij−R_i−C_j+grand)², df = (*p*−1)(*q*−1);
  error SS(row:col×S) = ΣΣΣ(Y−X_ij−Y_i·k−Y_·jk+M_k+R_i+C_j−grand)²,
  df = (*p*−1)(*q*−1)(*N*−1)

Confirmed to sum exactly to SS(total) and to match `aov`'s F values on
both a balanced synthetic dataset and by construction (no between-groups
concept here, so no unequal-*n_a* case exists the way note 22's split-plot
had — every subject contributes to every stratum equally, "balanced" and
"unbalanced" don't apply; the only irregularity is a dropped subject).

Each term's own epsilon is clamped to **that term's own** `[1/pp, 1]`
(*pp* its own contrast dimension: *p*−1 for row, *q*−1 for column,
(*p*−1)(*q*−1) for the interaction) — not one shared bound, since the
whole point of this note is that the three epsilons are independent.
Huynh-Feldt came back `NaN` (0/0, when *pp* = *N*−1) and above 1 in
throwaway testing at small *N* relative to *pp* (research confirmed up
to HF = 3.18 uncorrected); Geisser-Greenhouse stayed in bounds in every
case tried. Both are clamped the same way notes 17/22 do (`NaN` → 1,
otherwise `max(1/pp, min(1, e))`).

**Refused, not computed:** fewer than two levels of either factor
(`row < 2 || column < 2`); fewer than two complete subjects (*N* < 2);
zero residual scatter in any of the three error strata.

## New analysis kind

A new kind rather than a `repeatedTwoway` variant: the result shape
doesn't fit `RepeatedTwoWayResult` (no `between`/`subjects` split, three
independently-corrected terms instead of two sharing one epsilon,
no `repeatedFactor` option — neither factor is the odd one out).

| Kind | Table | Options |
|---|---|---|
| `repeated-two-way-anova-both` | Grouped, values only | none |

`RepeatedTwoWayBothRequest`/`Result`
(`src/analyses/repeatedTwowayBoth/types.ts`) mirror note 22's shapes
where the concepts line up (`RepeatedTwoWayTerm`-shaped `row`/`column`/
`interaction`, each with its own `ggEpsilon`/`hfEpsilon`/`ggP`/`hfP`);
`subjects` is descriptive only, `droppedSubjects` matches note 22's
wording.

A new selector, `groupedFullyMatchedSubjects(table, dataSets)`
(`src/model/selectors.ts`): every subcolumn slot with a value at every
row × column cell is one subject (row-major flattened, matching
`repeatedTwoway`'s subject-major convention); a slot missing any cell's
value is dropped whole and counted.

## Wiring (grep for every place an analysis kind is matched, note 13)

New module `src/analyses/repeatedTwowayBoth/`, built on `repeatedTwoway`'s
as a template. Touch points, matching #81's own footprint (`git show
--stat 917d893`): `src/model/project.ts` (new `AnalysisSpec` case,
`RepeatedTwoWayBothOptions` — an empty options record, like
`descriptive`'s), `src/analyses/registry.ts`, `src/analyses/pairwise.ts`
(no comparisons), `src/ui/analysisKinds.ts`, `src/ui/notebook/notes.ts`,
`src/ui/shell/AnalyzeDialog.tsx` (a catalog entry, no options fields to
render), `src/ui/help/guide.ts` and a `docs/guide/` page (also
correcting that page's "isn't built yet" line for both-repeated), `src/io/bsig.ts`,
`src/test/modelArbitraries.ts`, `src/ui/results/ResultsSection.tsx`,
`src/ui/results/reading.ts`, `src/ui/analytics.ts` (one new `EVENTS`
entry).

## Correctness (CLAUDE.md)

**Oracle independence.** `repeatedTwowayBoth/oracle.R`'s reference is
`aov(y ~ row*col + Error(subject/(row*col)))` for every SS/F/P (a
different R function from the app's own hand SS decomposition, checked
against it in throwaway R before any fixture was written) plus
`stats:::sphericity()` for each term's own epsilon (the same helper the
app calls — no independent per-term epsilon implementation exists in any
installed package, the same accepted limit notes 17 and 22 note).

**Fixtures** (`repeatedTwowayBoth/fixtures/`): a balanced 3×2 case, a
dropped-subject case, the fewest-subjects case (*N* = 2, epsilon forced
through the `NaN`/clamp path on every term), a case with unequal *p*
and *q* so row and column epsilon are visibly different from each
other, and a larger balanced case where all three GG epsilons sit
comfortably inside (0, 1) with no clamping.

## Follow-ups filed, not built here

- **Comparisons** after this ANOVA (post-hoc within each within-subject
  term), a separate issue if ever needed — the same staged split notes
  17 and 22 used for #82/#83 and #85.
