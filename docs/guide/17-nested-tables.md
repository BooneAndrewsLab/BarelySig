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
nested t test or nested one-way ANOVA draw as on any other graph.

Is replicate 1 in Control the _same_ experiment as replicate 1 in
Treated (same day, same batch of cells)? Then the replicate means pair
up, and a trend that holds within every experiment shows as the same
colour moving the same way in every group — even when the days differ
a lot from each other. (The nested tests don't use that pairing yet:
they treat the experiments in each group as separate ones, so a
consistent trend over very different days can still come out "ns".)

Turn the colouring off (or on for an existing graph) in the format
panel's **Plot** section, "Colour points by biological replicate
(SuperPlot)" — the graph switches back to an ordinary dot plot, one
colour per group.
