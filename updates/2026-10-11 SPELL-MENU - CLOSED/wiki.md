# SPELL-MENU — durable decisions & lessons

## Terminology
- **Memory** = a captured thought (UI word; data type stays `Note`). Flask/vial = its glyph.
- **Spell** = any action performed on memories (replaces "action"/"wheel seat").
- The word "Search" stays banned → **Accio**. "New/Write" = create a memory.

## Replaces the Wand
The Wand thumb-wheel (`useWheelGesture`, `Wheel`, `WheelButton`, `AdjustGrip`, `DesignOverlay`,
the wheel physics in `lib/wand/wheelPhysics.ts` + wheel tunables in `constants.ts`) is archived
to `_archive/` in this folder. KEPT (still used): reel + loupe (`useReelFisheye`, `Reel`,
`Glass`), note editor (`NoteView`/`NoteBody`/`NoteToolbar`), sync machine (`syncMachine.ts`,
`useSyncState`, `SyncSpell`, `SyncPanel`), Accio (`accioQuery`/`accioRank`, `SummonBar`,
`SearchSheet`, `AccioPill`), flasks, conjure thread.

## Must-not-break (inherited locks from PHONE-UX / UI-FOUNDATION)
- Controls are a **persistent global layer**; the ONE thing that hides them is the real
  keyboard (`.kb-open` from `visualViewport`, NOT focus) + `.searching`.
- Menu actions from inside a note must `exitNote()` first or they open behind it.
- ONE scroller per surface; the reel keeps `isolation:isolate; z-index:0`. Any new overlay
  must respect the phone z-stack (menu/overlay layers sit above the reel+glass).
- rAF physics write transforms to DOM via refs, never setState; keyboard `.focus()` stays
  synchronous-in-gesture.
- Port/keep formulas verbatim + unit-test against tunables.

## Fake spell roster (explorable prototype) — finalized in P1
TBD. Working draft: General = Write, Accio, Sync, Stir, Pin, Label, Link, Highlight, Export,
Thread. Detailed example on a spell with variants. Conditional sets per page (reel / note).

## Synthesized design spec (from 3 parallel UX agents, 2026-10-11)

### Dock (bottom control bar)
- Invisible 4-cell grid (NO background plate first; fallback plate only if ungrounded).
  `position:absolute; left/right:0; margin-inline:16px; bottom:calc(14px + safe-area);
  height:var(--dock-h); grid repeat(4,1fr); gap:var(--dock-gap); z-index:134; pointer-events:none`
  (children opt back in). Collapsed spell = 52px disc centered in cell; menu button = 56px;
  expanded Accio = span 3 cells, 56px tall, rounded-full.
