interface Props {
  readonly value: string;
  readonly label: string;
  readonly className?: string;
  /** Called with the trimmed new name, only when it changed and isn't empty. */
  readonly onRename: (value: string) => void;
  readonly onDone: () => void;
}

/** Renames in place: Enter or leaving the field keeps the name, Escape drops it. */
export function RenameInput({ value, label, className, onRename, onDone }: Props) {
  const commit = (v: string) => {
    onDone();
    const t = v.trim();
    if (t && t !== value) onRename(t);
  };
  return (
    <input
      className={className}
      aria-label={label}
      defaultValue={value}
      autoFocus
      onFocus={(e) => {
        e.currentTarget.select();
      }}
      onBlur={(e) => {
        commit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
        if (e.key === 'Escape') onDone();
      }}
    />
  );
}
