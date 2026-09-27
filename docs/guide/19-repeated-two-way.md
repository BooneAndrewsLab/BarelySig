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
  row-column combination, no between-subjects factor): its own analysis,
  [Repeated-measures two-way ANOVA, both factors repeated](20-repeated-two-way-both.md).

## Running it

Click **Analyze…**, then **Repeated-measures two-way ANOVA**, tick the
data sets, and choose which factor is repeated.

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

## Multiple comparisons

Three families to choose from, each compared against its own error
term — a comparison from one family and a comparison from another can
legitimately disagree, even for the same two groups, because they use
different error terms:

- **Compare the between-subjects groups** (averaged over the repeated
  levels): uses the between-subjects error (subjects within groups),
  the same error the ANOVA's own between-subjects F test uses.
- **Compare the repeated levels** (averaged over the between-subjects
  groups): uses the pooled within-subject error, assuming sphericity —
  the same assumption the ANOVA's own repeated-factor test makes.
- **Within each repeated level, compare the between-subjects groups**
  (simple effects): uses the split-plot's combined error term (part
  between-subjects, part within-subject), the classical formula for
  this exact comparison, with its own (usually fractional) degrees of
  freedom.

Every family offers Tukey, Dunnett (against a control), Šidák or
Bonferroni, and reports the _adjusted_ P — never a raw one — with the
test named alongside it.
