import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
}

interface Props {
  /** "More for Viability": names the button for a screen reader. */
  readonly label: string;
  readonly items: readonly MenuItem[];
}

/** A ⋯ button with a small menu of actions (item 08); arrows move, Escape closes. */
export function MoreMenu({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  return (
    <span className="more">
      <button
        type="button"
        className="more-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          ref={ref}
          className="menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const all = [
                ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
              ];
              const i = all.indexOf(document.activeElement as HTMLElement);
              all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
