# UI-FOUNDATION — update v1

## Goal
Get the UI into a **healthy, modular, standardized** state so the upcoming **big iPhone
UX update** can make surgical changes to any part of the UI with confidence. Two surfaces:
the **phone** (today a single 1552-line HTML prototype) and the **desktop** (`src/`,
React/TS, ~130 files). Establish one written rulebook for structure + standards that both
obey, and one shared semantic token layer.

This update is the **foundation**; the big iPhone UX redesign is the *next* update and
builds on what we lock here. Relates to [[../2026-10-08 PHONE-UX - OPEN/update v1]] (the
Wand design, direction locked) and [[../2026-10-07 PWA-CAPTURE - OPEN/update v1]] (the
Vite+React PWA runtime the phone ships on).

## Scope (owner-confirmed)
**Full UI audit — phone + desktop.** Plus: extract UI-design DNA from INIT.md (done →
wiki.md) and delete INIT.md (done).

## The core decision (pending owner confirm)
The "iPhone UX" code today is one monolithic `01-the-wand-v2.html`. "Modular + healthy
before the big update" means graduating it into the **real Vite + React + TS PWA** that
PWA-CAPTURE already specifies — porting The Wand into file-per-element components, pure
unit-tested physics modules (wheel/loupe/word-select), hooks, and shared tokens, still
driven by seed/mock data (no auth needed yet; auth/sync wiring stays Phase 3 of PHONE-UX).
The big UX update then lands on the actual shippable app, not throwaway vanilla JS.
→ Recommended. Confirm before the build phases start.

## Phased roadmap (finalized from audit synthesis — build phases gated on the decision)
- **Phase 0 — Audit. ✅ DONE.** Three parallel agents (phone decomposition, desktop
  health, token foundation). Findings + ranked cleanups → wiki.md.
