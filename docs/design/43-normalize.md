# Normalize: a calculated table (Prism's Transform / Normalize)

Issue #118. Bench users normalise to a control before testing (fold of
vehicle, % of untreated). Until now only the dose-response models
normalised, inside the fit. This adds a general step.

## What Prism does (user guide, "Normalize")

- 0% can be the smallest value in each data set, the value in the first
  row, or a value you enter. 100% can be the largest value in each data
  set, the value in the last row, the sum of the column, or a value you
  enter. Results as fractions or percentages.
- With replicates, 0% and 100% come from the *means of the replicates*;
  the means or each sub column can be normalised. Individual replicates can
  therefore fall outside 0-100; the banner and dialog say so (replicates
  present, 0-100 scale only).
- X is copied, not normalised. SD/SEM are divided by the range; subtracting
  the baseline does not change them.
- The guide says nothing about blanks, a zero denominator or negative
  values. Those choices are ours, below.

## Design

A **calculated table**: an ordinary `Table` with an optional
`derived: { kind: 'normalize', source, options, problem }`. Keeping it a
real table means analyses, graphs, hashing, the notebook and `.bsig` work
unchanged. The DAG gains one edge, table -> table (`deps.ts`).

`applyEdit` ends with `syncDerived`, which recomputes every calculated
table from its source, so an edit to the source flows through (and undo
restores both, as one project). Ids of rows and data sets are derived
deterministically from the source's ids so graphs keep pointing at them.
A calculated table cannot be edited cell by cell ("Edit the original
instead"); title, notes, colours and decimals can. "Detach" turns it into
a plain table; duplicating one does the same. Deleting the source deletes
its calculated tables (and what hangs off them), as for analyses.

One formula covers everything:

    y' = (y - zero) / (full - zero) * k        k = 1 (fraction) or 100 (percent)

- Fold of a control / % of a control: `zero` = value 0, `full` = control.
- 0-100% between two references: `zero` and `full` as in Prism.

References: a **value**; the **mean of a data set** (the control; the mean of
its row means, or its own row's mean when normalising by row); and, for
`by: 'whole'`, the **smallest / largest / sum / first row / last row** of
the data set being normalised (Prism's choices; row means for replicates).

`by`:
- `whole` (Prism's way): one reference per data set.
- `row`: each row to its own control, the common bench case (experiments
  in rows). Only value / data-set references. Replicates keep their
  structure: each replicate is divided by the control's mean in that row.
  A row where the control is missing becomes missing in every data set.

Rules: missing stays `null` (grid, engine, file); excluded values become
`null` in the result. A zero `full - zero` is refused with a plain message
and the calculated table is left blank with that message shown (a later edit
that fixes the source recovers it). A negative control is allowed for raw
data (result is as the arithmetic says).

Types: Column, Grouped, XY (Y data sets; X copied). Not Nested or
Contingency (a count or a nested replicate is not a "response").

Summary data (mean, SD, n): `whole` only. Mean, lower and upper limits take
the formula; SD and SEM are multiplied by `k / (full - zero)`; n is
copied. CV formats are refused (convert to SD first), as is a negative
scale (SD would flip sign), and `row` (no error propagation). Intentional
differences from Prism: per-row mode, control-data-set references, and
refusing instead of silently producing a blank.

## Where it is stated

The calculated table's Y title defaults to "% of control", "Fold of
control" or "Normalized (% of range)", so graphs carry it on the axis. The
table page says "Calculated from X: ...", and every analysis result on it
shows the same sentence plus the caveat: a control that is the reference is
constant, so it cannot be tested against itself; test the original data
for that. (The issue also suggests a one-sample test against 100 or 1; the
app has no one-sample test yet, so that is a follow-up issue.)

## Validation

`src/analyses/normalize/oracle.R` (plain R arithmetic, written per case with
`apply`/`sweep`, independent of the TypeScript) generates fixtures: column
and grouped, unequal n and missing values, replicates, n = 2, a negative
and a tiny control, row mode, 0-100 range, summary data checked against
raw values with the same mean/SD/n. The app's own test runs the TypeScript
on the same inputs; tolerance 1e-6 relative. No R in the app: parity is
skipped (`parity = FALSE`).
