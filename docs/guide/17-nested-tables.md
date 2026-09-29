# Nested tables, the nested t test and nested one-way ANOVA

A Nested table is for data with **two levels**: several biological
replicates (separate experiments, animals, dishes) in each group, and
several individual measurements (cells, wells, readings) within each
replicate. It is what a **SuperPlot** is drawn from.

## When to use it

- You ran the experiment **more than once** (separate days, separate
  animals, separate dishes) and, within each run, measured **many
  individual things** (cells, colonies, readings).
- You want the test to ask "did the experiment come out different
  between groups?", using the number of times you _ran_ the experiment
  as n — not the number of individual measurements. Feeding hundreds of
  individual cells straight into an ordinary t test treats them as if
  they were hundreds of independent experiments, which overstates how
  sure you can be.
- **Not for a single measurement per replicate:** if each biological
  replicate is already one number, use a plain [Column table](03-tables.md)
  instead.

## Why not just average each replicate?

Averaging each replicate down to one number, then running an ordinary t
test on those averages, is a reasonable and commonly used shortcut when
every replicate has about the same number of measurements. The nested t
test does something a little better: it fits a model that weighs each
replicate by how many measurements it actually has, so a replicate with
only a few readings counts for less than one with hundreds. When
replicate sizes are similar this comes out the same as averaging; when
they differ a lot, it doesn't, and the nested test is the one to trust.

## Running it

Choose **Nested** when creating a table, enter your groups as columns and
your biological replicates as the subcolumns under each group; the
individual measurements go down the rows within a replicate. Click
**Analyze…**, choose the **nested t test**, and pick the two groups to
compare.

The results report:

- **t, df and P** for whether the groups differ, from the fitted model
  (not from averaging).
- **The difference between groups**, its SE and 95% CI.
- **Each group's mean**, the number of replicates that had at least one
  usable value (this is what n means here), and how many individual
  values went into them.
- **Between-replicate SD** and **within-replicate SD**: how much
  replicates vary from each other, versus how much individual
  measurements vary within one replicate. A large between-replicate SD
  compared with the within-replicate SD is a sign that which day or
  animal you used matters more than which individual thing you measured.

## Matched replicates: one sample split between the groups

Often each replicate is **one sample split between the groups**: on
Day 1 you split one flask of cells into a control well and a
drug-treated well and imaged both; on Day 2 a new flask, split again,
and so on. Then "Day 1" in Control and "Day 1" in Drug share their
starting material, and the fairest comparison is within each replicate.
In the Analyze dialog, under **How were the replicates run?**, choose
**Matched**.

Being done on the same day isn't enough on its own: separate cultures
or animals for each group, processed on the same day, are still
independent. Decide from how the experiment was designed, never from
which choice gives the smaller P.

The test is then a **paired t test on the replicate means**, which is
what the SuperPlots paper (Lord et al. 2020) uses. Days that differ a
lot from each other stop hiding the effect, as long as the difference
goes the same way every day. Days that disagree about the direction
give a large P. Replicates pair up by position: the first replicate of
one group with the first of the other. A replicate with values in only
one group has nothing to pair with and is left out, and the results
list it.

The results report t, df (the number of pairs minus 1) and P; the mean
of the differences, with its SE and 95% CI; the SD of the differences;
and, with three or more pairs, whether the matching was effective: how
closely the replicate means of one group follow those of the other.

Why a test on the replicate means, when the unmatched test fits a
model? We simulated both. A mixed model with a random experiment
effect said "P < 0.05" in 0–2% of experiments with no real difference,
where a good test says it in 5%, so it would miss real effects too.
The paired t test on the means was right on 5%. It gives every
replicate the same weight, however many cells it has, so keep those
numbers similar where you can.

Three or more groups with matched replicates need a **matched nested
one-way ANOVA**: a repeated-measures ANOVA on the replicate means (see
"Repeated measures" in this guide for what it reports — Geisser-
Greenhouse-corrected P, epsilon, and matched multiple comparisons). A
replicate with a usable value in some groups but not every group is
left out of all of them, the same rule as the matched nested t test's,
and the results name it.

## A caution: replicates that barely differ

The unmatched nested t test and the nested one-way ANOVA fit a mixed
model (the same one Prism uses). When the replicates in a group differ
from each other by very little next to how much the values within a
replicate vary, the model estimates the between-replicate variation at
or near zero and the test becomes **conservative**: in simulations with
no true difference, it called P < 0.05 in under 1% of experiments
instead of the expected 5%. So it never raises false alarms, but it can
miss a real difference in exactly the tidy experiments where the
replicates agree. If the replicate means on the SuperPlot look clearly
separated between groups while the test says "ns", say so when you
report it, and look at the replicate means themselves.

