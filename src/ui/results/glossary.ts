/**
 * Plain words for the terms a results sheet uses (#33): shown when the
 * pointer rests on a row or column label, for a reader with no statistics
 * background. Keyed by the label as the sheet writes it.
 */
const TERMS: readonly (readonly [RegExp, string])[] = [
  [
    /^P value summary$/,
    'The P value as asterisks: ns P ≥ 0.05, * < 0.05, ** < 0.01, *** < 0.001, **** < 0.0001.',
  ],
  [
    /^P value/,
    'How often a difference at least this large would turn up by chance if there were no real difference.',
  ],
  [
    /^t, df$/,
    't: the difference measured in units of its standard error. df (degrees of freedom): how much data the estimate of spread rests on.',
  ],
  [
    /^DF$|^df$/,
    'Degrees of freedom: how much data the estimate of spread rests on (roughly, the number of values minus the number of means estimated).',
  ],
  [
    /^F \(DFn, DFd\)$|^F$/,
    'F: how much the group means differ compared with the spread within groups. DFn and DFd are the degrees of freedom of the two.',
  ],
  [
    /^SS/,
    'Sum of squares: variation, measured as squared distances. Type III: each factor’s share after allowing for the others.',
  ],
  [/^MS$/, 'Mean square: a sum of squares divided by its degrees of freedom.'],
  [
    /^R squared \(eta squared\)$|^R squared$/,
    'The share of all the variation that the grouping explains, from 0 (none) to 1 (all).',
  ],
  [
    /^R squared \(partial eta squared\)$/,
    'The share of the variation within subjects that the difference between the conditions explains, from 0 to 1.',
  ],
  [/^Std\. deviation$|^SD$/, 'Standard deviation: the spread of the values around their mean.'],
  [
    /^Std\. error of mean$|^SE of diff\.$|SEM/,
    'Standard error: how precisely a mean (or difference) is known; it shrinks as n grows.',
  ],
  [
    /95% (CI|confidence)/,
    'The range that would contain the true value in 95% of experiments like this one.',
  ],
  [/^Coefficient of variation$/, 'The SD as a percentage of the mean.'],
  [
    /^Geometric mean$/,
    'The mean of the logarithms, turned back: the typical value of numbers that vary by fold changes.',
  ],
  [
    /Hodges-Lehmann/,
    'The median of all differences between a value of one group and a value of the other: a rank test’s estimate of how far apart the groups are.',
  ],
  [/^Mann-Whitney U$/, 'How much the two groups’ ranks overlap: 0 means no overlap at all.'],
  [/\(W\)$/, 'The sum of the ranks of the differences, with the sign of each difference.'],
  [/^Kruskal-Wallis statistic$/, 'H: how far apart the groups’ mean ranks are.'],
  [
    /^Mean rank/,
    'The values of all groups ranked together; a group’s mean rank is the average of its values’ ranks.',
  ],
  [
    /^Sum of ranks$/,
    'The values of all groups ranked together; a group’s sum of its values’ ranks.',
  ],
  [
    /^(q|t|z)$/,
    'The test statistic of the comparison: the difference measured in units of its standard error.',
  ],
  [/^Mean diff\.$/, 'The difference between the two means, first minus second.'],
  [
    /^Interaction$/,
    'Whether the effect of one factor depends on the other (for example, the treatment works in one genotype but not the other).',
  ],
  [
    /^Row factor$|^Column factor$/,
    'Whether this factor changes the values, averaged over the other factor.',
  ],
  [
    /^Residual$/,
    'The variation within cells that neither factor explains: the scatter between replicates.',
  ],
  [/^Bartlett/, 'A test of whether the groups have different SDs.'],
  [/^F test$/, 'A test of whether the two groups have different SDs.'],
  [
    /^Spearman r$|^Correlation coefficient \(r\)$/,
    'How closely the two measurements of each pair rise and fall together, from −1 to 1.',
  ],
  [
    /^D’Agostino/,
    'A normality test from the shape of the distribution (its skew and tails). Here asterisks mean the values depart from a bell shape.',
  ],
  [
    /^Shapiro-Wilk/,
    'A normality test comparing the values with a bell-shaped distribution. Here asterisks mean the values depart from a bell shape.',
  ],
];

/** A plain-words explanation of a results label, or undefined. */
export function explain(label: string): string | undefined {
  return TERMS.find(([re]) => re.test(label))?.[1];
}
