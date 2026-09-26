# design.md — Pensieve visual standard

Read this before building any screen. The vibe: a calm, fast, distraction-free
place for thinking — closer to a paper notebook than an app. Capture must feel
instant; the UI should disappear around the words and media.

## The one rule
Every element must earn its place. If a control, panel, or step isn't truly
needed, it's gone. Fewest screens, fewest clicks, no chrome for its own sake.

## Tokens (semantic, not raw values)
Define once, use everywhere; changing a token changes the whole app.
- **Color:** `surface`, `surface-raised`, `text`, `text-muted`, `border`,
  `accent` (one), plus state colors `success` / `warn` / `danger`. Full light
  **and** dark support with real contrast (AA+). Neutral, low-saturation base so
  content (photos, handwriting, video) is the color on screen.
- **Type:** one primary font for writing (a clean, readable sans or a
  Notion-like serif option), optionally one mono for code/timestamps. A small
  deliberate size scale — no ad-hoc sizes.
- **Spacing / radius:** one spacing scale, one or two radii. Generous whitespace;
  content-first.

## Base components (parents everything composes from)
- `Editor` — the TipTap writing surface: Notion-like formatting, keyboard-first,
  serializes to `.md`. This is the heart of the app; it must feel effortless.
- `CaptureBar` — one entry point for any input (text / photo / audio / video /
  journal photo); drag-drop and paste always work.
- `MediaBlock` — embedded audio/video with transcript + time-point notes.
- `TranscriptView` — transcript synced to media time; segments are selectable,
  editable (manual or AI command), cuttable.
- `TimelineItem` — a dated addition in the commit-style log of what was added when.
- `LabelChip`, `Button`, `IconButton`, `Panel`, `Toast` — the small shared set.
Build from shadcn/ui primitives + Tailwind; don't hand-roll one-off styles.

## Interaction principles
- Capture is one gesture: open → type/drop/record → saved locally, no modal maze.
- Fast feedback for background work (transcribing, importing journal photos,
  backing up) via quiet, non-blocking status — never a blocking spinner.
- Keyboard-first throughout; focus states visible; everything reachable without a mouse.
- Honest, specific error states over decoration.

## What NOT to do
- No dashboards, no settings sprawl, no feature buttons "just in case".
- No more than one accent color; no gradients/shadows as decoration.
- No blocking dialogs for anything that can happen in the background.
- Don't invent house styles that diverge from the token set or shadcn primitives.
