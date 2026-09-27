/**
 * "Help me choose" as a guide (item 15, #73): one question at a time about
 * the experiment, in bench words; answered questions fold into a line that
 * can be changed; the suggestion ends with one button that runs it.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { Id } from '@/model/ids';
import type { UserAnalysisSpec } from '@/model/project';
import { columnGroup } from '@/model/selectors';
import { cellKey, type Table } from '@/model/table';

import {
  type ChooserAnswers,
  type ChooserContext,
  minGroups,
  NO_ANSWERS,
  type Question,
  walk,
} from './chooser';
import { GuidePicture, type Picture } from './GuidePicture';

interface Props {
  readonly table: Table;
  readonly chosen: readonly Id[];
  readonly setChosen: (ids: readonly Id[]) => void;
  /**
   * The companion normality test, when the suggestion offers one (the same
   * box as the dialog's): each group's for an unpaired test or ANOVA, the
   * paired differences' for a paired t test (item 18, #53).
   */
  readonly normality: {
    readonly offered: (spec: UserAnalysisSpec) => 'normality' | 'paired-normality' | null;
    readonly on: boolean;
  };
  readonly setNormality: (on: boolean) => void;
  readonly onRun: (spec: UserAnalysisSpec) => void;
  readonly onOptions: (spec: UserAnalysisSpec) => void;
}

/** Values in a data set, as the analyses count them (summary data: its n). */
function valueCount(table: Table, id: Id): number {
  const ds = table.dataSets.find((d) => d.id === id);
  if (!ds) return 0;
  if (table.type === 'column' && table.format.kind === 'summary') {
    const g = columnGroup(table, id);
    return g.kind === 'raw' ? g.values.length : (g.n ?? 0);
  }
  let n = 0;
  ds.subcolumns.forEach((cells, s) => {
    cells.forEach((v, r) => {
      const row = table.rows[r];
      if (v !== null && row && !ds.excluded.has(cellKey(s, row.id))) n += 1;
    });
  });
  return n;
}

