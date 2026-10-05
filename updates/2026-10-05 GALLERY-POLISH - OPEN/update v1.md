# Gallery Home — polish round (drag, chrome, ordering, magical peek)

**Branch:** `update/gallery-polish`
**Status:** OPEN — building

## Owner feedback (2026-10-05, after shipping GALLERY-HOME)
1. **Window dragging broken** — can only drag at the very top; needs to drag anywhere in
   the header where there are no tabs.
2. **macOS traffic lights + tabs** — center them, and push the traffic lights a bit lower.
3. **Newest on top** (reversal of the earlier call): "on top I want notes from today, and
   below older ones." So Today at top → older downward; newest-first within each bucket.
4. **Peek = formatted, not raw** — Option-hover should show the note *rendered* (how it
   truly looks, so it can show images etc.) — not stripped plain text.
5. **Peek = a magical portal** — large/centered, slightly transparent so flasks stay
   visible behind it (glance at it while working on another task). "Looking into Pensieve"
   feeling — a circular-motion and/or watery effect around it.

## Plan
- **Phase A — quick fixes.**
  - A1 Dragging: make the whole header strip (incl. empty TabBar space) a drag region.
  - A2 Chrome: lower `trafficLightPosition`, give the header a touch more height, keep
    tabs vertically centered. (Pixel values are tunable — owner to eyeball.)
  - A3 Ordering: flip buckets to newest-on-top (Today → … → oldest), newest-first within
    a bucket; gallery still opens at the top (now = most recent). Update tests.
- **Phase B — magical peek portal.**
  - B1 Render the note **formatted** via a read-only BlockNote view (reuses
    `extendedMdToBlocks` + the editor schema; supports images/note-links).
  - B2 Centered, translucent portal with backdrop blur — flasks remain visible behind;
    no heavy scrim. Watery/circular motion around it; `prefers-reduced-motion` stills it.
  - UX-expert agent designs the portal (visual + motion + perf); orchestrator synthesizes.

## Live status
- Phase A ✅ draggable header (TabBar containers are drag regions), traffic lights y 20→24
  + header h-12, newest-on-top ordering. Committed.
- Phase B ✅ magical preview portal. `NotePreview` renders the note FORMATTED via a
  read-only BlockNote (shared `editorSchema`, `.pensieve-editor` skin — images/note-links
  render too). `PreviewPortal` = centered, translucent (flasks visible behind), fully
  pointer-events-none for Alt-hover (Space-pinned peek makes the well scrollable); watery
  ring + breathing glow + drifting caustic in index.css, all with reduced-motion stills.
  Replaces the old tooltip PeekPopover. 114 tests green; build clean.
  - Known tradeoff: content swap keys by note id, so BlockNote remounts per swap. Fine at
    human hover pace; add a small debounce / replaceBlocks-in-place if flinging feels janky.
- Next: native build + owner eyeball of the chrome pixels, then merge.
