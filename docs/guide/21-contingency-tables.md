# Contingency tables, the chi-square test and Fisher's exact test

A Contingency table holds **counts**, not measurements: how many
observations fall into each combination of two categories, e.g. how many
subjects responded or didn't, under a drug or a placebo.

## When to use it

- Each observation falls into exactly one row category and one column
  category (e.g. "responded" / "did not respond" × "drug" / "placebo"),
  and you have the **count** in each combination, not the raw list of
  observations.
- You want to ask whether the two categories are **associated** — whether
  the proportions in each row differ across columns.
- Not for measurements (weights, concentrations, times): use a
  [Column](03-tables.md) or [Grouped](03-tables.md) table for those.

## Entering the table

Choose **Contingency** when creating a table. Each row is one level of the
row category, each data set (column) one level of the column category.
Type the count into each cell — one whole, non-negative number per cell,
never a fraction or a negative number. Every cell needs a count before a
test can run; 0 is a real count and is entered as 0, not left empty.

## Running a test

Click **Analyze…** and choose one of two tests. Both look at the whole
table (or the columns you pick), not just two of them.

### Chi-square test of independence

The usual choice. It asks whether the row and column categories are
associated, and reports χ², df and P. For a 2×2 table it applies Yates'
continuity correction by default (Prism's own default); for a larger
table the correction doesn't apply and isn't used. When some expected
counts are small (below 5), the results say so: the chi-square
approximation can be unreliable there, and Fisher's exact test is the
safer choice.

### Fisher's exact test

The exact version of the same question — no approximation, so it's the
right choice with small counts, exactly the case the chi-square result
warns about. It's always two-tailed here. For a 2×2 table it also
reports an odds ratio with its 95% CI; for a larger table there's no
single odds ratio to report, so those rows don't appear.

Neither test reports which cell or pair of categories drives an
association — that's a single number for the whole table, not a set of
pairwise comparisons, so there are no significance brackets for either
test.

## What's not here yet

Graphing a Contingency table's counts (as stacked or grouped bars) isn't
wired up yet; you can still read the counts and test results without a
graph. "Help me choose" also doesn't yet suggest these tests — pick them
directly from the **Analyze…** dialog.