## Descriptive statistics

Choose **Descriptive statistics** to summarise groups without comparing
them. It reports, for each group:

- **The group summary, from each replicate's own mean** (the number to
  put in a figure legend): how many replicates had a usable value (n),
  their mean, SD, SEM and 95% CI. This is the same n a nested t test or
  nested one-way ANOVA counts, and what a SuperPlot's own error bar
  already shows — it treats "how many times we ran the experiment" as
  the sample size, not "how many cells or wells we looked at".
- **Each replicate's own numbers**: n, mean, SD and SEM of the individual
  values within it, for spotting one replicate that behaved oddly.
- **Pooled, for reference only**: n, mean and SD over every individual
  value, ignoring which replicate it came from. Never use this n for a
  test or an error bar — pooling collapses the replicate structure and
  can make a result look far more certain than it is
  (pseudoreplication). It's shown only because it's a number people
  reach for out of habit; the group summary above is the one that
  matters.

## Normality tests

Choose **Normality tests** to check whether each group's replicate means
look like they come from a bell-shaped (Gaussian) distribution — the
same D'Agostino-Pearson and Shapiro-Wilk tests as a Column table's
[normality tests](10-normality.md), run on the replicate means
(`nestedReplicateMeans`) rather than on every individual value. This is
what the matched nested t test, the matched nested one-way ANOVA and
this table's own descriptive statistics (above) actually assume.

**Read this before trusting a "passed":** the usual Nested-table
experiment has three biological replicates per group. Three is
Shapiro-Wilk's absolute minimum to run at all, and with that few points
a normality test has essentially no power to detect non-normality — it
will pass almost regardless of the true shape. A pass here does **not**
confirm the assumption is met; decide mostly from what you know about
the kind of measurement, the same advice the Column-table normality
tests give for a "few values", only more so here. The results repeat
this caution.

Run it on its own: click **Analyze…** on a Nested table, then the
**Normality tests** tile, and pick the groups. There are no options.

## Comparing three or more groups: nested one-way ANOVA

Choose **nested one-way ANOVA** instead of the nested t test when
comparing three or more groups. It reports:

- **The overall F, df and P**: whether the group means differ at all.
  It doesn't say which groups differ; the comparisons below do.
- **Which groups differ (multiple comparisons)**, the same choice as the
  ordinary one-way ANOVA's: compare every group with every other
  (**Tukey**, **Bonferroni** or **Šidák**), or every group with a
  control (**Dunnett**, Bonferroni or Šidák). Each P is adjusted for the
  number of comparisons.
- **Between-replicate SD** and **within-replicate SD**, as the nested t
  test reports them.

There's no Welch or Brown-Forsythe version here: the model already
separates how much replicates vary from each other from how much
individual values vary within one replicate, so there's nothing
analogous to "assume the groups have different SDs" to turn on.

## The SuperPlot graph

Click **New graph** on a Nested table and you get a SuperPlot by
default, drawn as in Lord et al. (2020), Figure 1: every individual
value as a small, pale point, coloured _and_ shaped by which
biological replicate it belongs to (replicate 1 is the same colour and
shape in every group, so the graph still reads in black and white).
Each replicate's own mean sits on top as a large point of the same
colour and shape, spread sideways if two would overlap. The line and
error bar are the mean ± SEM _of the replicate means_ (n = number of
replicates, not number of values) — the paper's recommendation, since
that shows how repeatable the experiment was. Pick SD or a 95% CI in
the format panel instead if you prefer. Significance brackets from the
nested t test, nested one-way ANOVA or matched nested one-way ANOVA
draw as on any other graph.

Is replicate 1 in Control the _same_ sample as replicate 1 in Treated:
one culture, animal or batch of cells split between them and handled in
parallel? (Being done on the same day isn't enough on its own.) Then
the replicate means pair
up, and a trend that holds within every experiment shows as the same
colour moving the same way in every group — even when the days differ
a lot from each other. Choose the **matched** nested t test for such
data (above): the unmatched test treats the experiments in each group
as separate ones, so a consistent trend over very different days can
come out "ns".

Turn the colouring off (or on for an existing graph) in the format
panel's **Plot** section, "Colour points by biological replicate
(SuperPlot)" — the graph switches back to an ordinary dot plot, one
colour per group.
