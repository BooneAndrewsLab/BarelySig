import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: boolean;
}

interface Props {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
}

/** The grid's context menu: arrow keys move, Escape or a click outside closes. */
export function GridMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Opened near the right or bottom edge, the menu moves back onto the screen.
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 4;
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - r.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - r.height - margin)),
    });
  }, [x, y]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="menu grid-menu"
      role="menu"
      style={{ position: 'fixed', left: pos.left, top: pos.top }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const all = [
            ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ??
              []),
          ];
          const i = all.indexOf(document.activeElement as HTMLElement);
          all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
        }
      }}
    >
      {items.map((m) => (
        <button
          key={m.label}
          type="button"
          role="menuitem"
          disabled={m.disabled}
          onClick={() => {
            onClose();
            m.run();
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
