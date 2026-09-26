import { useStorageSafety } from '../state/storageSafety';

/**
 * Where the open project is kept, at the sidebar's foot. "Only in this
 * browser" when the browser may clear its storage and there is no file of
 * the project's latest state (item 09).
 */
export function SaveState({ downloaded }: { readonly downloaded: boolean }) {
  const atRisk = useStorageSafety() === 'at-risk';
  if (downloaded) {
    return (
      <span className="save-state" title="Kept in this browser, and your file has all of it.">
        Downloaded
      </span>
    );
  }
  return atRisk ? (
    <span
      className="save-state at-risk"
      title="Kept only in this browser, which may clear it if the disk runs low on space. Download it to keep a file."
    >
      Saved in this browser only
    </span>
  ) : (
    <span
      className="save-state"
      title="Your work is kept in this browser as you go. Download it to keep a file of your own or to share it."
    >
      Saved in this browser
    </span>
  );
}
