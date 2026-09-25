/**
 * Whether a key press lands where it types (so `?` goes there instead of
 * opening the guide): a text field, or the data grid, where typing starts
 * editing a cell.
 */
export function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, [role="textbox"], [role="grid"]') !== null)
    return true;
  return false;
}
