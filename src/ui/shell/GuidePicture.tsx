/**
 * The small pictures on the guide's answers (item 15): each shows what the
 * answer means, drawn in the ink and the accent colour.
 */
export type Picture =
  | 'compare'
  | 'describe'
  | 'separate'
  | 'paired'
  | 'unsure'
  | 'bell'
  | 'skewed'
  | 'score'
  | 'control'
  | 'all-pairs';

const INK = 'var(--ink-3)';
const ACCENT = 'var(--bs-accent)';

function Dots(props: {
  readonly x: number;
  readonly ys: readonly number[];
  readonly fill: string;
}) {
  return (
    <>
      {props.ys.map((y, i) => (
        <circle
          key={i}
          cx={props.x + (i % 2 === 0 ? -3 : 3)}
          cy={y}
          r={2.6}
          fill={props.fill}
          fillOpacity={0.8}
          stroke="none"
        />
      ))}
    </>
  );
}

/** A significance bracket between two x positions at height y. */
const bracket = (x1: number, x2: number, y: number) => `M${x1} ${y + 3}V${y}H${x2}V${y + 3}`;

function Body({ name }: { readonly name: Picture }) {
  switch (name) {
    case 'compare':
      return (
        <>
          <Dots x={20} ys={[24, 29, 33, 37]} fill={INK} />
          <Dots x={44} ys={[13, 17, 21, 26]} fill={ACCENT} />
          <path d={bracket(20, 44, 4)} />
        </>
      );
    case 'describe':
      return (
        <>
          <Dots x={20} ys={[12, 18, 23, 28, 34]} fill={ACCENT} />
          <path d="M36 23H52M44 13V33M40 13H48M40 33H48" />
        </>
      );
    case 'separate':
      return (
        <>
          <Dots x={18} ys={[14, 21, 28, 35]} fill={INK} />
          <Dots x={46} ys={[10, 17, 24, 31]} fill={ACCENT} />
        </>
      );
    case 'paired':
      return (
        <>
          <path d="M18 22L46 10M18 30L46 18M18 36L46 26M18 40L46 32" strokeOpacity={0.5} />
          {[22, 30, 36, 40].map((y) => (
            <circle key={`a${String(y)}`} cx={18} cy={y} r={2.6} fill={INK} stroke="none" />
          ))}
          {[10, 18, 26, 32].map((y) => (
            <circle key={`b${String(y)}`} cx={46} cy={y} r={2.6} fill={ACCENT} stroke="none" />
          ))}
        </>
      );
    case 'unsure':
      return (
        <>
          <circle cx={32} cy={22} r={15} />
          <path d="M26.5 17.5a5.5 5.5 0 1 1 7.5 5.1c-1.3.6-2 1.6-2 3v1.4" />
          <circle cx={32} cy={31.5} r={1.3} fill="currentColor" stroke="none" />
        </>
      );
    case 'bell':
      return (
        <path
          d="M4 38C18 38 22 8 32 8S46 38 60 38"
          fill={ACCENT}
          fillOpacity={0.15}
          stroke={ACCENT}
        />
      );
    case 'skewed':
      return (
        <path
          d="M4 38C8 38 11 8 17 8S30 33 60 37"
          fill={ACCENT}
          fillOpacity={0.15}
          stroke={ACCENT}
        />
      );
    case 'score':
      return (
        <>
          {[26, 18, 10, 5].map((h, i) => (
            <rect
              key={i}
              x={8 + i * 13}
              y={38 - h}
              width={9}
              height={h}
              fill={ACCENT}
              fillOpacity={0.15}
              stroke={ACCENT}
            />
          ))}
        </>
      );
    case 'control':
      return (
        <>
          <Dots x={12} ys={[26, 31, 36]} fill={INK} />
          <Dots x={32} ys={[20, 25, 30]} fill={ACCENT} />
          <Dots x={52} ys={[16, 21, 26]} fill={ACCENT} />
          <path d={`${bracket(12, 32, 11)}${bracket(12, 52, 4)}`} />
        </>
      );
    case 'all-pairs':
      return (
        <>
          <Dots x={12} ys={[26, 31, 36]} fill={ACCENT} />
          <Dots x={32} ys={[22, 27, 32]} fill={ACCENT} />
          <Dots x={52} ys={[18, 23, 28]} fill={ACCENT} />
          <path d={`${bracket(12, 30, 11)}${bracket(34, 52, 11)}${bracket(12, 52, 4)}`} />
        </>
      );
  }
}

export function GuidePicture({ name }: { readonly name: Picture }) {
  return (
    <svg
      className="guide-picture"
      viewBox="0 0 64 44"
      width={64}
      height={44}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Body name={name} />
    </svg>
  );
}
