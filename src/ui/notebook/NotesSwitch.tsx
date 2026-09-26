import { setNotesShown, useNotesShown } from './notesShown';

/** Shows or hides the margin notes (#56), remembered in this browser. */
export function NotesSwitch() {
  const shown = useNotesShown();
  return (
    <button
      type="button"
      title={
        shown
          ? 'Hide the notes beside each section'
          : 'Show plain-language notes beside each section'
      }
      onClick={() => {
        setNotesShown(!shown);
      }}
    >
      {shown ? 'Hide notes' : 'Show notes'}
    </button>
  );
}
