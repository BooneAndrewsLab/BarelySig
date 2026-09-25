# Column and Grouped tables

When you create a table you choose its kind. The kind fixes how the data
are laid out, which analyses are offered and which graphs can be drawn.
**New table** in the navigator, or a tile on the start screen, opens the
choice.

## Column tables

Each column is a group; each row is a replicate (a mouse, a well, a
plate). The rows don't need to line up: groups can have different numbers
of values.

| Vehicle | Drug 1 µM | Drug 10 µM |
| ------- | --------- | ---------- |
| 98.2    | 91.7      | 62.3       |
| 101.5   | 88.4      | 58.1       |
| 99.1    | 93.0      | 65.7       |

Use it for [t tests](05-t-tests.md),
[Mann-Whitney and Wilcoxon tests](06-rank-tests.md),
[one-way ANOVA](07-one-way-anova.md), the
[Kruskal-Wallis test](08-kruskal-wallis.md), bar graphs, dot plots, box
plots and violins.

**Paired data:** when each row is one subject measured under every
condition (before and after, left and right), keep each subject on one
row. Paired tests pair values by row; a row with a value missing on
either side drops out of the pairing.

## Grouped tables

Two factors at once: the rows are one factor (for example genotype, or
time point) and the columns the other (for example treatment). Each cell
holds that combination's replicates, side by side in **Y1**, **Y2**, …
You choose the number of **Replicates per cell** when you create the
table.

Use it for [two-way ANOVA](09-two-way-anova.md) and grouped bar graphs.

## Summary data

Instead of the individual values, a table can hold values already
averaged. Choose **Summary data, already averaged** and what you have:

- **Mean, SD and n**, **Mean, SEM and n** or **Mean, %CV and n**: enough
  for unpaired t tests and ANOVA, which need only the mean, SD and n of
  each group.
- **Mean and SD**, **Mean and SEM**, **Mean and %CV** or **Mean with lower
  and upper limits**: without n no test can run, so these are for graphs
  only.

SEM and %CV are turned into the SD the tests need, as Prism does. Tests
that need the individual values — paired tests, rank tests, normality
tests, box plots and violins — say so instead of running.

**Change data format…** above a table changes what it holds (for example
from replicates to summary data) later.

## Names and colours

The group names and each group's colour belong to the table, so every
graph of the table uses the same ones. Change a group's colour from any of
its graphs: see [Formatting a graph](13-formatting.md).
