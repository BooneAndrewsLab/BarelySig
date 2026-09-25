# Graphs

**New graph** above a table draws it: for a Column table, bars of each
group's mean with its SD and every value as a point; for a Grouped table,
bars of every cell, clustered by row, with a legend. The graph appears
under **Graphs** in the navigator and follows the table: change a value
and the graph redraws.

The panel beside the graph holds its settings. Click any part of the graph
to format that part instead: see [Formatting a graph](13-formatting.md).

## Kinds of plot

For a Column table, under **Plot**:

- **Bars:** the mean as a bar, with an error bar. **Show the individual
  values** puts every value on top as a point. A bar is a length, so the
  axis starts at zero.
- **Dots (every value):** each value as a point, arranged so none overlap
  (a "beeswarm"), with a line at the **mean** or the **median** and an
  error bar. The axis fits the data.
- **Box and whiskers:** the box runs from the 25th to the 75th percentile
  with a line at the median. **Whiskers** end at the **Min to max**
  (Prism's default), **Tukey (1.5 × IQR)** (the most extreme values within
  1.5 box heights of the box; values beyond are drawn as points), or a
  percentile range such as the **10th to 90th percentile**. **Points**:
  every value, only the values beyond the whiskers, or none.
- **Violin:** the shape of the distribution, estimated from the values
  (a Gaussian kernel density with Silverman's rule of thumb for the
  bandwidth; **Smoothing** makes it rougher or smoother). A violin is
  drawn from the smallest to the largest value, never beyond, and all
  violins share one width scale so they can be compared. **Inside the
  violin**: the median and quartiles as lines, a thin box plot, every
  value, or nothing.

Box plots and violins need the individual values; a table of summary data
can only be drawn as bars or dots. A violin needs at least 3 different
values.

For a Grouped table, **Bars side by side in each row (interleaved)** is
Prism's default; **Each data set's bars together (separated)** clusters by
column instead and labels each bar with its row. **Legend** puts the
legend at the right, above the graph, or nowhere.

The note under the graph says what the marks show ("Bars: mean ± SD;
points: individual values"), so the figure legend you write can say the
same.

## Error bars

**SD, SEM and 95% CI are different things**, and a figure must say which
it shows:

- **SD** (standard deviation) is the spread of the values: how different
  the replicates are from each other. It doesn't shrink with more
  replicates. Use it to show variability.
- **SEM** (standard error of the mean) is how precisely the mean is
  known: SD divided by √n. It shrinks as n grows. It is smaller than the
  SD, which is why it is popular and why it can mislead.
- **95% CI** (confidence interval of the mean): the range that contains
  the true mean in 95% of experiments like this one. About mean ± 2 SEM
  for large n, wider for small n.
- **Range:** from the smallest value to the largest.

With few replicates, show the points: three values tell a reader more
than any error bar. All error bars are computed by R from the table.

## Significance brackets

Once you have compared groups — a t test, an ANOVA with multiple
comparisons, a Kruskal-Wallis test with Dunn's comparisons, a two-way
ANOVA — the graph offers them under **Significance**. Tick an analysis to
draw its brackets; untick a comparison to hide just that one.

- Labels are asterisks by **Prism's scheme** (ns P ≥ 0.05, * P < 0.05,
  ** P < 0.01, *** P < 0.001, **** P < 0.0001), the **APA** one (up to
  ***), or the **exact P values**. **Show "ns"** hides the brackets of
  differences that aren't significant.
- Multiple comparisons draw the adjusted P that the results sheet shows.
- Brackets stack themselves so none overlap. Drag one to raise it: see
  [Formatting a graph](13-formatting.md#brackets).
- While an analysis reruns (after you changed the data), its brackets are
  hidden rather than showing an old P.
- For a Grouped table, two-way ANOVA comparisons **within rows** draw
  brackets inside each cluster; comparisons within columns and among all
  cells draw them across clusters. Comparisons of row or column means
  (main effects) compare no bar, so they give no brackets.

## Look and size

**Look** switches between **Modern** (the default: axes on the left and
bottom, soft bars with a coloured edge, outward ticks) and **Classic
(Prism-like)** (a box around the plot, solid bars, black points).
**Size (mm)** is the figure's size in print; text and lines keep their
point sizes at any size, as journals ask. See
[Exporting figures](14-export.md).
