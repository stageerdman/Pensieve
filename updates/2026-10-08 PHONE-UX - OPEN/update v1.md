# PHONE-UX — update v1

## Goal
Design the **phone experience** for Pensieve — phone only, no PC. The phone is for
**fast capture of new thoughts** (primary) and **fast search of existing memories**
(secondary). Not a browsing/organizing surface like the desktop; a creation + recall
surface. This update is the **UX/UI design round**: produce interactive HTML concepts
the owner opens on their iPhone, pick a direction, then build.

Relates to [[../2026-10-07 PWA-CAPTURE - OPEN/update v1]] (the PWA runtime/auth/sync
plumbing). This update owns the *experience*; that one owns the *delivery*.

## The brief (owner's words, distilled)
- **Capture is the hero.** A magic-wand + thought-thread action that instantly creates
  a new document. Writing must feel **flawless and like Apple Notes** — smooth, direct,
  NOT Notion JSON blocks. Different from the computer on purpose.
- **Accio is crucial for search.** A button **under the thumb**; press → a **summon bar**
  opens and lets me type immediately. Must be *super smooth*.
- **The flask reel.** Browse bottles in rows; the focused one (center, or always on top)
  is **magnified** — showing title + part of the content — while the others are smaller,
  title + a little info (date). Scroll super smoothly; the focused one is always
  magnified. Same *vibe* as the computer app.
- **Sync looks like a spell.** A sync action rendered as magic.
- **Speech to text, speech to search.** First-class on phone.
- **Lightweight = super fast.** Above all.

## Design north star (for the experts)
Steve-Jobs minimalism (no useless text, no explanations, the fewest controls, super
clean) **fused with** Disney magic (delight, the small joy of rediscovering a thought).
Must feel like the same world as the desktop app: magical **flasks**, the **Basin**'s
deep blue-black stone, the magical-blue accent and gold. Magical AND highly practical.

## Phased roadmap
- **Phase 1 — Divergent concepts (THIS round).** 3 complete, distinct phone concepts as
  self-contained interactive HTML (iPhone viewport), each a different *spatial/magical
  spine* but all covering capture + Accio + flask-reel + sync-spell + speech. Owner
  reviews on device, names what to keep. (Fresh surface → 3 is justified; later rounds
  narrow to ≤2 per the working rule in UX.md.)
- **Phase 2 — Converge.** Synthesize the winner(s) into one locked phone concept + a
  short spec (screens, gestures, components, tokens).
- **Phase 3+ — Build** on the PWA-CAPTURE runtime.

## Live status
- 2026-10-08: Update opened. Phase 1 concepts commissioned from 3 parallel UX experts.
