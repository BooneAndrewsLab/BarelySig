# Repeated-measures two-way ANOVA

Compares a Grouped table's row factor and column factor when **one of
them is measured on the same subjects** — the same animals across every
time point, say — rather than independent groups. The matched version
of [two-way ANOVA](09-two-way-anova.md).

## When to use it

- A Grouped table, values only (not summary data): matching subjects by
  subcolumn position needs every value.
- **One factor repeated.** Choose which one:
  - **Data sets repeated** (the usual shape): subcolumn _s_ of row _r_
    is one subject, matched across the row's data sets. The row factor
    is between-subjects (e.g. a treatment group) — a different set of
    subjects per row.
  - **Rows repeated**: the mirror image — subcolumn _s_ of data set _c_
    is one subject, matched across the table's rows. The column factor
    is between-subjects.
- A subject with a value missing in any repeated level is left out
  entirely, not just the cell it's missing from.
- **Both factors repeated** (every subject measured under every
  row-column combination, no between-subjects factor) isn't built yet.

## Running it

Click **Analyze…**, then **Repeated-measures two-way ANOVA**, tick the
data sets, and choose which factor is repeated. There are no multiple
comparisons yet — only the ANOVA table.

The results give three tested terms:

- **The between-subjects factor**: an ordinary F test, no correction
  needed.
- **The repeated factor** and **the interaction**: both use the
  Geisser-Greenhouse correction by default, the same reason
  [repeated-measures ANOVA](18-repeated-measures.md) does — subjects
  that don't vary together the same way across the repeated levels
  widen the corrected P. Both share one epsilon, since they're tested
  from the same within-subject structure.

A fourth row, **subjects**, is descriptive only (it's the error term
the between-subjects factor is tested against) — Prism doesn't report a
P for it either.
