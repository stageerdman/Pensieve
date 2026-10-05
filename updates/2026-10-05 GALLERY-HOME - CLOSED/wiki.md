# Gallery Home — durable decisions & lessons

## What this update did
Dropped the left sidebar; Home (the Pensieve logo) now opens a **gallery of all
memories** as large flasks, grouped by creation date. This is the pragmatic, shippable
form of the long-circling "Basin home that shows all flasks at once" idea in `UX.md` —
organized by time rather than importance.

## Decisions that stick
- **Home = gallery, not a note.** The editor only mounts when a note tab is active. The
  old `homeNoteId` concept is gone. Gallery remounts on each Home entry, so `now`,
  buckets, and scroll position are fresh each visit (scroll always starts at the top).
- **Navigation model:** click a flask → open as a tab **and switch to it**; ⌘/Ctrl-click
  → **background tab, stay on Home**. A background open does NOT load the body — the tab
  renders from NoteMeta; the body loads when the tab is first selected.
- **Date buckets (Apple-Photos style), OLDEST ON TOP:** Today, Yesterday, Last week,
  Last month, then one bucket per calendar month. Month label = full name in the current
  year ("February"), `MMM 'YY` in prior years ("Feb '26"). Buckets sort by a
  representative timestamp so calendar months always precede the relative buckets. Within
  a bucket, notes ascend by createdAt (id tie-break). All of this is pure + unit-tested
  in `lib/gallery/buckets.ts`.
- **Working set** = the "working surface" shelf: explicit, filled by right-click (not by
  the `pinned` flag — pins are a separate concept and do NOT affect the gallery). Always
  on top, horizontally scrolling, **hidden entirely when empty**. Persists across
  sessions by default; a setting in the Edit-view popover switches it to session-only
  (which clears its localStorage key). Self-heals: dead ids are pruned when notes change.
- **Peek** shows a *fuller* (~400-char) body preview than the card's ~140-char snippet,
  so it reveals more, not the same. Lazy-loaded and session-cached. Shown on Alt-hover or
  Space; non-interactive (role=tooltip) so focus never enters it.
- **No blocking dialogs.** Context menu / peek / edit-view are all custom popovers that
  close on outside-mousedown + Esc, matching the existing OverflowMenu/FlaskPicker model.
- **macOS traffic lights:** with the sidebar gone, the header insets its left edge
  (`pl-20`) in the Tauri app to clear the floating traffic lights.

## Lessons / gotchas
- jsdom has no `Element.scrollTo` — use `el.scrollTop = 0` for the scroll reset.
- On a `<button>`, Space activates (= click). To make Space *peek* instead, handle it in
  `onKeyDown` with `preventDefault()` and dispatch open explicitly from Enter.
- `line-clamp-N` needs `display:-webkit-box`; never add `block` to a clamped element or
  the clamp is ignored (carried over from the old NoteRow).
- The time formatter moved from `lib/sidebar/format.ts` → `lib/format.ts` when the rest
  of `lib/sidebar/` was deleted (it's the one piece the gallery still uses).

## Deliberately deferred (not built here)
- **Seen/unseen tracking** — `UX.md`'s #1 pain; needs new persisted per-note state.
- Importance-driven size/halo, eras, Summon/search, media heroes (broader vision work).
- Arrow-key grid navigation across cards (cards are normal Tab stops in reading order;
  open/peek/working-set keys all work — just no 2-D arrow roving yet).
