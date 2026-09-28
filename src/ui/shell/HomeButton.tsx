import { getSession } from '../state/session';

/**
 * Back to the front page (item 09), same as the logo and the project name:
 * closes the open project (kept in this browser; nothing is lost) so it
 * shows in the front page's list, where it can be reopened, renamed,
 * duplicated, downloaded or deleted.
 */
export function HomeButton() {
  return (
    <button
      type="button"
      title="Close this project and go to the front page (it's kept in this browser)"
      onClick={() => {
        void getSession().closeProject();
      }}
    >
      Projects
    </button>
  );
}