- **Keyboard reconciliation:** dock genuinely HIDES on `.kb-open`; the expanded Accio *promotes*
  from resident (in-row) → summoned (lifts out, rides `--kb` as today's `.summon`). Morph 420ms
  `--spring`. Held query shows inline (query + count + clear) — this REPLACES the old top pill.
- **Recents ("see what was written before"):** rest = 1 ghost chip (latest query); on focus =
  up to 4 recent-query chips in the secondary row. Store last 6 distinct queries in localStorage,
  never synced, with a clear-history control. (Privacy: journaling queries are sensitive.)
- **Secondary-settings row:** thin ephemeral row above the dock (recents when empty / scope chips
  when typing). Hidden on calm home.
- **DockLayout data shape:** `{ menuSlot:0|1|2|3, spells: DockSpell[], settings? }`.
  Invariants: spells is EITHER `[{kind:"expanded"}]` OR 1–3 collapsed (never mixed); an expanded
  spell needs 3 contiguous cells ⇒ `menuSlot ∈ {0,3}` (the dropped hand-flip, re-expressed as data,
  no UI toggle). Home = `{ menuSlot:3, spells:[{kind:"expanded", id:"accio"}] }`.
- **Sync status on home:** no free cell ⇒ attention-only dot on the gold menu button (warn=syncing,
  danger+pulse=failed/offline; benign pending = no dot).

### Spell Menu radial overlay
- Knobs: R=112px, center 50%vw/56%vh (two reach knobs: R + centerY), glyph disc 54px, hit cell 72px,
  slot pitch 40°, full-ring capacity 8, void wedge [150°,210°]. Angle α clockwise from 12 o'clock;
  `x=cx+R·sinα, y=cy−R·cosα`. Most-used = index 0 = rests at top.
- **Static ring (N≤8):** evenly spaced full circle. N<4 ⇒ lower-180° arc (thumb zone). N=1 ⇒ no ring.
- **Scroll ring (N≥9):** fixed 40° pitch, `α_i = mod((i−p)·40,360)`, p∈[0,N−1] continuous. Upright
  sprites, only positions orbit (Ferris-wheel). Fade ramps [120,150] & [210,240]; void [150,210] gone.
  `opacity=clamp(distToVoidEdge/30,0,1); scale=0.6+0.4·opacity`. Finite (rubber-band at ends), snap to
  round(p). 1px bottom vignette = "disappear into nothingness".
- **Forms:** General=GOLD; Detailed=same gold family (sub-ring, conveyed by collapse/bloom + deeper
  scrim, NOT a new hue); Conditional=ACCENT-BLUE (see decision below) + 4-point spark center sigil +
  arrival-pulse. Center slot: General empty (ghost core) / Detailed "← Back" / Conditional "General"
  toggle (and "Suggested" toggle shown in General when the page has suggestions). Max 2 levels deep.
- **Entry rule:** on a page with recommendations the menu OPENS in Conditional; else General.
- **A spell can open a window** (`opensWindow`): panel blooms from tapped glyph above the ring; ring
  layer +8px blur & dim; close returns INTO the menu (ring stays mounted). Scrim-tap closes all.
- Motion: open scrim 180ms `--ease` + ring 260ms `--spring` + glyph stagger 14ms/`--spring-soft`;
  perceived-instant (first glyphs <80ms). Reduced-motion: 80ms fades, no stagger/rotation.

### Iconography
- Menu-button glyph = "Orbit" (6 pips in a ring + hub, 28-grid), gold filled dome, stone-colour pips,
  breathing halo + slow shimmer. Conditional: hub → 4-point spark, hue → accent-blue, arrival-pulse.
- 10 spell glyphs, 24-grid, stroke 1.75 round, token `currentColor`: Write, Accio(violet), Sync(gold+
  state lemniscate), Stir, Pin, Label, Link, Highlight, Export, Thread. Write & Stir cast flash gold.
- Cast flash reuses `wflash` feel (`glyph-cast` 420ms `--spring-soft`); ring bloom `bloom-in` per-pip
  from hub (`--from-x/--from-y` = negative radial offset).

### New phone tokens (add to phone/src/styles/tokens.css)
```
--dock-h:64px; --dock-gap:10px; --spell:52px; --spell-hero:56px; --accio-h:56px; --ctrl-blur:18px;
--gold-glow:43 100% 64%; --gold-mid:43 92% 48%; --gold-deep:38 90% 42%;
--spell-scrim:222 32% 5%;
--conditional:215 85% 74%;        /* = --accent (accent-blue); named for intent */
--conditional-glow:218 100% 72%;  /* = --accent-glow; halos only */
--glyph-stroke:1.75;
```
Z-layers (phone stack, above the shared desktop table): reel 0 · dock 134 · dock-settings 135 ·
note 140 · spell-menu-backdrop 148 · spell-menu 150 · spell-window 152.

### DECISION — Conditional colour = accent-blue (orchestrator call)
Two agents split (overlay→blue, icon→violet). Chose **accent-blue**: "violet = Accio/search" is a
locked color language (don't dilute it); gold↔blue = max hue separation; and the blue "hero" objection
weakens now that the blue Wand hero is removed. Kept the icon agent's non-hue differentiators (spark
sigil + arrival-pulse). **Flagged for owner on-device feel-test** (swapping `--conditional` to `--accio`
is a one-line change if violet feels better).

### Naming collisions to avoid (CRITICAL)
- `--slot` (84px reel card height) and `.slot` are RESERVED by the reel. Use `--dock-*` / `.dock` /
  `.dock-cell` for the dock. New CSS in dedicated files (dock.css, spellmenu.css), imported by index.css.

## Lessons
- **Signed-arc > mod-360 wheel for a scroll ring.** A naive Ferris wheel (`angle = mod((i−p)·pitch,
  360)`) overlaps the far end onto the top whenever `N·pitch` nears a multiple of 360 (10 spells ×
  40° → index 9 lands on index 0) and leaves one side empty at rest. The fix: a SIGNED arc
  `angle = (i−p)·pitch` (no wrap), glyphs fanning up both sides from the focus, hidden once
  `|angle| ≥ voidEdge`. Gives a true start/end and symmetric fade-into-nothingness. Caught by a unit
  test before it ever hit the device — the win of keeping geometry pure.
- **One rewire, not two.** The roadmap split Dock (P2) and overlay (P3), but both gut the same
  PhoneApp wiring (remove the wheel hook + refs + seat dispatch). Doing them in one pass avoided
  rewiring PhoneApp twice and a half-broken intermediate commit. Adjust the roadmap to reality.
- **Keyboard rule reconciliation (inherited lock held).** The dock genuinely hides on `.kb-open`;
  the resident Accio bar is a separate element from the `.summon` bar — summon only shows on
  `.searching`, dock only shows when not. No double bar, and the "only the keyboard hides controls"
  lock is intact.
- **Name collisions avoided:** dock uses `--dock-*`/`.dock*`; `--slot`/`.slot` stayed the reel's.
- **Wheel CSS left inert, not deleted.** `.wact/.wheel/.corner-glow/.accio-pill/.sync-panel/.side-left`
  rules remain in wand.css but render nothing now (elements gone). Harmless; a later cleanup pass can
  prune them once the Spell Menu is locked.
- **Reused, didn't rebuild:** Accio query/rank + SummonBar + SearchSheet, the sync machine +
  SyncSpell cast, panelCopy (the Sync window reuses it), the reel/loupe, the note editor — all kept.

## UX-team review (2026-10-11, 4 parallel lenses) — synthesis
Ran product-clarity (Jobs), motion/feel (Disney), visual-craft, and ergonomics reviewers.
**Implemented (safe quality fixes):** 2 P0 bugs — VoiceOver/keyboard couldn't cast (moved cast
to the glyph `<button>` onClick; pointer only spins) and a near-miss tap closed the overlay
(backdrop now needs r>R+48). Motion: `.spinning` holds transition:none through the whole spin
(was rubbery); detent haptic; VEL_STOP 0.0035; framerate-independent settle (TAU 90ms);
finite-arc rubber-band + spring-back; fling cancelled on pause; open haptic. Visual: dark-well
disc (`--spell-node`), ring from `--sh-glow` (gold≈blue brightness), tighter glow, allocated
halo (1.12), `--accio-glow` for violet, on-scale type, Highlight rune de-mixed, Accio centered,
affordance dots. Ergonomics: ring lowered (centerY 0.60 / R 118 / `--ring-cy`), DRAG_THRESHOLD 11,
HOLD_MS 500, 44pt center.
**Surfaced to owner (NOT changed — contradict explicit design):** the product reviewer argued
(a) capture should be 1 tap not behind the menu, (b) cut the scroll/roster to capture-only
(Type/Speak/Photo/Video), (c) collapse the 3 forms. (a) is the strong one → asked the owner.
(b)/(c) conflict with the owner's stated design (spells-for-all-actions, 3 forms, scroll, fake
roster for exploration) — kept as-is unless the owner says otherwise.
**Deferred (not yet done):** first-run spin nudge; "tap center = cast focused spell" one-handed
model; scrim fade-out on close; dynamic-type labels; the dead note-context menu path.

## Device feel-test checklist (owner, P6)
- Ring reach: is R=112 / centerY=56% comfortable one-handed? (two tunable knobs in `ringLayout.ts`)
- Scroll feel on the 10-spell General ring: fade, snap, the "fall into nothingness" at the bottom.
- Conditional colour: accent-blue vs violet — swap `--conditional` to `--accio` if violet feels better.
- Bloom/open speed: does it feel "almost instantaneous"? (stagger 14ms, open ~260ms)
- Write tap=write / hold=speak on the ring glyph; Sync window → "Back up now" cast.
- The resident Accio bar: placeholder, latest-query ghost chip, held-query + clear, recents row.
