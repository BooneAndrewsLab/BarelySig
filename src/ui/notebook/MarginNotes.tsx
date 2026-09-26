import type { Note } from './notes';

/** The notes beside a section (#56), as mockup C's margin cards. */
export function MarginNotes({ notes }: { readonly notes: readonly Note[] }) {
  return (
    <>
      {notes.map((n) => (
        <div key={n.kicker + (n.title ?? '')} className="note">
          <span className="note-kicker">{n.kicker}</span>
          {n.title && <span className="note-title">{n.title}</span>}
          {n.text.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      ))}
    </>
  );
}
