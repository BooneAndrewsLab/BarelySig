/**
 * Margin notes (item 08, #56): a few plain sentences beside each section
 * of an experiment's page, for a reader with no statistics background.
 * They say what the numbers are and what a test does; they never state a
 * result (the section beside them does, and the two could fall out of
 * step).
 */
import type { Analysis, Comparisons, ErrorBar, Graph, Project, Whiskers } from '@/model/project';
import type { Table } from '@/model/table';

import { anyShared, effectiveShared } from '@/analyses/nonlinear-regression/constraints';
import { doseResponseModel, effectiveConstraints } from '@/analyses/nonlinear-regression/models';
import { testName } from '../analysisKinds';
import { COMPARISON_TEST } from '../results/reading';

export interface Note {
  /** The small line on top: "About these data", "What this means", "On this graph". */
  readonly kicker: string;
  readonly title?: string;
  /** One sentence per paragraph. */
  readonly text: readonly string[];
}

const EMPTY_CELLS = 'An empty cell stays empty: it is not a zero.';

const CAUTIOUS_NESTED =
  'When the replicates within a group barely differ from each other, this test is more cautious than it needs to be: it can miss a real difference, but it doesn’t raise false alarms.';

/** The note beside section 1, from how the table's values are entered. */
export function dataNotes(table: Table): Note[] {
  const kicker = 'About these data';
  if (table.type === 'xy') {
    return [
      {
        kicker,
        title: 'X and Y',
        text: [
          'The first column is X, shared by every data set to its right; each Y data set is one series measured at those X values.',
          'A row with no X value drops out everywhere in that row, since there’s nothing to plot or fit it against; a row with X but no Y just drops from that one series.',
          table.format.kind === 'summary'
            ? 'Each Y value here is a mean, not a replicate: regression and correlation use the mean at each X.'
            : 'More than one replicate at the same X is fine — each one is its own point, sharing that X.',
        ],
      },
    ];
  }
  if (table.format.kind === 'summary') {
    const withN = table.format.stats.endsWith('-n');
    return [
      {
        kicker,
        title: 'Summary data',
        text: [
          'Each group is entered as its mean, its spread and n, not as its values.',
          withN
            ? 'Rank tests and paired tests need the individual values, so they can’t run on these; t tests and ANOVA can.'
            : 'Without n these can be graphed but not tested: switch to a format with n to analyze them.',
        ],
      },
    ];
  }
  if (table.type === 'nested') {
    return [
      {
        kicker,
        title: 'Biological replicates',
        text: [
          'Each column is a group; the subcolumns under it are separate biological replicates (separate experiments, animals or dishes). Each value is one individual measurement within a replicate.',
          EMPTY_CELLS,
          'This is what a SuperPlot is drawn from: it lets the test count how many times you ran the experiment, not how many individual things you measured.',
        ],
      },
    ];
  }
  if (table.type === 'contingency') {
    return [
      {
        kicker,
        title: 'Counts, not values',
        text: [
          'Each row is one level of one category, each data set (column) one level of the other; each cell is how many observations fell into that row and column together.',
          'Every cell needs a count before a test can run — 0 is a real count, an empty cell is not.',
        ],
      },
    ];
  }
  if (table.type === 'grouped') {
    return [
      {
        kicker,
        title: table.format.count > 1 ? 'Replicates side by side' : 'Two factors',
        text: [
          table.format.count > 1
            ? 'Each row is one level of one factor, each data set one level of the other; the columns under a data set (Y1, Y2…) are its replicates.'
            : 'Each row is one level of one factor, each data set one level of the other.',
          EMPTY_CELLS,
        ],
      },
    ];
  }
  return [
    {
      kicker,
      title: 'Replicates, not means',
      text: [
        'Each number is one replicate: a well, a mouse, a plate. Paste straight from Excel with Ctrl+V.',
        EMPTY_CELLS,
        'Measured each subject under every condition? Keep each subject on one row: paired tests pair values by row.',
      ],
    },
  ];
}

const NS = '“ns” means no evidence of a difference, not that the groups are the same.';

const ONE_TAILED =
  'One-tailed: only a difference in the direction you predicted counts. Choose it before seeing the data, or not at all.';

function comparisonsText(table: Table | undefined, c: Comparisons): string | null {
  if (c.kind === 'none') return null;
  const name = COMPARISON_TEST[c.test] ?? c.test;
  const unequal = ['games-howell', 'dunnett-t3', 'tamhane-t2'].includes(c.test)
    ? ' without assuming the groups have the same SD'
    : '';
  if (c.kind === 'all') {
    return `${name} test compares every pair of groups${unequal}, and adjusts each P for the number of pairs, so testing many pairs doesn’t raise your chance of a false positive.`;
  }
  const control = table?.dataSets.find((d) => d.id === c.control)?.title;
  return `${name} test compares each group with the control${control ? ` (${control})` : ''}${unequal}, not every pair, and adjusts each P for the number of comparisons.`;
}

