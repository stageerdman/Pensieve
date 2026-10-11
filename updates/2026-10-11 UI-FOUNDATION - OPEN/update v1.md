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
  finalized. Phase 1 (standards + token layer) is decision-independent and ready to start.
  Phases 3–4 (graduate the phone to React) await the owner's go/no-go on the approach.
