# Update v1 — FAST-LOAD (open instantly, load history as you scroll)

## Goal
After the Notion import (2,090 notes, 3.5 GB) the app takes ages to open and renders the whole
history at once. Owner: "Make it super fast to load the notes and load the app… what should be
loaded is at best last like one week, and then it could autoload as I scroll… and also unload as I
scroll back, let's say after a few minutes. And make sure the same thing is on the phone."

## Root causes found (2026-11-15)
- Desktop `TauriStore.list()` = 2 sequential IPC `read_text` per note (meta + full .md, parsed for
  excerpt/chars) → ~4,200 serial invokes before the first paint. `bodies()` (search index) does
  another ~2,090 + transcript lookups. `toggleFlag`/`remove` re-run the full `list()`. The
  transcript queue's `listMedia()` walks every media folder serially.
- Gallery renders every note at rest.
- Phone `loadVault()` JSON-parses the whole ~7 MB vault on every call; the sync LocalVault calls it
  per note (load/save/remove) → O(n²) on a 2,000-note pull. Phone feed renders all history.

## Behaviour (decided from the owner's words)
- Open = the last **7 days** of memories (at least one screenful — keep going back until the
  screen is filled or ~24 cards), shown immediately.
- Scrolling near the end silently loads the next older week. No button, no spinner unless slow.
- Sections far off-screen (≥ ~2 screens away) for **3+ minutes** unmount into a same-height
  placeholder (scroll never jumps) and remount as they come back near.
- Search still covers every note; results use the same windowing.
- Same on the phone.

## Phases
- [ ] P1 Desktop data path — bulk Rust listing (one IPC, parallel reads), cached excerpt/chars
      index, no full relist on flag/remove, search index + media scan deferred off the first paint.
- [ ] P2 Desktop gallery windowing (load week-by-week, unload after 3 min off-screen).
- [ ] P3 Phone — vault parse once/in-memory objects, O(1) per-note sync ops, feed windowing.
- [ ] P4 Measure on the real 2,090-note vault (before/after), tests, build + deploy, owner check.

## Status
2026-11-15: opened; P1+P2 (desktop agent) and P3 (phone agent) running in parallel.
