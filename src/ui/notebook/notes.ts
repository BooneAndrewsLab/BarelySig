/**
 * Margin notes (item 08, #56): a few plain sentences beside each section
 * of an experiment's page, for a reader with no statistics background.
 * They say what the numbers are and what a test does; they never state a
 * result (the section beside them does, and the two could fall out of
 * step).
 */
import type { Analysis, Comparisons, ErrorBar, Graph, Project, Whiskers } from '@/model/project';
import type { Table } from '@/model/table';

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

/** The note beside section 1, from how the table's values are entered. */
export function dataNotes(table: Table): Note[] {
  const kicker = 'About these data';
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
            'The Geisser-Greenhouse correction widens the P when the groups don’t vary together the same way (epsilon below 1); Prism reports that corrected P by default.',
            ...(comps ? [comps] : []),
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
            'The Geisser-Greenhouse correction widens the P when the groups don’t vary together the same way (epsilon below 1); Prism reports that corrected P by default.',
            ...(comps ? [comps] : []),
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
