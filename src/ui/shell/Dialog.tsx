import { type ReactNode, useEffect, useRef } from 'react';

interface Props {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A modal dialog: Escape and the backdrop close it; focus starts inside and returns after. */
export function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement;
    const first = ref.current?.querySelector<HTMLElement>('input, select, button, [tabindex="0"]');
    first?.focus();
    return () => {
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);
  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
