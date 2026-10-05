# Update v1 — TABS

## Goal
Browser-style tabs for peeking at notes without losing your place.
- **⌘/Ctrl-click a note** in the sidebar → opens it in a **new tab** and shows it.
- A **tab strip** across the top. The first item is the **Pensieve logo = Home** — press it to
  return to the note you were working on ("my work as before").
- Tabs are **infinite**, **scroll horizontally**, and each has an **X** to close it.

## Model (chosen for low risk + reuse)
- The editor is shared and always shows `current` (the useNotes brain). A "tab" is an open note
  in the strip; selecting a tab (or Home) just calls `open(id)` — fully viewable/editable, no
  duplicate editor state.
- **Home** = your main work: the note reached by a *normal* sidebar click / ⌘N / initial load.
  While on Home, `homeNoteId` tracks `current`, so the logo always returns you there.
- ⌘-click opens a tab and switches to it *without* moving Home. Closing the active tab falls to a
  neighbour, then Home. ⌘W closes the active tab. Deleted notes are purged from the strip.
- Tabs live in session state (not persisted across restarts) — can add persistence later.

## Files
- `components/TabBar.tsx` (new) — the strip: Home (logo) + scrollable tabs (flask + title + X).
- `components/Logo.tsx` (re-added) — the basin sigil, now the Home button.
- `components/NoteRow.tsx`, `Sidebar.tsx` — thread ⌘/Ctrl through `onOpen(id, newTab)`.
- `App.tsx` — tab state (`tabIds`, `activeTab`, `homeNoteId`) + handlers + the header TabBar.
- `index.css` — `.no-scrollbar` for the horizontal strip.

## Status
- 2026-10-05: Built. 100 tests pass (incl. an App integration test: ⌘-click opens a tab, X closes
  it), typecheck + web build clean.
