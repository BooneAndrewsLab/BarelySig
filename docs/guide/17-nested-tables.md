# Nested tables and the nested t test

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

Comparing three or more groups this way, and the SuperPlot graph itself,
are coming in a later release.
