# SPELL-MENU — iPhone controls & UX overhaul

**Status:** CLOSED · started & shipped 2026-10-11 · owner device-verified ("this is perfect! very smooth, very good")
**Surface:** `phone/` PWA only (desktop untouched)

## Goal
Replace the Wand thumb-wheel with the **Spell Menu** — a new control language for the
phone. Notes become **memories**; every action on a memory is a **spell**. Controls are
a bottom **control bar of 4 slots** plus a radial **Spell Menu** overlay that opens from a
golden menu button. Must feel magical AND instantaneous, and stay lightweight/fast.

## Locked decisions (from owner, 2026-10-11)
1. **Spell Menu replaces the Wand.** Archive the Wand (wheel gesture/components) into this
   update folder; keep the reel/loupe, note editor, sync machine, Accio query/rank.
2. **Dock = bottom control bar, 4 slots** `(+)(+)(+)(+)`. The spell-menu button drops into
   **any** of the 4 slots (default a corner); the other 3 hold spells. **No hand-flip** —
   dropped fully. One **expanded** spell spans 3 slots; or **1–3 collapsed** spells.
3. A **view** decides what fills its non-menu slots (e.g. Memory bank → expanded **Accio**
   bar spanning 3 slots + the menu button). A thin **secondary-settings row** can sit ON TOP
   of the dock row (e.g. tag chips while searching) — rarely used.
4. **Spell Menu overlay:** tap menu button → blur + darken background, a **circle of spells**
   appears center-screen, near-instant. Center of circle = nothing, or a **back** action.
   Tap the blurred background (not a spell) → return to the page.
5. **Three forms:**
   - **General** — the daily spells (Write memory, Accio, Sync + others). Gold.
   - **Detailed** — a spell with variations opens a **nested** spell menu (ring of variants).
   - **Conditional** — opened on a page → shows **recommended** spells for that page;
     visually distinct (different colour); **one click back** to General.
6. **Overflow:** when there are more spells than fit, the ring **scrolls** — finite (start/end,
   not infinite), spells have a fixed **order** (most-used → least-used), and the bottom fades
   to darkness (spells "disappear into nothingness").
7. **A spell can open a window** (e.g. Sync long-hold → a window pops **above** the ring and
   blurs the ring behind it; closing returns you into the Spell Menu).
8. **Menu-button icon:** a few circles arranged in a circle, **golden**, shining/magical — it
   mirrors the ring layout.
9. **Write memory** keeps the loved gesture: **tap = write, hold = speak** (dictation).
10. For now, populate a believable set of **fake spells** so every state is explorable; then
    serve a **LAN URL** for on-device testing (`npm run dev:phone`).

## Architecture (pure ↔ hook ↔ component spine, per CODING.md)
- `phone/src/lib/spells/` — pure: `types.ts` (Spell, SpellMenuForm, Slot), `registry.ts`
  (general/detailed/conditional rosters + order), `ringLayout.ts` (circle positions, scroll
  geometry, bottom-fade), `dockModel.ts` (4-slot assignment, expanded=3 rule). Unit-tested.
- `phone/src/hooks/` — `useSpellMenu` (open/form/nav-stack/scroll), `useDock` (slot state).
- `phone/src/components/spellmenu/` — `SpellMenu` (overlay/blur), `SpellRing`, `SpellGlyph`,
  `SpellMenuButton` (golden icon), `SpellWindow` (window-above-ring).
- `phone/src/components/dock/` — `Dock`, `DockSlot`, `ExpandedAccio` (reuses SummonBar).
- Tokens: add spell-menu colours (General gold, Conditional tint) + motion to the phone token
  layer; no raw hex (computed geometry excepted).

## Phased roadmap
- **Phase 0 — Scaffold & archive.** Update folder; archive Wand (wheel hook/components) to
  `_archive/`; add spell-menu tokens + the golden menu-button icon. Keep app booting.
