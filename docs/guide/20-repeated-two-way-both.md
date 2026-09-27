# Repeated-measures two-way ANOVA, both factors repeated

Compares a Grouped table's row factor and column factor when **every
subject is measured at every row-column combination** — the same
animals at every treatment × time-point cell, say — with no
between-subjects factor left over. The fully-matched version of
[repeated-measures two-way ANOVA](19-repeated-two-way.md), for when
neither factor is between-subjects.

## When to use it

- A Grouped table, values only (not summary data): matching subjects by
  subcolumn position needs every value.
- Subcolumn position is the subject, matched across **every** row and
  every data set: subcolumn _s_ is the same subject at row 1's data set
  1, row 1's data set 2, row 2's data set 1, and so on.
- A subject with a value missing at any row-column cell is left out
  entirely, not just the cell it's missing from.

## Running it

Click **Analyze…**, then **Repeated-measures two-way ANOVA (both
factors repeated)**, and tick the data sets. There are no options and
no multiple comparisons yet — only the ANOVA table.

The results give three tested terms, each with its **own**
Greenhouse-Geisser and Huynh-Feldt correction (unlike the one-factor-
repeated case, where the repeated factor and interaction share a single
epsilon): **the row factor**, **the column factor**, and **the
interaction**. A fourth row, **subjects**, is descriptive only (every
subject's own mean, not tested against anything) — Prism doesn't report
a P for it either.
