# Two-way ANOVA

Two-way ANOVA looks at two factors at once, for example genotype and
treatment. It asks three questions:

- **Row factor:** do the rows differ, averaged over the data sets?
- **Column factor:** do the data sets differ, averaged over the rows?
- **Interaction:** does the effect of one factor depend on the other?
  For example, does the drug work in wild type but not in the knockout?

It runs on a [Grouped table](03-tables.md#grouped-tables): the rows are
one factor, the data sets (columns) the other, and each cell holds that
combination’s replicates.

## When to use it

- Two factors, each subject measured in **one** cell only.
- The values are roughly **Gaussian** and independent, with about the
  **same SD** in every cell.
- **Not for repeated measures** (the same subject measured in several
  cells, for example over time): that isn’t available yet.
- It needs at least two data sets and two rows with values.

## Running it

On the Grouped table click **Analyze…**, then **Two-way ANOVA**, and tick
the data sets under **Which groups?**. Under **Multiple comparisons**
choose what to compare:

- “Only the ANOVA table”
- “Within each row, compare the data sets (simple effects)” (the default)
- “Within each data set, compare the rows (simple effects)”
- “Compare the data sets, averaged over rows (main column effect)”
- “Compare the rows, averaged over data sets (main row effect)”
- “Compare every cell with every other cell”

Then choose “Every pair” or “Each against a control” (then pick the
**Control**; not offered for every cell), and the **Test**: Tukey
(recommended), Bonferroni or Šidák for every pair; Dunnett (recommended),
Bonferroni or Šidák against a control.

Comparisons form one **family** per row or data set, as Prism
recommends, and each P is **adjusted** for the comparisons in its family,
so the 5% chance of a false “significant” result applies to the family
as a whole.

**From summary data** (mean, SD or SEM or %CV, and n) the ANOVA runs when
every cell has the same n. With different n it asks for the individual
values.

## Which model

- **Every cell has values and some have replicates:** the full model,
  with interaction.
- **One value per cell:** the interaction can’t be estimated, so none is
  assumed (main effects only), as in Prism. Comparisons within rows,
  within data sets or between cells then need more than one value per
  cell; compare the main effects instead.
- **A cell with no values:** the full model can’t be fitted, so main
  effects only, as in Prism. Multiple comparisons aren’t available then;
  fill in the cell or compare fewer groups.

The line under the reading says which model was used. Rows with no values
at all are left out and counted under **Data summary**.

## Reading the results

The sentence at the top starts with the interaction. If it is
significant, the main effects are hard to read on their own: look at the
comparisons within rows or data sets instead.

- **Source of variation:** for **Interaction**, **Row factor** and
  **Column factor**, the **% of total variation**, **P value**, **P value
  summary** (the asterisks) and **Significant?**.
- **ANOVA table:** **SS (Type III)**, **DF**, **MS**, **F (DFn, DFd)**
  and **P value** for each term, then **Residual** and **Total**.
- **Cell means:** each cell’s mean with its n in parentheses.
- **Data summary:** the number of data sets, rows and values, and what
  was left out.
- **Multiple comparisons**, one table per family: **Mean diff.** (first
  minus second), **95.00% CI of diff.**, **Significant?**, **Summary** and
  **Adjusted P value**; then **Test details** with the SE of the
  difference, q (Tukey) or t, and DF.

Main effects compare **least-squares means**, the plain average of the
cell means, which is the ordinary mean when every cell has the same n.
With unequal n the Type III sums of squares don’t add up to the total,
as in Prism. A P of 0.05 or more is “no evidence” of an effect, not proof
there is none. The asterisks: ns P ≥ 0.05, `*` P < 0.05, `**` P < 0.01,
`***` P < 0.001, `****` P < 0.0001.

## Prism and BarelySig

Prism runs this as “Two-way ANOVA (or mixed model)”. BarelySig uses
Prism’s Type III sums of squares and its choices of model, and differs
where Prism does more:

- **Summary data with different n per cell:** Prism uses an approximate
  method; BarelySig asks for the values instead.
- **Comparisons with an empty cell** aren’t available.
- **Main effects with unequal n:** Prism doesn’t say whether it compares
  least-squares or weighted means; BarelySig uses least-squares means.

The numbers are checked against R’s `drop1` with sum-to-zero contrasts,
the car package’s `Anova` and the emmeans package, on cases with missing
values, an empty cell, one value per cell, unbalanced data, zero spread
in a cell and a very small P.

## On a graph

A grouped bar graph of the table offers brackets from the comparisons
within rows, within data sets and between cells. Main-effect comparisons
compare averages that no bar shows, so they give no brackets. See
[Graphs](12-graphs.md).