/** The note beside an analysis: what the test asks, in plain words. */
export function analysisNotes(project: Project, analysis: Analysis): Note[] {
  const kicker = 'What this means';
  const title = testName(analysis);
  const table =
    analysis.input.kind === 'table' ? project.tables.get(analysis.input.table) : undefined;
  switch (analysis.kind) {
    case 'descriptive':
      return [
        {
          kicker,
          title,
          text: [
            'SD: how spread out the values are. SEM: how precisely the mean is known; it shrinks as n grows.',
            '95% CI of the mean: the range that would contain the true mean in 95% of experiments like this one.',
          ],
        },
      ];
    case 'nested-descriptive':
      return [
        {
          kicker,
          title,
          text: [
            'The group summary is computed from each biological replicate’s own mean, the same n a nested t test or nested one-way ANOVA would use — not from every individual value.',
            'The pooled numbers (every individual value, ignoring the replicate structure) are shown for reference only: never use that n for a test or an error bar. Pooling inflates the apparent sample size and can manufacture significance that isn’t there.',
          ],
        },
      ];
    case 't-test': {
      const o = analysis.options;
      const text = o.paired
        ? [
            'Works on the difference within each row (each subject) and asks whether the mean difference is zero.',
            'A row with a value missing on either side drops out of the pairing.',
          ]
        : [
            'Asks whether the two means differ by more than the spread within the groups would explain by chance.',
            o.welch
              ? 'Welch’s version doesn’t assume the two groups have the same SD.'
              : 'It assumes both groups have the same SD; Welch’s version (Change analysis…) doesn’t.',
          ];
      return [{ kicker, title, text: [...text, ...(o.tails === 'one' ? [ONE_TAILED] : []), NS] }];
    }
    case 'nested-t-test': {
      const o = analysis.options;
      return [
        {
          kicker,
          title,
          text: [
            ...(o.matched
              ? [
                  'Each replicate is one sample split between both groups, so it compares the groups within each replicate: a paired t test on the replicate means.',
                  'A day when everything read high doesn’t hide the effect, as long as the difference goes the same way every time. A replicate with values in only one group is left out.',
                ]
              : [
                  'Fits a model where each biological replicate contributes its own mean, then asks whether the two groups differ more than the replicates within each group would explain by chance.',
                  'A replicate run more times counts for more, but not simply by averaging it in equally: replicates with fewer values still count, just less.',
                  CAUTIOUS_NESTED,
                ]),
            ...(o.tails === 'one' ? [ONE_TAILED] : []),
            NS,
          ],
        },
      ];
    }
    case 'rank-test': {
      const o = analysis.options;
      const text = o.paired
        ? [
            'Ranks the differences within each row (each subject), so one extreme pair can’t dominate.',
            'A row with a value missing on either side drops out of the pairing.',
          ]
        : [
            'Compares the ranks of the values instead of the values, so one extreme value can’t dominate.',
            'It asks whether the values of one group tend to be larger, not whether the means differ.',
          ];
      return [{ kicker, title, text: [...text, ...(o.tails === 'one' ? [ONE_TAILED] : []), NS] }];
    }
    case 'one-way-anova': {
      const o = analysis.options;
      const comps = comparisonsText(table, o.comparisons);
      return [
        {
          kicker,
          title,
          text: [
            'Asks whether the group means are all the same, compared with the spread within the groups. It doesn’t say which groups differ; the comparisons below do.',
            ...(o.welch ? ['Welch’s version doesn’t assume the groups have the same SD.'] : []),
            ...(comps ? [comps] : []),
            NS,
          ],
        },
      ];
    }
    case 'nested-one-way-anova': {
      const o = analysis.options;
      const comps = comparisonsText(table, o.comparisons);
      return [
        {
          kicker,
          title,
          text: [
            'Asks whether the group means are all the same, weighing each biological replicate by how many values it has. It doesn’t say which groups differ; the comparisons below do.',
            CAUTIOUS_NESTED,
            ...(comps ? [comps] : []),
            NS,
          ],
        },
      ];
    }
    case 'kruskal-wallis': {
      const o = analysis.options;
      const dunn =
        o.comparisons.kind === 'none'
          ? []
          : [
              `Dunn’s test compares ${o.comparisons.kind === 'all' ? 'every pair of groups' : 'each group with the control'} by their mean ranks${o.corrected ? ', and adjusts each P for the number of comparisons' : '. You chose not to adjust P for the number of comparisons, so each P is for its comparison alone'}.`,
            ];
      return [
        {
          kicker,
          title,
          text: [
            'The rank version of one-way ANOVA: asks whether the values of the groups tend to differ, using ranks so extreme values can’t dominate.',
            ...dunn,
            NS,
          ],
        },
      ];
    }
    case 'two-way-anova':
      return [
        {
          kicker,
          title,
          text: [
            'Asks three questions: does the row factor matter, does the column factor matter, and does the effect of one depend on the other (the interaction)?',
            'Read the interaction first: when its P is small, the effect of each factor depends on the other, and the main effects are hard to read on their own.',
            NS,
          ],
        },
      ];
    case 'repeated-measures-anova': {
      const o = analysis.options;
      const comps = comparisonsText(table, o.comparisons);
      return [
        {
          kicker,
          title,
          text: [
            'Asks whether the group means are all the same, comparing each subject with itself across the groups so a subject that reads high (or low) everywhere doesn’t hide a real difference. It doesn’t say which groups differ; the comparisons below do.',
            'The Geisser-Greenhouse correction widens the P when the groups don’t vary together the same way (epsilon below 1); that corrected P is the one reported by default.',
            ...(comps ? [comps] : []),
            ...(o.assumeSphericity
              ? []
              : [
                  'Comparisons don’t assume sphericity: each pair uses only its own two groups’ pairing, not the ANOVA’s pooled residual.',
                ]),
            NS,
          ],
        },
      ];
    }
    case 'nested-repeated-anova': {
      const o = analysis.options;
      const comps = comparisonsText(table, o.comparisons);
      return [
        {
          kicker,
          title,
          text: [
            'Each replicate is one sample split between every group, so it compares the groups within each replicate: a repeated-measures ANOVA on the replicate means. It doesn’t say which groups differ; the comparisons below do.',
            'A replicate that read high (or low) everywhere doesn’t hide a real difference, as long as it goes the same way every time. A replicate with values in some groups but not every group is left out of all of them.',
            'The Geisser-Greenhouse correction widens the P when the groups don’t vary together the same way (epsilon below 1); that corrected P is the one reported by default.',
            ...(comps ? [comps] : []),
            ...(o.assumeSphericity
              ? []
              : [
                  'Comparisons don’t assume sphericity: each pair uses only its own two groups’ pairing, not the ANOVA’s pooled residual.',
                ]),
            NS,
          ],
        },
      ];
    }
    case 'repeated-two-way-anova': {
      const o = analysis.options;
      return [
        {
          kicker,
          title,
          text: [
            `Asks three questions about ${o.repeatedFactor === 'column' ? 'the data sets' : 'the rows'}, ${o.repeatedFactor === 'column' ? 'matched by subcolumn within each row' : 'matched by subcolumn within each data set'}: does the between-subjects factor matter, does the repeated factor matter, and does the effect of one depend on the other (the interaction)?`,
            'The Geisser-Greenhouse correction widens the repeated factor’s and interaction’s P when subjects don’t vary together the same way (epsilon below 1); that corrected P is the one reported by default. The between-subjects factor needs no such correction.',
            NS,
          ],
        },
      ];
    }
    case 'repeated-two-way-anova-both': {
      return [
        {
          kicker,
          title,
          text: [
            'Every subject is measured at every row-column combination, so there is no between-subjects factor left: asks three questions, all matched — does the row factor matter, does the column factor matter, and does the effect of one depend on the other (the interaction)?',
            'The Geisser-Greenhouse correction widens each term’s P when subjects don’t vary together the same way (epsilon below 1); each of the three terms gets its own correction rather than sharing one, since they come from different parts of the same subjects’ data.',
            NS,
          ],
        },
      ];
    }
    case 'friedman': {
      const o = analysis.options;
      const dunn =
        o.comparisons.kind === 'none'
          ? []
          : [
              `Dunn’s test compares ${o.comparisons.kind === 'all' ? 'every pair of groups' : 'each group with the control'} by their mean ranks${o.corrected ? ', and adjusts each P for the number of comparisons' : '. You chose not to adjust P for the number of comparisons, so each P is for its comparison alone'}.`,
            ];
      return [
        {
          kicker,
          title,
          text: [
            'The rank version of repeated-measures ANOVA: ranks each subject’s values across the groups, so one extreme subject can’t dominate, then asks whether the groups’ ranks tend to differ.',
            ...dunn,
            NS,
          ],
        },
      ];
    }
    case 'normality':
      return [
        {
          kicker,
          title,
          text: [
            'A small P suggests the values don’t come from a normal (bell-shaped) distribution.',
            'A large P is not proof that they do: with a few values per group these tests rarely detect anything. Decide from what you know about the measurement too.',
          ],
        },
      ];
    case 'nested-normality':
      return [
        {
          kicker,
          title,
          text: [
            'Tests each group’s replicate means — the same numbers a matched nested t test, matched nested one-way ANOVA or nested-descriptive’s group summary use — not the individual values.',
            'With this few replicates (often three) a normality test has essentially no power to detect non-normality: it will pass almost regardless of the true shape. A pass here does not confirm the assumption is met; decide mostly from what you know about the measurement.',
          ],
        },
      ];
    case 'paired-normality':
      return [
        {
          kicker,
          title,
          text: [
            'A paired t test assumes the row-by-row differences are Gaussian, not the two groups on their own, so this tests the differences instead.',
            'A small P suggests the differences don’t come from a normal (bell-shaped) distribution. A large P is not proof that they do: with a few pairs these tests rarely detect anything.',
          ],
        },
      ];
    case 'contingency-chi-square':
      return [
        {
          kicker,
          title,
          text: [
            'Asks whether the row and column categories are associated — whether the proportions in each row differ across columns — not which cells drive it.',
            'When some expected counts are small, this test’s P value can be unreliable; Fisher’s exact test doesn’t have that limitation.',
            NS,
          ],
        },
      ];
    case 'contingency-fisher':
      return [
        {
          kicker,
          title,
          text: [
            'The exact version of the same question as the chi-square test: whether the row and column categories are associated, computed directly rather than approximated — the safer choice with small counts.',
            NS,
          ],
        },
      ];
    case 'correlation':
      return [
        {
          kicker,
          title,
          text: [
            analysis.options.method === 'spearman'
              ? 'Spearman’s rho asks whether Y tends to rise (or fall) as X does, using only their rank order — no straight-line shape assumed.'
              : 'Pearson’s r asks how closely X and Y follow a straight line, and in which direction; it is not the same question as whether that line’s slope is exactly right.',
            'One number for the whole series, per Y data set chosen — not a comparison between data sets.',
            NS,
          ],
        },
      ];
    case 'linear-regression':
      return [
        {
          kicker,
          title,
          text: [
            'Fits the straight line through each Y data set that best predicts it from X, and tests whether its slope differs from zero.',
            'The runs test alongside it checks whether the line actually fits: a run of residuals on the same side of the line for a stretch of X suggests the true relationship curves, even when the slope’s own P value is small.',
            NS,
          ],
        },
      ];
    case 'nonlinear-regression': {
      const potency = doseResponseModel(analysis.options.model).potency;
      const effective = effectiveConstraints(analysis.options);
      return [
        {
          kicker,
          title,
          text: [
            `Fits an S-shaped dose-response curve to each Y data set: a bottom and a top plateau, the ${potency} (the dose giving a response halfway between them) and the Hill slope (how steep the rise is; negative for a falling curve).`,
            analysis.options.x === 'concentration'
              ? 'X is read as a dose and fitted on a log scale; a zero dose has no log, so it is left out of the fit.'
              : 'X is read as the log of the dose (−9 for 1 nM); choose “concentrations” in the settings if you typed doses.',
            `The CIs are asymptotic (symmetric around Log${potency}). A “~” marks a value the data barely pin down, usually because a plateau has no points on it.`,
            ...(Object.values(effective).some((c) => c.kind !== 'free')
              ? [
                  'Some parameters are held at a constant (by the model or by you) or kept within limits. A held parameter is not estimated, so it has no SE or CI; a limit the fit runs into counts as held.',
                ]
              : []),
            ...(anyShared(
              effectiveShared(
                analysis.options.shared,
                analysis.input.kind === 'table' ? analysis.input.dataSets.length : 0,
              ),
            )
              ? [
                  'The data sets are fitted together: a parameter you shared has one value for all of them, estimated from every data set’s points, while the rest stay each data set’s own. The fit’s degrees of freedom and variance are pooled over all the points, so each data set’s SEs and CIs come from that one combined fit.',
                ]
              : []),
            ...(analysis.options.weighting !== 'none'
              ? [
                  'The fit is weighted: points expected to scatter more count for less. 1/Y and 1/Y² use the height of the fitted curve (the fit is repeated until the weights settle); 1/X and 1/X² favour low X; 1/SD² uses the spread of the replicates at each X and fits their means. The sum of squares and Sy.x are then weighted, so they are not comparable with an unweighted fit’s.',
                ]
              : []),
            ...(analysis.options.interpolate
              ? [
                  'Rows with a Y value but no X are treated as unknowns and read off the fitted curve. The 95% CI of each X is where the curve’s confidence bands cross that Y; a Y at or beyond a plateau has no X.',
                ]
              : []),
            ...(analysis.options.compare
              ? [
                  'The fit is compared with a simpler curve that holds some parameters at constants. The F test asks whether estimating them improves the fit by more than chance (P below 0.05 says yes); a large P is no evidence of an improvement, which is not proof of none. AICc weighs the fit against the number of parameters and gives the chance each model is the better one.',
                ]
              : []),
            ...(analysis.options.compareWith
              ? [
                  analysis.options.compareWith.kind === 'model'
                    ? `The fit is compared with the same data fitted by a different model. The F test needs the two to be nested (one a special case of the other) and asks whether the more flexible one is better than chance would give at alpha ${String(analysis.options.compareAlpha)}; a large P is no evidence of an improvement, which is not proof of none. AICc works for any two models and gives the chance each is the better one.`
                    : `The fit is compared with the same fit where the parameters you picked are estimated separately for each data set. The F test asks whether letting them differ improves the fit by more than chance at alpha ${String(analysis.options.compareAlpha)}; a large P is no evidence of a difference, which is not proof that there is none. AICc gives the chance each version is the better one.`,
                ]
              : []),
          ],
        },
      ];
    }
    case 'growth-curve':
      return [
        {
          kicker,
          title,
          text: [
            'Fits a bacterial or yeast growth curve (Gompertz) to each Y data set: the asymptote (plateau), growth rate and doubling time at its steepest, and the lag time before growth measurably starts.',
            'Lag phase runs up to the lag time; exponential phase from there to where the curve reaches the asymptote (reported as “end of exponential phase”); stationary phase after that.',
            'The CIs are asymptotic. If the data are declining, or don’t show enough of the rise, the fit says so instead of a number.',
          ],
        },
      ];
    case 'graph-summary':
      return [];
  }
}