/** Pairing comes from the design, not from the calendar or the result (note 15). */
const SAME_DAY =
  'Being measured on the same day isn’t enough on its own. Decide from how the experiment was designed, never from which answer gives a smaller P.';

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** Biological replicates with at least one value (a Nested table's subcolumns). */
const replicates = (subcolumns: readonly (readonly (number | null)[])[]) =>
  subcolumns.filter((cells) => cells.some((v) => v !== null)).length;

const short = (v: number) => String(Number(v.toPrecision(6)));

/** "Row 3 of your table has 23.1 in WT and 31.4 in KO.": the first row with a value in each group. */
function rowExample(table: Table, ids: readonly Id[]): string | null {
  if (table.type !== 'column' || table.format.kind === 'summary') return null;
  const sets = ids.slice(0, 3).map((id) => table.dataSets.find((d) => d.id === id));
  for (let r = 0; r < table.rows.length; r += 1) {
    const parts: string[] = [];
    for (const ds of sets) {
      const v = ds?.subcolumns[0]?.[r];
      if (ds === undefined || v === null || v === undefined) break;
      parts.push(`${short(v)} in ${ds.title || '(untitled)'}`);
    }
    if (parts.length === sets.length && parts.length >= 2) {
      const last = parts.pop() ?? '';
      return `Row ${String(r + 1)} of your table has ${parts.join(', ')} and ${last}.`;
    }
  }
  return null;
}

const list = (titles: readonly string[]) =>
  titles.length <= 1
    ? (titles[0] ?? '')
    : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1] ?? ''}`;

interface Answer<T> {
  readonly value: T;
  readonly picture: Picture;
  readonly title: string;
  readonly example: string;
  /** The folded line once chosen. */
  readonly short: string;
}

function goalAnswers(): readonly Answer<'compare' | 'describe'>[] {
  return [
    {
      value: 'compare',
      picture: 'compare',
      title: 'Whether the groups differ',
      example:
        'Does the drug change viability compared with the control? Is the knockout different?',
      short: 'Whether the groups differ',
    },
    {
      value: 'describe',
      picture: 'describe',
      title: 'The numbers for each group',
      example: 'Mean, SD, SEM and n, for a table or a figure legend. No comparison.',
      short: 'The numbers for each group',
    },
  ];
}

function matchedAnswers(nested: boolean, replicate: string): readonly Answer<'yes' | 'no'>[] {
  return nested
    ? [
        {
          value: 'no',
          picture: 'separate',
          title: 'No, each group’s replicates are independent',
          example: `E.g. control wells from flasks A, B and C, drug wells from flasks D, E and F, even if both were imaged on the same days.`,
          short: 'Independent in each group',
        },
        {
          value: 'yes',
          picture: 'paired',
          title: 'Yes, each replicate was split between the groups',
          example: `E.g. for “${replicate}”, one flask of cells split into a control well and a drug well; the next replicate, a new flask split again.`,
          short: 'Each replicate split between the groups',
        },
      ]
    : [
        {
          value: 'no',
          picture: 'separate',
          title: 'No, every value is a separate sample',
          example:
            'Different mice, wells, dishes or patients in each group, even if they were measured on the same day.',
          short: 'Separate samples',
        },
        {
          value: 'yes',
          picture: 'paired',
          title: 'Yes, each row is one mouse, patient or split sample',
          example:
            'The same mouse before and after; one patient, treated and untreated; one culture or batch of cells divided between the groups and handled in parallel.',
          short: 'Each row belongs together',
        },
      ];
}

const VALUE_ANSWERS: readonly Answer<'measurement' | 'multiplying' | 'score'>[] = [
  {
    value: 'measurement',
    picture: 'bell',
    title: 'Measurements on a smooth scale',
    example: 'Weight, length, absorbance, fluorescence intensity, Ct values, % viability.',
    short: 'Measurements on a smooth scale',
  },
  {
    value: 'multiplying',
    picture: 'skewed',
    title: 'Amounts that grow by multiplying',
    example:
      'Concentrations, fold changes, expression levels, titres, or counts that range from tens to thousands.',
    short: 'Amounts that grow by multiplying',
  },
  {
    value: 'score',
    picture: 'score',
    title: 'Scores, ranks or small counts',
    example: 'A 0–4 pathology score, a rating, a rank, foci per cell (0, 1, 2 …).',
    short: 'Scores, ranks or small counts',
  },
];

function Card(props: {
  readonly picture: Picture;
  readonly title: string;
  readonly example?: string;
  readonly chosen: boolean;
  readonly onPick: () => void;
  readonly small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`guide-card${props.small ? ' small' : ''}${props.chosen ? ' chosen' : ''}`}
      aria-pressed={props.chosen}
      onClick={props.onPick}
    >
      <GuidePicture name={props.picture} />
      <span className="guide-card-title">{props.title}</span>
      {props.example !== undefined && <span className="guide-card-example">{props.example}</span>}
    </button>
  );
}

function Cards<T extends string>(props: {
  readonly answers: readonly Answer<T>[];
  readonly value: T | 'unsure' | null;
  readonly unsure?: string;
  readonly onPick: (v: T | 'unsure') => void;
}) {
  return (
    <div className="guide-cards">
      {props.answers.map((a) => (
        <Card
          key={a.value}
          picture={a.picture}
          title={a.title}
          example={a.example}
          chosen={props.value === a.value}
          onPick={() => {
            props.onPick(a.value);
          }}
        />
      ))}
      {props.unsure !== undefined && (
        <Card
          small
          picture="unsure"
          title="I’m not sure"
          example={props.unsure}
          chosen={props.value === 'unsure'}
          onPick={() => {
            props.onPick('unsure');
          }}
        />
      )}
    </div>
  );
}

function Step(props: {
  readonly question: string;
  readonly help?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <li className="guide-step current">
      <p className="guide-question">{props.question}</p>
      {props.help !== undefined && <p className="guide-help">{props.help}</p>}
      {props.children}
    </li>
  );
}

export function Guide(props: Props) {
  const { table } = props;
  const [answers, setAnswers] = useState<ChooserAnswers>(NO_ANSWERS);
  /** A folded question opened again with Change. */
  const [reopened, setReopened] = useState<Question | null>(null);
  const [controlYes, setControlYes] = useState(false);
  const picked = table.dataSets.filter((d) => props.chosen.includes(d.id));
  const ctx: ChooserContext = {
    tableType: table.type,
    summary: table.format.kind === 'summary',
    groups: picked.map((d) => ({ id: d.id, title: d.title, n: valueCount(table, d.id) })),
  };
  const { answered, next } = walk(answers, ctx);
  const cut = reopened === null ? -1 : answered.indexOf(reopened);
  const folded = cut === -1 ? answered : answered.slice(0, cut);
  const current: Question | null =
    cut !== -1 ? reopened : next.kind === 'ask' ? next.question : null;
  const nested = table.type === 'nested';
  const replicate = (nested ? table.replicateTitles?.[0] : null) ?? 'Replicate 1';

  // Keyboard users land on the next question's first answer.
  const stepRef = useRef<HTMLOListElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    stepRef.current
      ?.querySelector<HTMLElement>(
        '.guide-step.current button, .guide-step.current input, .guide-result button',
      )
      ?.focus();
  }, [current]);

  const answer = (patch: Partial<ChooserAnswers>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setReopened(null);
  };

  const summaryOf = (q: Question): { label: string; value: string } => {
    switch (q) {
      case 'goal':
        return {
          label: 'You want to know',
          value: goalAnswers().find((g) => g.value === answers.goal)?.short ?? '',
        };
      case 'groups':
        return {
          label: table.type === 'grouped' ? 'Data sets' : 'Groups',
          value: list(picked.map((d) => d.title || '(untitled)')),
        };
      case 'matched':
        return {
          label: nested ? 'Replicates' : 'Rows',
          value:
            answers.matched === 'unsure'
              ? 'Not sure (taken as separate)'
              : (matchedAnswers(nested, replicate).find((m) => m.value === answers.matched)
                  ?.short ?? ''),
        };
      case 'values':
        return {
          label: 'The numbers are',
          value:
            answers.values === 'unsure'
              ? 'Not sure'
              : (VALUE_ANSWERS.find((v) => v.value === answers.values)?.short ?? ''),
        };
      case 'control':
        return {
          label: 'Compare',
          value:
            answers.control === 'all'
              ? 'Every group with every other'
              : `Each group with ${picked.find((d) => d.id === answers.control)?.title ?? 'the control'}`,
        };
    }
  };

  const describe = answers.goal === 'describe' && table.type === 'column';
  const need = minGroups(describe ? 'describe' : 'compare');

  const renderCurrent = (q: Question) => {
    switch (q) {
      case 'goal':
        return (
          <Step question="What do you want to find out?">
            <Cards
              answers={goalAnswers()}
              value={answers.goal}
              onPick={(v) => {
                if (v !== 'unsure') answer({ goal: v });
              }}
            />
          </Step>
        );
      case 'groups':
        return (
          <Step
            question={
              describe
                ? 'Which groups do you want the numbers of?'
                : table.type === 'grouped'
                  ? 'Which data sets (columns) do you want to include?'
                  : 'Which groups do you want to compare?'
            }
          >
            <div className="guide-groups">
              {table.dataSets.length === 0 && <p className="hint">This table has no groups yet.</p>}
              {table.dataSets.map((d) => {
                const n = valueCount(table, d.id);
                return (
                  <label key={d.id} className="option">
                    <input
                      type="checkbox"
                      checked={props.chosen.includes(d.id)}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        props.setChosen(
                          on ? [...props.chosen, d.id] : props.chosen.filter((x) => x !== d.id),
                        );
                      }}
                    />
                    {d.title || '(untitled)'}
                    <span className="hint">
                      {plural(n, 'value')}
                      {ctx.summary ? ' (n)' : ''}
                      {nested ? ` in ${plural(replicates(d.subcolumns), 'replicate')}` : ''}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="guide-continue">
              <button
                type="button"
                disabled={picked.length < need}
                onClick={() => {
                  answer({ groups: true });
                }}
              >
                Continue
              </button>
              {picked.length < need && (
                <span className="hint">
                  Tick at least {need === 1 ? 'one group' : 'two groups'}.
                </span>
              )}
            </div>
          </Step>
        );
      case 'matched': {
        const example = rowExample(table, props.chosen);
        return (
          <Step
            question={
              nested
                ? `Was “${replicate}” one sample split between the groups?`
                : 'Do the values in one row belong together?'
            }
            help={`${
              nested
                ? `Only if “${replicate}” in every group came from the same culture, animal or batch of cells.`
                : example !== null
                  ? `${example} Do these come from the same mouse or patient, or from one sample split between the groups?`
                  : 'Is each row of your table one mouse, patient, or one sample split between the groups?'
            } ${SAME_DAY}`}
          >
            <Cards
              answers={matchedAnswers(nested, replicate)}
              value={answers.matched}
              unsure={
                nested
                  ? 'They are taken as independent.'
                  : 'If the design didn’t make the rows belong together, they don’t. They are taken as separate samples.'
              }
              onPick={(v) => {
                answer({ matched: v });
              }}
            />
          </Step>
        );
      }
      case 'values':
        return (
          <Step
            question="What kind of numbers are these?"
            help="This decides whether a test may assume a bell-shaped spread of values."
          >
            <Cards
              answers={VALUE_ANSWERS}
              value={answers.values}
              unsure="The guide picks the test that assumes less."
              onPick={(v) => {
                answer({ values: v });
              }}
            />
          </Step>
        );
      case 'control': {
        const isControl = answers.control !== null && answers.control !== 'all';
        return (
          <Step
            question="Is one of the groups a control that the others are compared with?"
            help="After asking whether the groups differ at all, the test compares pairs of groups."
          >
            <div className="guide-cards">
              <Card
                picture="control"
                title="Yes, compare each group with the control"
                example="An untreated or wild-type group, a vehicle, a baseline."
                chosen={controlYes || isControl}
                onPick={() => {
                  setControlYes(true);
                }}
              />
              <Card
                picture="all-pairs"
                title="No, compare every group with every other"
                example="Three drugs, three cell lines, three time points of equal interest."
                chosen={!controlYes && answers.control === 'all'}
                onPick={() => {
                  setControlYes(false);
                  answer({ control: 'all' });
                }}
              />
            </div>
            {(controlYes || isControl) && (
              <div className="guide-control" role="group" aria-label="Which one is the control?">
                <span>Which one is the control?</span>
                {picked.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={answers.control === d.id ? 'guide-chip chosen' : 'guide-chip'}
                    aria-pressed={answers.control === d.id}
                    onClick={() => {
                      answer({ control: d.id });
                    }}
                  >
                    {d.title || '(untitled)'}
                  </button>
                ))}
              </div>
            )}
          </Step>
        );
      }
    }
  };

  const offered = next.kind === 'test' ? props.normality.offered(next.spec) : null;

  return (
    <div className="guide">
      <ol className="guide-steps" ref={stepRef}>
        {folded.map((q) => {
          const s = summaryOf(q);
          return (
            <li key={q} className="guide-step done">
              <span className="guide-label">{s.label}</span>
              <span className="guide-answer">{s.value}</span>
              <button
                type="button"
                className="link"
                aria-label={`Change: ${s.label}`}
                onClick={() => {
                  setReopened(q);
                  if (q === 'control') setControlYes(answers.control !== 'all');
                }}
              >
                Change
              </button>
            </li>
          );
        })}
        {current !== null && renderCurrent(current)}
      </ol>
      {current === null && next.kind !== 'ask' && (
        <section className="guide-result" aria-label="Suggested test">
          {next.kind === 'test' ? (
            <>
              <p className="guide-eyebrow">Suggested test</p>
              <h3>{next.name}</h3>
              <p>{next.why}</p>
              {next.caveat !== undefined && <p className="guide-caveat">{next.caveat}</p>}
              {offered && (
                <label className="option">
                  <input
                    type="checkbox"
                    checked={props.normality.on}
                    onChange={(e) => {
                      props.setNormality(e.currentTarget.checked);
                    }}
                  />
                  {offered === 'paired-normality'
                    ? 'Also check the paired differences for a bell shape (a separate analysis)'
                    : 'Also check each group for a bell shape (a separate analysis)'}
                </label>
              )}
              <div className="guide-run">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    props.onRun(next.spec);
                  }}
                >
                  {next.spec.kind === 'descriptive' ? 'Calculate them' : 'Run this test'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.onOptions(next.spec);
                  }}
                >
                  See its options first
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="guide-eyebrow">No test for this yet</p>
              <p>{next.why}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