- **Phase 1 — Standards rulebook + token layer** *(decision-independent — can start now).*
  Write the missing `STRUCTURE.md` + `CODING.md` (file-per-element, component/hook
  conventions, the pure-module↔hook↔component split, z-layer + "computed-style vs
  escape-hatch" rules). Tighten/refresh `design.md` to match shipped reality. Stand up the
  single shared semantic **token layer** (one source → desktop Tailwind + phone), lock a
  radius scale + a 3–4 step type scale.
- **Phase 2 — Desktop cleanups to the bar.** Highest-leverage, low-risk, behavior-neutral:
  `useDismiss` (kill 7× dup), `dragScroll.ts` (kill the drag dup), `deriveSyncView`,
  extract `useGlobalShortcuts`/`useTabs` from `App.tsx`, group `components/editor/`,
  collapse Summon's `text-[Npx]` onto the scale, tokenize radii/gold. Tests lock each;
  fill the top test gaps (`useSync`, sync oauth/vault/graph, WorkingSetStrip drag).
- **Phase 3 — Phone graduation scaffold** *(needs the decision).* Stand up the phone PWA
  skeleton (Vite+React+TS, phone tokens as documented extensions of the shared layer),
  seed data only — **no auth** (auth/sync wiring stays PHONE-UX Phase 3).
- **Phase 4 — Port The Wand** *(needs the decision).* Port into pure physics modules +
  hooks + thin components, preserving every locked interaction exactly (wheel engine,
  loupe fisheye, keyboard, word-selection, Accio single-source, sync states). Unit-test
  the physics against the captured tunables; honor the non-negotiable porting constraints
  in wiki.md.
- **Phase 5 — Verify + lock.** vitest/jsdom for logic + hooks; owner on-device feel-pass
  (Vite dev server over LAN). Update docs; close — handing a healthy, modular base to the
  big iPhone UX update.

## Live status
- 2026-10-11: Update opened. Scope confirmed (full UI audit, phone + desktop). INIT.md DNA
  extracted → wiki.md; INIT.md deleted (was untracked, never committed). Phase 0 audit
  commissioned (3 parallel agents).
- 2026-10-11: Phase 0 audit complete (all 3 agents). Findings → wiki.md; roadmap
  finalized. Owner confirmed: graduate the phone to React + full desktop cleanup.
- 2026-10-11: **Phase 1 DONE — standards rulebook + token source of truth.**
  - Extracted all design tokens into `src/styles/tokens.css` (the single source; `index.css`
    `@import`s it before Tailwind). Behaviour-neutral: verified light+dark compile into the
    bundle identically; tsc + build green.
  - Wrote `STRUCTURE.md` (where code lives — the flat-until-folders rule, the three-layer
    spine pure↔hook↔component, feature/store boundaries, the `phone/` plan) and `CODING.md`
    (how to write it — reuse, the layer split, rAF/keyboard/contenteditable rules for phone,
    styling via tokens, z-layers, logging, testing).
  - Refreshed `design.md` to match shipped reality: real token list (surface family,
    accent/accent-glow, gold, Basin, flask-hue + category palettes), a deliberate type scale
    (added `text-2xs`=11px to kill the 9/10/11 soup), a radius scale, a managed z-layer
    table, and corrected the stale "no gradients/shadows" rule vs the intentional magical glow.
  - Added `text-2xs` to `tailwind.config.js` (purely additive). Radius-lock + className
    migration deferred to Phase 2 (done with per-usage review).
- 2026-10-11: **Phase 2 DONE — desktop cleanups to the bar (full set).** 9 commits,
  each tsc + build + tests green (411 tests, up from 304):
  - #6 Grouped the 15-file editor subsystem into `components/editor/`.
  - #2 Deduped drag auto-scroll → `components/editor/dragScroll.ts` (+test).
  - #1 Consolidated 7 click-outside+Escape impls → `hooks/useDismiss.ts` (+test).
  - #7 Tested the untested sync plumbing: `lib/sync/{oauth,vault,graph}` (+50 tests).
  - #4 Extracted pure `lib/sync/deriveSyncView.ts` from the SyncStatus god component
    (+10 tests); moved sync UI-state types to `lib/sync/types.ts`.
  - #3 Snapped 43 arbitrary `text-[Npx]` onto the type scale; tokenized the gold literal.
  - #8 Tested WorkingSetStrip drag + useSync wiring (+37 tests).
  - #5 Decomposed `App.tsx` 421→320 lines → `hooks/useTabs.ts` + `useGlobalShortcuts.ts`.
  - Locked the radius scale to `--radius` in Tailwind; killed the one `rounded-[22px]`.
- 2026-10-11: Owner chose **"port everything now"** for the phone graduation.
- 2026-10-11: **Phase 3 DONE — phone PWA shell.** In-repo self-contained `phone/`
  (own vite/tailwind/postcss/tsconfig + manifest, dark-first), sharing the token SOURCE
  via `@import ../src/styles/tokens.css` + phone-only extensions. Verified single source
  of truth compiles into the phone bundle. Scripts: `dev:phone` (LAN), `build:phone`.
- 2026-10-11: **Phase 4 DONE — The Wand ported to modular React** (2 delegated waves,
  each verified + committed):
  - Wave 1: 9 pure DOM-free modules in `phone/src/lib/wand/` (wheel spring, loupe
    fisheye + its odd integral, scroll settle, accio query/rank, sync reducer, word-
    selection core, flask SVG), all tunables cross-checked verbatim; 76 unit tests.
  - Wave 2: the UI — 9 hooks + reel/wand/accio/sync/note components + verbatim `wand.css`
    + seed + `PhoneApp` wiring. All 7 hard constraints honoured (rAF via refs; keyboard
    from visualViewport + focus-in-gesture; uncontrolled contenteditable; native
    `{passive:false}` listeners; one filtered source; `.reel` stacking contract; `--m`
    magnification). 43 source files; 81 phone tests incl. a jsdom `PhoneApp` smoke test.
  - Whole repo: **492 tests pass**; desktop + phone builds clean; desktop tsc clean.
- **Phase 5 — verify + lock (PARTIAL).** Logic/structure verified (vitest). The one thing
  jsdom can't measure — **on-device feel** — needs the owner: `npm run dev:phone`, open on
  the iPhone over the LAN. Check: loupe fisheye while flinging; wheel collapse/expand +
  inertia; keyboard raise/drop + Accio reopen; touch double-tap word-selection; haptics;
  plus the earlier-round pending notes (searching, Adjust). The prototype
  (`01-the-wand-v2.html`) stays as the design reference; this port supersedes it for the
  build. Demo `FAIL_RATE` kept in PhoneApp so the red sync state is feelable — strip when
  PHONE-UX Phase 3 wires real OneDrive.
- 2026-10-11: **Phase 5 LOCKED — owner did the on-device feel-pass (`npm run dev:phone`
  → iPhone): "all works."** Loupe/inertia, wheel, capture/keyboard, Accio, and sync all
  confirmed on device. The Wand port's UX direction is locked.
- **Status: UPDATE COMPLETE.** Desktop foundation + standards + one token source +
  The Wand graduated to a modular React PWA, all merged to main, native app rebuilt,
  device-confirmed. Next (separate update): wire the phone to the OneDrive/PWA-CAPTURE
  runtime, replacing seed data + the demo FAIL_RATE.