- **Phase 1 — Spell model (pure + tests).** Terminology (memories/spells); Spell/registry/
  ringLayout/dockModel with the fake roster; unit tests against the geometry + slot rules.
- **Phase 2 — The Dock.** Bottom 4-slot bar; menu button; collapsed spells; expanded Accio
  spell (reuse summon logic); secondary-settings row. Replace the Wheel in `PhoneApp`.
- **Phase 3 — Spell Menu overlay (General).** Blur/darken, radial ring, near-instant open,
  background-tap dismiss, center slot. Wire general spells (incl. Write tap/hold).
- **Phase 4 — Scroll + Detailed + Conditional.** Finite ordered scroll w/ bottom-fade;
  nested (Detailed) menus w/ back; per-page Conditional menus w/ colour + one-click-home.
- **Phase 5 — Spell windows.** A spell can open a window above the ring (Sync details as the
  worked example), blur ring behind, close → back in menu.
- **Phase 6 — Wire fakes end-to-end, test, ship for device.** Full explorable prototype,
  tests green, build, serve LAN URL.

## Live status
- 2026-10-11: Recon done (Wand map + UX/visual standard). Decisions locked above.
- 2026-10-11: **P0** ✓ scaffold + Wand archived. **P1** ✓ pure model (types/ringLayout/dockModel/
  registry) + 29 tests. **P2–P5** ✓ built in one coherent rewire — Dock (4-cell bar, gold Orbit
  button, resident Accio, recents, secondary row), radial Spell Menu (General/Conditional/Detailed,
  signed-arc scroll + void-fade, center nav, tap/hold, background-dismiss), Sync window. PhoneApp
  rewired off the Wand. 113 phone tests green; typecheck + production build clean.
- 2026-10-11: Serving on LAN `http://192.168.1.149:5174` for the owner's on-device feel-pass.
- 2026-10-11: **Feedback pass 1** (owner notes): fixed scroll "mirror" (rigid wheel → angular
  grab-spin, glyph follows the thumb on both sides); bigger spells (disc 64/R 128); center is now
  text/arrow not a disc ("see local"/"see general"/wand-flick back arrow); hidden-count indicators;
  transparent fire-gold orb menu button (no hub); resident Accio bar made clearly visible in-row.
- 2026-10-11: **Feedback pass 2 — the magic** (2 magical-UX experts synthesized): enchanted glyph
  material (per-hue radiance + specular + breathing aura), a "conjure" spark entrance (staggered,
  replays on open/switch/descend), and a NON-BLOCKING "evaporate into glowing sparkles" exit layer;
  ember orb button + HP back arrow + motes/chevron hidden-count. 114 tests green; build clean.
- 2026-10-11: **UX-team pass** (4 parallel reviewers) → fixed 2 P0 bugs (VoiceOver can't cast;
  near-miss tap closed the menu), rebuilt the dial feel (held `transition:none` through the whole
  spin, detent haptic, framerate-independent settle, finite-arc rubber-band), and the constellation
  node look (dark-well disc, ring from `--sh-glow`, allocated halo). Owner: "works very smooth."
- 2026-10-11: **Final refinements** (owner): Spell Menu opens over the memory bank on launch;
  labels decluttered (top-3 above / bottom-3 below, only upper-3 when spells hidden); hidden-counts
  are number-only, lower, and update LIVE during scroll; fixed the "Accio bar way below the button"
  CSS-grid row bug (pin every dock cell to row 1).
- **CLOSED 2026-10-11** — owner device-verified ("this is perfect! very smooth, very good").
  Merged to `main`; phone-only (native desktop app unaffected; test via `npm run dev:phone`).
  111 phone tests green. Deferred nice-to-haves live in wiki.md (first-run spin nudge, scrim
  fade-on-close, "tap center = cast", dynamic-type labels, the dead note-context menu path).

## Decisions / open questions
- Conditional colour: proposed accent-blue vs accio-violet ring (TBD in P4, owner to feel-test).
- Fake roster finalized in P1 (see wiki.md).
