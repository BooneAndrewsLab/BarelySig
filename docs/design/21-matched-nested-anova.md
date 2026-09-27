# 21. Matched nested one-way ANOVA

Written 2026-09-27 for #71 (split from #70, blocked on #50, both now
shipped). Builds on note 14 (matched replicates in a Nested table) and
note 17 (repeated-measures one-way ANOVA).

## What was asked

Note 14 gave the matched nested t test — for two groups whose
replicates are the same experiment (day, animal, culture) run side by
side, a paired t test on each replicate's mean. #71 is the same idea
for three or more groups: replicate n in every group is one experiment,
so the natural test is a repeated-measures one-way ANOVA (note 17,
Geisser-Greenhouse corrected, matched post-hoc comparisons) on the
replicate means, not the REML mixed model the unmatched nested ANOVA
uses.

## Why not the mixed model (#72's question, settled here for the matched case)

Note 14 already ran this experiment for the two-group case: a REML
mixed model with a random experiment effect said P < 0.05 in far too
few null runs (`scripts/sim/nested-calibration.R`, 0–2% at three
replicates against a nominal 5%), so it misses real effects the
matched test on replicate means would find. Nothing about adding a
third or fourth group changes that; the fix is the same one note 14
already chose for two groups, generalized. #72 (whether the *unmatched*
nested ANOVA should keep REML or switch) is a separate, still-open
question about a different analysis; it isn't reopened here.

## Matching, generalized to N groups

Note 14's `matchedPairs` pairs two groups' replicates by position (`ga`
and `gb`), keeping a row only when both sides have a usable value,
counting a replicate empty on both sides as "dropped", and naming one
with a value on one side only as "unmatched" (left out of both, but a
real loss worth telling the user about, unlike an empty replicate).

Generalizing to N groups keeps exactly that three-way split, just
across every group instead of two:

- a value in **every** group at replicate n → keep the row (each
  group's mean at that replicate);
- a value in **at least one but not all** groups → "unmatched": left
  out of every group, named in the results (the position where the
  matching broke down is the useful thing to show, not just a count);
- a value in **no** group → "dropped": uninteresting, just counted.

This is what the issue's "a replicate missing in any group is dropped
from all groups" means once spelled out for N groups, and it is exactly
what a repeated-measures ANOVA already does to an incomplete row
(`matchedGroups` for Column tables drops a row missing anywhere) — the
new code is nested-ttest's `matchedPairs` with the pairwise `a`/`b`
generalized to an array of groups, not a new rule.

## Feeding #50's analysis, not reimplementing it

The new module (`src/analyses/nested-repeated`) does no new statistics:
`prepare()` builds the matched replicate-mean rows as above and hands
them to `bs_repeated` (`repeated/analysis.R`, reused via the same
raw-source concatenation `repeated/index.ts` already uses for
`oneway`'s comparisons code — nothing new is written in R). The
options type is `RepeatedMeasuresOptions` itself (comparisons only; no
Welch-style variant, as neither nested analysis has one): a matched
Nested table with three or more groups is, from the R engine's point of
view, indistinguishable from a repeated-measures Column table once the
replicate means are computed, so it takes the same options and produces
the same shape of result (groups, ANOVA table, Geisser-Greenhouse and
Huynh-Feldt epsilon and P, matched comparisons) with nested-specific
wording (a "replicate", not a "subject" or "row") and a
`droppedReplicates`/`unmatched` accounting like note 14's, not
`droppedRows`.

No Friedman-equivalent ships here: note 14 didn't add a rank-based
alternative for the two-group matched case either, and the issue only
asks for the ANOVA. A follow-up can add it later the way #82/#83 extend
#50 for Column tables, if it's ever wanted.

## Wiring

A new analysis kind, `nested-repeated-anova`, threaded everywhere a kind
is matched (note 13's lesson: grep, don't guess): the registry, the
Analyze dialog (reusing `NestedOneWayFields` for its comparisons UI, as
`repeated-measures-anova` already does), the results view (a
`NestedRepeatedView`, structurally `RepeatedMeasuresView` with replicate
wording), significance brackets and margin notes (`pairwise.ts`,
`notes.ts`), the guide page mapping, analytics' event allow-list, `.bsig`
serialization, and the model arbitraries used by the round-trip property
test (note 07's lesson: a generator that doesn't produce a new field or
kind can't catch a codec that drops it).

## Help me choose

The wizard's Nested-table branch (`chooser.ts`) asks "matched?" before
counting groups; for three or more matched groups it used to answer
"BarelySig doesn't have this yet (issue #71)". That branch now
recommends the new analysis instead, with the same phrasing pattern
note 15 uses for the other repeated-measures recommendation: what it
does, why the matching makes it more sensitive than treating replicates
as independent, and (on "unsure") the caveat that an unmatched nested
one-way ANOVA is the safer default.
