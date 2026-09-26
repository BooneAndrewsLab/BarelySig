# 09. Project manager: the list, close, delete

Written 2026-09-26 before building #59 (UI revamp milestone). Note 03
built the pieces (autosave to IndexedDB, open, download) and #47 added
Close project; this note makes them a project manager a bench scientist
understands without reading the guide.

## What was asked

"Better project manager. Close project, remove project, intuitive
project list." And: "On remove, if the project was not downloaded, warn
about it."

## What was there

- The start screen (the empty project) had the table-type tiles and, under
  them, "Projects in this browser": the 20 newest, name and a date.
- The Projects menu: New project, Close project, the same list.
- No way to delete a project from the browser, or to rename or download
  one without opening it.

## Decisions

1. **The start screen is where projects are managed.** Still the empty
   project (no "no project" state in the store): tiles to start a new
   project first — two tiles and "Try an example" are short — then **Your
   projects**, every project kept in this browser, newest change first.
   Nothing else becomes a separate page: Close project is how you get to
   the list.
2. **A row says what the project is.** Name; what is in it ("3 experiments
   · 2 graphs", "No experiments yet"); when it last changed, relative
   ("5 minutes ago", "yesterday", then a date; the exact time as a
   tooltip); and **Not downloaded** when there is no file of its latest
   state (below). Click the row to open it. A search field filters by
   name once there are more than six.
3. **Each row has a ⋯ menu**, as the experiments in the sidebar (note
   08): Open, Rename (in place), Duplicate, Download, Delete…. Rename,
   Duplicate and Download work on the stored `.bsig` text without opening
   the project: Download writes the row's text as it is.
4. **Delete asks first**, in a dialog, because it can't be undone: undo
   history belongs to the open project, and the row is gone from
   IndexedDB. The dialog names the project and what is in it. When the
   project was never downloaded, or changed since, it says so first and
   plainly: *"You haven't downloaded this project since it last changed.
   Deleting it loses it for good."*, with **Download a copy** beside
   **Delete** and **Cancel**. When a file of its latest state exists it
   says that instead, and the file is unaffected.
5. **"Downloaded" is kept per project, in the row** (`downloaded`, a
   boolean; missing on older rows = false, so they warn). It is true
   while the stored project is the one last downloaded or opened from a
   `.bsig`: the autosaver writes `store.downloaded === project`, so any
   edit clears it; a download sets it on the row. Reopening a project
   restores the flag, so the sidebar's "Downloaded" survives a reload.
   A figure opened from an SVG/PNG counts as not downloaded: there is no
   `.bsig` of it. A rename or duplicate from the list clears it.
6. **The open project can be deleted too**, from Projects → Delete
   project…: same dialog; the pending autosave is dropped, not written,
   the start screen shows, then the row is removed. Writes are serialised
   (each waits for the one before), so an autosave still in flight can't
   bring a deleted project back.
7. **Lists stay current by themselves.** `ProjectStorage` tells listeners
   after every write or removal; the start screen and the menu re-read.
8. **The Projects menu** keeps New project and Close project, adds Delete
   project…, and lists the five most recent other projects; the full list
   is one click away (Close project).
9. **Words.** "Kept in this browser", never "stored" or "database";
   "Delete" (the browser's copy), with "download a copy" as the way to
   keep one.

10. **Warn when the browser may clear its storage** (asked while
    building). IndexedDB is "best effort" unless the site is granted
    persistent storage, and a browser may then clear it when the disk is
    nearly full. `navigator.storage.persisted()` says which; when it is
    false the start screen says so above the list (with how many projects
    have no downloaded copy), and **Ask the browser to keep them** calls
    `persist()` from the click. As in PlasmidPop (its item 24): the first
    autosave asks silently only where the Permissions API says the answer
    is already decided, never where Firefox would open a dialog nobody
    asked for; Chromium also says `prompt` and then refuses in silence
    unless the app is installed, bookmarked or used a lot, so the answer
    is reported ("didn't agree for now", and what helps), never assumed.
    While it is at risk the sidebar says **Saved in this browser only**
    for a project with no downloaded copy.
11. **A blank project is never kept.** Results changing (as they do when
    a project is closed) used to save the blank project left behind, so
    "Untitled project" rows piled up; the autosaver now applies the same
    test to result changes as to edits. A blank project that *is* in the
    list (opened from it) can still be closed and deleted.
12. **Not a kept file handle.** Asked during this work: saving straight
    back to the opened `.bsig` through the File System Access API would
    work in Chromium only; Firefox and Safari would still download a new
    copy each time. The download-only rule (CLAUDE.md, PlasmidPop item
    24) stands until the user decides otherwise.

## Prism parity

Prism has files, not a project list: closing asks to save, and deleting
a file is the operating system's job. The warning in decision 4 is the
browser-app equivalent of Prism's "save changes?" prompt.

## Testing

- Storage: counts, the `downloaded` flag through save / mark / rename /
  duplicate, change listeners, raw text for download.
- Session: deleting the open project doesn't come back through autosave;
  a download marks the row; reopening restores "Downloaded".
- Pure: relative times, the row's summary line.
- Components: the start screen lists, filters, renames, duplicates and
  deletes (with and without the warning); Projects → Delete project….