const ERROR_WORDS: Readonly<Record<Exclude<ErrorBar, 'none'>, string>> = {
  sd: 'Error bars show the SD: how spread out the values are.',
  sem: 'Error bars show the SEM: how precisely each mean is known. It shrinks as n grows, so it looks smaller than the SD; say which you show.',
  ci95: 'Error bars show the 95% CI of each mean: the range that would contain the true mean in 95% of experiments like this one.',
  range: 'Error bars show the range: from the smallest value to the largest.',
};

function whiskerWords(w: Whiskers): string {
  if (w === 'min-max') return 'Whiskers reach the smallest and largest values.';
  if (w === 'tukey')
    return 'Whiskers reach the furthest values within 1.5 box heights (Tukey’s rule); values beyond them count as outliers.';
  const [lo, hi] = w.slice(1).split('-');
  return `Whiskers reach the ${lo ?? ''}th and ${hi ?? ''}th percentiles.`;
}

/** The note beside a graph: what its marks show and where its brackets come from. */
export function graphNotes(project: Project, graph: Graph): Note[] {
  const plot = graph.plot;
  if (plot.kind === 'xy-scatter') {
    const fitId = graph.analyses[0];
    const fitFrom =
      plot.fit && fitId !== undefined ? project.analyses.get(fitId)?.title : undefined;
    const w = String(graph.size.width);
    const h = String(graph.size.height);
    return [
      {
        kicker: 'On this graph',
        text: [
          ...(fitFrom ? [`The fitted line and band come from “${fitFrom}”.`] : []),
          `It exports at ${w} × ${h} mm. Click any part of it to format that part.`,
        ],
      },
    ];
  }
  const marks =
    plot.kind === 'box'
      ? [
          'The box spans the middle half of the values (the quartiles); the line in it is the median.',
          whiskerWords(plot.whiskers),
        ]
      : plot.kind === 'violin'
        ? ['The width at each height shows how many values lie there (a smoothed density).']
        : plot.error === 'none'
          ? []
          : [ERROR_WORDS[plot.error]];
  const tests = graph.analyses.flatMap((id) => {
    const a = project.analyses.get(id);
    return a ? [a.title] : [];
  });
  const brackets =
    tests.length === 0
      ? []
      : [
          `The brackets come from ${tests.map((t) => `“${t}”`).join(' and ')}. Drag one to move it.`,
        ];
  const w = String(graph.size.width);
  const h = String(graph.size.height);
  return [
    {
      kicker: 'On this graph',
      text: [
        ...marks,
        ...brackets,
        `It exports at ${w} × ${h} mm. Click any part of it to format that part.`,
      ],
    },
  ];
}
