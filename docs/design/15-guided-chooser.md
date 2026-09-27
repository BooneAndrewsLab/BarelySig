# 15. Help me choose, as a guide a novice can follow

Written 2026-09-26 for #73. Replaces the chooser UI of note 06 (#29);
the tests it can suggest, and why, are unchanged unless said here.

## What was asked

"Help me choose must be much better, must be intuitive for even the
dumbest of the biologists who are clueless about stats. Also the help me
choose UI is awkward."

What was awkward, seen in the dialog:

- It was a tile among the tests, and its questions appeared *below* the
  group checkboxes, under a line saying "2 groups chosen below" (they
  were above).
- It took two steps to run: **Use the …** filled the dialog, then
  **Analyze**, which was greyed out in between with a hint saying why.
- It asked in statistics words a novice can't answer: "the same
  subjects", "a bell-shaped (Gaussian, normal) distribution".
- It never asked about a control group, so three or more groups always
  got every pair compared (Tukey), which is not what most bench
  experiments with a control want.

## The guide

**Its own mode.** A new analysis opens on two tabs at the top of the
dialog: **Help me choose** and **Pick a test myself**. Help me choose is
the default the first time; the dialog remembers the last one used in
this browser (localStorage, a per-viewer convenience). Changing an
existing analysis opens straight on the test and its options, as
before.

**One question at a time**, top to bottom. The current question shows
its answers as large cards: a small picture, a short answer in bold and
an example from the bench under it. Clicking a card answers and moves
on. An answered question folds into one line ("Rows: Different samples
in each group") with **Change**, so the whole reasoning stays visible
and any answer can be revisited; later answers are kept, so changing one
goes straight back to a suggestion when nothing else is needed.

**"I'm not sure" is always an answer** to the questions about the
experiment, with a safe default that the suggestion states.

**One click to run.** The suggestion ends the guide: the test's name,
why in plain words, any caveat, and **Run the …**, which creates the
analysis (with the companion normality test when the pick-a-test mode
would offer it, same checkbox). **See its options first** switches to
Pick a test myself with the test and its options filled in.

## The questions

Asked only when they matter; the logic stays a pure function
(`src/ui/shell/chooser.ts`) walked question by question, so the folded
lines are exactly the questions that led to the suggestion.

1. **What do you want to find out?** (Column tables; the others can only
   compare.) *Whether the groups differ* or *The numbers for each group*
   (mean, SD, SEM, n for a table or legend → Descriptive statistics).
2. **Which groups?** Checkboxes with each group's number of values; at
   least two to compare, one to describe. This moves the old "Which
   groups?" fieldset into the guide, so nothing sits between the
   questions.
3. **Do the values in one row belong together?** (Column tables with
   values.) Illustrated with the user's own data: "Row 1 of your table
   has 23.1 in WT, 31.4 in KO and 25 in Rescue." Answers: *No, every
   value is a separate sample* (different mice, wells, dishes,
   patients, even if measured on the same day); *Yes, each row is one
   mouse, patient or split sample* (before and after; treated and
   untreated in one patient; **one culture or batch of cells divided
   between the groups and handled in parallel** — the bench case note
   06's "subjects" missed); *I'm not sure* → treated as not matched,
   saying that real pairing would make the test more sensitive, and to
   ask whoever did the experiment.
   A Nested table asks it about the replicates, as note 14 does: "Was
   *Day 1* one sample split between the groups?"

   **Pairing comes from shared starting material, not the calendar**
   (the user, while this was built: "even if the day 1 experiment was
   done on the same day it's not necessarily paired"). Values pair when
   the design gave them a common source of variation — the same animal,
   one culture split in two — so a replicate that runs high runs high
   in every group. Two independent cultures that happen to be processed
   on the same Monday share only the date. The first draft said "one
   experiment (one day, one batch of cells) that ran every group side
   by side", which invites pairing by date; every place that explains
   matching now leads with the split sample and says the same day isn't
   enough on its own, and that the choice comes from the design, never
   from which answer gives the smaller P (the guide, the nested t
   test's Matched option, its results line and margin note, guide pages
   04 and 17).
4. **What kind of numbers are these?** (Column tables with values, when
   a choice between a t test and a rank test remains.) This replaces
   "can you assume a Gaussian distribution", which a novice can't
   answer, with the question it depends on, which they can (Prism's
   guide says the same: decide from what is known about the kind of
   measurement, not from a normality test on a few values):
   - *Measurements on a smooth scale*: weight, length, absorbance,
     fluorescence intensity, Ct values, % viability → as "Gaussian: yes".
   - *Amounts that grow by multiplying*: concentrations, fold changes,
     expression levels, titres, counts that range from tens to
     thousands → as "Gaussian: no", with the tip that their logarithms
     are often bell-shaped (a column of logs, then a t test).
   - *Scores, ranks or small counts*: a 0–4 pathology score, a rating,
     foci per cell (0, 1, 2 …) → as "Gaussian: no".
   - *I'm not sure* → as "Gaussian: not sure" (note 06: the rank test,
     unless it can never reach P < 0.05 with this few values).
5. **Is one group a control?** (Three or more groups, when the test is
   one-way ANOVA, Kruskal-Wallis or nested one-way ANOVA.) *Yes: compare
   each group with the control* → a picker of the chosen groups (first
   by default), then Dunnett (Dunn's for Kruskal-Wallis); *No: compare
   every group with every other* → Tukey (Dunn's). Prism asks the same
   thing, in the same terms, when setting up comparisons.

Summary data, Grouped and Nested tables skip what doesn't apply, as in
note 06: summary data → unpaired t test / one-way ANOVA; Grouped →
two-way ANOVA (its comparison families stay in the options, **See its
options first**); Nested → never asks about the kind of numbers.

## Decisions

- Pictures are inline SVG drawn in `currentColor` and the accent, no
  new icons in the sprite: they are specific to the guide.
- No automatic choice from the data (normality tests, skewness): the
  kind of measurement decides, as note 06 and Prism's guide say. The
  data is shown only to make the pairing question concrete.
- The names of the answers are UI copy; `chooser.ts` keeps the reasons.
