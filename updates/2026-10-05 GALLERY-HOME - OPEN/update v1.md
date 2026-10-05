# Gallery Home — drop the sidebar, make Home a gallery of all memories

**Branch:** `update/gallery-home`
**Status:** OPEN — building

## Goal
Replace the left sidebar with a **gallery Home**: all memories in one view as **large
flasks**, each with a title + a bit of content underneath, grouped and sorted by
**creation date** (Apple-Photos-style relative buckets). Add a **Working set** strip
(always on top, horizontally scrolling), an **Option-hover peek** into a flask's
content, a **right-click → add to Working set**, and a three-dots **Edit view** popover
(reusing the existing "Show on each note" field controls) plus a setting for Working-set
persistence.

## Locked decisions (owner, 2026-10-05)
1. **Sort: oldest on top** (true Apple Photos). Gallery **always opens scrolled to the top**
   (oldest first; do NOT auto-scroll to today). Buckets top→bottom: oldest months … Last
   month, Last week, Yesterday, **Today at the very bottom**. Each month shows year when not
   current year (e.g. `Feb 26`).
2. **Day rail = passive labels** on the left (no jump-to scrubber), kept in sync with the
   groups it labels.
3. **Click a flask → opens it as a tab AND switches to it** (leaves Home, takes you there).
   **⌘/Ctrl-click → opens as a background tab, stays on Home.**
4. **Working set persists across restarts** by default; a **setting** switches it to
   session-only. Setting lives in the Edit-view (three-dots) popover.

## Deliberately out of scope (noted, not built)
- **Seen/unseen tracking** (UX.md's #1 pain) — needs new persisted per-note state; not in
  this spec. Deferred to a follow-up.
- Importance-driven size/halo, eras, Summon/search, media heroes — all live in the broader
  PENSIEVE-VISION work. This update is the pragmatic, date-organized overview.

## Roadmap (phases)
- **P0 — Setup & design.** Branch, update folder, read design.md/UX.md/concepts, UX-agent
  design synthesis. *(in progress)*
- **P1 — Pure logic.** `lib/gallery/`: Photos-style relative date buckets (oldest-on-top),
  gallery view config, working-set state + persistence + persistence setting. Unit tests for
  the date bucketing (the risky bit).
- **P2 — Gallery view (static).** `features/gallery/`: large `FlaskCard` (flask + title +
  content snippet), grouped grid, passive `DateRail`. Wire Home → Gallery in `App.tsx`.
  Render tests.
- **P3 — Interactions.** Option-hover peek popover; right-click → Working set; Working-set
  strip (horizontal scroll, pinned on top, remove); click / ⌘-click tab behavior.
- **P4 — Edit view + cleanup.** Three-dots "Edit view" popover (reuse field toggles) +
  working-set persistence setting. Remove the sidebar entirely; clean `App.tsx`, shortcuts.
- **P5 — Polish, tests, build, merge.** Full test pass, typecheck, native build, merge to
  `main`, close folder.

## Live status
- P0 ✅ branch + folder; design docs + concept spec read; 2 UX agents synthesized
  (layout + interactions). Specs captured below as the build brief.
- P1 ✅ pure logic (buckets/view/persist) + 18 unit tests. Committed.
- P2 ✅ Gallery view built and wired as Home. `features/gallery/{FlaskCard,Gallery}`,
  `hooks/useGallery`. App.tsx refactored: Home = gallery (sidebar no longer rendered);
  click → tab+switch, ⌘-click → background tab; new note opens into the editor; header
  insets left for macOS traffic lights; note-only actions/shortcuts gated off Home.
  Full suite green (122 tests incl. 4 new Gallery render tests); web build clean.
  NOTE: Sidebar.tsx / SidebarCustomise.tsx / NoteRow.tsx + sidebar lib (except
  format.ts, still used) are now DEAD CODE — delete in P4 cleanup.
- P3 ✅ interactions: PeekPopover (Alt-hover / Space), CardContextMenu (right-click /
  Shift+F10), WorkingSetStrip (always-on-top, hidden when empty). Committed.
- P4 ✅ GalleryCustomise "Edit view" popover (field toggles + snippet lines + working-set
  persistence setting) wired into the Home header. Dead sidebar removed:
  Sidebar/SidebarCustomise/NoteRow + lib/sidebar/{view,arrange,persist}; format.ts moved
  to lib/format.ts. 113 tests green; build clean.
- P5 ▢ polish, native build, merge to main.
