# Normalizing to a control

Normalizing re-expresses your numbers against a control, so that
experiments on different days or scales can be compared and plotted
together: "fold of vehicle", "% of untreated", or a 0 to 100% scale between
a no-drug and a full-effect control. It is Prism's _Transform, Normalize_.

## Making a normalized table

Open the table and choose **Normalize…** under the data. You get a **new
table** next to the original; the original is never changed. Analyses and
graphs can point at the new table like any other.

Choose what to compare everything to:

- **A control group.** Pick the control data set, and whether to divide by
  the control **in the same row** (each experiment against its own control,
  the usual bench case: every replicate or day has its own control) or by
  **the average of the whole control group**. Show the result as a **fold of
  control** (the control is 1) or **% of control** (the control is 100).
- **A number I type.** Every value is divided by it.
- **A 0 to 100% scale between two reference points**, as in Prism. 0% can be
  the smallest value in each data set, the value in its first row, a number,
  or the average of one data set; 100% can be the largest value, the value
  in the last row, the sum of the data set, a number, or the average of one
  data set (for example, 0% = no drug, 100% = positive control). Each data
  set is rescaled on its own.

The formula is always `(value − 0% reference) ÷ (100% reference − 0% reference)`,
times 100 for percent.

## Rules worth knowing

- **Empty cells stay empty.** If a control is missing in a row, that whole row
  is empty in the normalized table (a value can't be compared with a control
  that wasn't measured).
- **Replicates keep their structure.** Dividing by the row's control uses the
  average of the control's replicates in that row, and each replicate is
  divided separately. For a 0 to 100% scale, the reference points come from
  the replicate averages, as in Prism.
- **A control of 0 is refused.** You can't divide by 0; the table says which
  data set or row is the problem, and recovers as soon as the original is
  fixed. A negative control is allowed and gives negative results.
- **Excluded values** are left out of the references and of the result.
- **Summary data (mean, SD, n)** can be normalized as a whole, not row by row:
  the means are rescaled and each SD is divided by the same factor. Change
  CV data to SD first.
- **Column, Grouped and XY tables** can be normalized (in an XY table, X is
  copied and only the Y data sets change). Nested and Contingency tables
  can't.

## It stays up to date

The normalized table is _calculated_: edit the original and it follows, and
Undo undoes both. You can't type into it. Use **Change normalization…** to
change the setting, or **Detach (make editable)** to keep the numbers as an
ordinary table that no longer follows the original.

Its axis title says what it is ("% of control"), and every analysis of it
says it was normalized, and to what.

## Testing normalized data

The control you normalized to becomes constant (every value 1 or 100,
standard deviation 0), so it **can't be tested against itself**: a test
there would compare the other groups with a number that had no
variation of its own. To compare the control with the others, test the
original, un-normalized data. Tests on normalized data of the _other_
groups are fine, but think about whether the normalization is part of the
question; when in doubt, test the raw data.
