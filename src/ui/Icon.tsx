/** An icon from the sprite (`public/icons.svg`, design/icons/README.md). Decorative unless labelled. */
export type IconName =
  | 'column'
  | 'grouped'
  | 'xy'
  | 'contingency'
  | 'survival'
  | 't-test'
  | 'anova'
  | 'curve-fit'
  | 'descriptive-stats'
  | 'dot-plot'
  | 'bar-error'
  | 'box-plot'
  | 'violin'
  | 'new-table'
  | 'analyze'
  | 'new-graph'
  | 'format'
  | 'add-significance'
  | 'export';

interface Props {
  readonly name: IconName;
  readonly size?: number;
  readonly label?: string;
}

export function Icon({ name, size = 20, label }: Props) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <use href={`${import.meta.env.BASE_URL}icons.svg#bs-${name}`} />
    </svg>
  );
}
