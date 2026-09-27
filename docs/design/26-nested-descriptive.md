# 26. Descriptive statistics of Nested tables

Written 2026-09-27 for #75. Builds on note 13 (Nested tables and
SuperPlots), note 07 (the graph statistic that computes a SuperPlot's
replicate means, `graphsummary`'s `nestedMeansOf`) and note 18
(descriptive statistics of a Grouped table, the closest existing
precedent for "several levels of description, one analysis").

## What was asked

Descriptive statistics (item 04, #16, extended to Grouped tables by note
18) never covered Nested tables: `AnalyzeDialog`'s `descriptive` entry is
`tables: ['column', 'grouped']` only. A Nested table's groups have no
"just describe them" analysis at all, only the nested t test and nested
one-way ANOVA, both of which compare groups rather than summarise one.

## What a Nested table's descriptive statistics should show

A Nested table has two levels (note 13): individual (technical)
measurements inside a biological replicate, and replicates inside a
group. Naively pooling every individual value and reporting n/mean/SD as
if they were independent samples is exactly the pseudoreplication a
Nested table exists to avoid — the same reason the nested t test counts
replicates, not values, as n. Descriptive statistics has to make the same
distinction, or it would quietly hand back a misleading n next to a
correctly-computed test.

Three candidate levels:

1. **Replicate-level**: n, mean, SD, SEM of the values within each
   replicate. Useful for spotting a replicate that behaved oddly, but not
   what belongs in a figure legend on its own.
2. **Group-level, from the replicate means**: number of replicates, mean,
   SD, SEM and 95% CI *of the replicate means*. This is what a SuperPlot's
   own error bar already shows (`graphsummary`'s `nestedMeansOf`, note
   07), what the nested t test and nested one-way ANOVA's own group
   summaries report (`nReplicates`, `mean`), and what Lord et al. (2020)
   call the number that should go in a figure legend. It is the
   scientifically defensible one: n here means "how many times we ran
   the experiment", matching what the hypothesis tests actually test.
3. **Pooled, over every individual value**, ignoring the replicate
   structure entirely: the number a naive user reaches for first (every
   cell counted as its own sample), and exactly the pseudoreplicated
   number the whole Nested-table feature exists to steer people away
   from.

**Decision: show all three, group-level first and most prominent, with
the pooled numbers included but carrying a visible, specific caution
label wherever they appear** ("Do not use this n for a test or an error
bar — pooling every individual value inflates the apparent sample size
and can manufacture significance that isn't there (pseudoreplication);
use the replicate summary above instead."). Leaving pooled numbers out
entirely was the other defensible option (note 18 leaves cell-level
percentiles out of Grouped tables' pooled statistics when they can't be
recovered from summary data, a similar "don't offer numbers that
mislead" instinct) — but a user coming from a plain Column-table
descriptive-statistics habit, or wanting to sanity-check "how many wells
did we actually image in total", is going to ask for that pooled n one
way or another; better to give it accurately labelled than to have them
recompute it by hand from the raw table and lose the caution message
that would have come with it. Pooled numbers are kept minimal (n, mean,
SD only — no percentiles, no CI, nothing that invites reading them as a
usable summary) precisely so they read as "for reference" rather than
"the numbers".

No percentiles or CI at the replicate level either: with often only a
handful of values per replicate, a median/quartile breakdown per
replicate is more numbers than anyone reading a lab notebook wants, and
the group-level CI (from the replicate means) is the one that answers
"how sure are we", per note 18's own reasoning for the Column-level
CI. Replicate-level SD/SEM stay because they are the plainest way to
spot one noisy replicate at a glance.

## Reusing the SuperPlot's own replicate means, not recomputing them

`graphsummary`'s `nestedMeansOf` (note 07) already computes exactly the
"the group-level mean/error bar comes from the replicate means, not
every individual value" logic this analysis needs, in plain TypeScript
(no R call: it is one `reduce` per replicate). Duplicating that
arithmetic in a second module would risk the results table and the graph
disagreeing about what a SuperPlot's "n" means whenever they drifted out
of sync. `nestedGroups`' replicate-mean computation is pulled out into a
new selector, `nestedReplicateMeans` (`src/model/selectors.ts`), and both
`graphsummary` and the new `nested-descriptive` module call it — the
graph's beeswarm still plots every individual value (`src/graphs/data.ts`
is untouched), only the summary numbers are shared.

## Implementation

`src/analyses/nested-descriptive`, one folder as the convention asks:

- `types.ts`: `NestedDescriptiveRequest` (per group: id, title, the
  replicates with a usable value as raw arrays, their titles, and how
  many were dropped for having none) and the result types
  (`NestedDescribedGroup`: `replicates` (`DescribedReplicate[]`), `group`
  (the primary summary), `pooled`).
- `analysis.R`: one function, `bs_nested_descriptive(value, group_idx,
  replicate_idx, k)`, mirroring `nested-oneway`'s flat-vectors-plus-index
  shape rather than one R call per replicate (dynamic per-group,
  per-replicate call names would make the fixture harness's
  request-rebuild-from-fixture-columns pattern, used by every other
  nested analysis's test, unworkable). It reuses `bs_describe`
  (`descriptive/analysis.R`, concatenated in exactly as `graphsummary`
  and `paired-normality` already do) for every one of the three levels'
  arithmetic — no new statistics, just orchestration: group values by
  `group_idx`, then by `replicate_idx` within a group, describe each
  replicate, describe the vector of replicate means for the group level,
  describe the group's pooled raw values for the pooled level. `vapply`
  (not `sapply`) collects the replicate means, so a group with zero
  replicates still yields `numeric(0)` rather than `sapply`'s
  list-when-empty gotcha.
- `oracle.R`: an independent reference (CLAUDE.md's "oracle references
  must be independent of the app's own analysis.R") that computes each
  level directly with base R (`mean`, `sd`, `qt`), never calling
  `bs_describe`. Fixtures specifically include unequal replicate sizes,
  so that the group-level mean (of replicate means) and the pooled mean
  (of raw values) provably differ — the exact bug this feature exists to
  make impossible to miss, generated with `npm run oracle:generate
  nested-descriptive`.
- Wired into `AnalyzeDialog.tsx` (`tables: ['nested']`), `analysisKinds.ts`
  (name, icon: reuses `descriptive-stats`), `notes.ts` (the results-page
  "what this means" note), `ResultsSection.tsx` (a new
  `NestedDescriptiveView`), `bsig.ts` (options are `{}`, like the other
  parameterless analyses), `pairwise.ts` (no comparisons or brackets, like
  plain `descriptive`), `guide.ts` (`ANALYSIS_PAGE` → `17-nested-tables`,
  which gets a new section), `registry.ts` and `project.ts`
  (`NestedDescriptiveOptions = {}`).

## Options

None: like `descriptive`, `normality` and `paired-normality`, there is
nothing to configure.
