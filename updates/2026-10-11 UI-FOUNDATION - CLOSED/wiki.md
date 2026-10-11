# UI-FOUNDATION — wiki (durable decisions & lessons)

## UI-design DNA extracted from INIT.md (the project bootstrap, now deleted)
INIT.md was the one-time project-setup template. Per the owner, its UI-design
principles are distilled here before the file self-destructs. These are the standard
this update (and all UI work) is held to:

1. **File-per-element.** Every logical UI element gets its **own file**. Compile/bundle
   into a single file **only when something must be posted/served somewhere** (that
   single-file exception is exactly why the phone prototype is one `.html` — and exactly
   why it now graduates to modules once it stops being a throwaway).
2. **Parents govern children.** Base components (parents) that everything composes from;
   change a parent → change the whole app. A small shared set, composed — never a wall of
   bespoke one-offs.
3. **Semantic tokens, one source of truth.** Colours as semantic names (`surface`,
   `text-muted`, `accent`, state colours), plus one spacing scale, one type scale, one/two
   radii, a stated vibe. Change a token → change the whole app. No ad-hoc values.
4. **`design.md` is the contract.** A short doc stating the vibe, the rules, and what NOT
   to do — read before building any screen. Keep it short; long material lives in docs and
   is referenced.
5. **Strict-minimalist orchestration.** Redesign until only essential elements remain with
   a clear structure. Run several UX experts in parallel; the orchestrator stays strict and
   minimalist (Steve-Jobs bar). Every element must earn its place.

These already echo CLAUDE.md's Core Principles and design.md — recorded here so the DNA
survives INIT.md's deletion and anchors the standards work below.

## State of the standards docs (2026-10-11)
- `design.md` (46 lines) and `UX.md` (133 lines) exist.
- `CLAUDE.md` references **`STRUCTURE.md`** and **`CODING.md`** which **do not exist** —
  a gap. The structure/coding standards this update defines should land in real docs so
  "surgical changes on any part of UI" has a written rulebook.

## Token foundation (2026-10-11)
- Desktop: `src/index.css` `:root` / `.dark` are the single source of truth; Tailwind
  (`tailwind.config.js`) only maps them. Healthy.
- Phone prototype: defines its **own** inline `:root` tokens in the HTML `<style>` —
  divergent from desktop. Reconciling these into one shared semantic layer (that both the
  Tauri desktop app and the phone PWA draw from) is part of this update.

## Phase 0 audit findings (2026-10-11, 3 parallel agents)

### Desktop `src/` — health verdict: good bones, local overgrowth
- **Strongest part = boundaries.** No cross-feature imports (gallery ↔ summon), store
  access funneled through `lib/store/index.ts`, `lib/sync` cleanly splits adapter/engine/
  oauth. The pure-logic layer is well unit-tested (`lib/search/*`, `lib/sync/*`, etc.).
- **Top duplication:** click-outside+Escape reimplemented **7×** (SyncStatus,
  CategoryDropdown, FlaskButton, OverflowMenu, GalleryCustomise, CardContextMenu,
  FilterEditPopover) → one `useDismiss`. `findScrollParent` + edge auto-scroll math
  byte-identical in `useBlockDrag.ts` + `useBlockMarquee.ts` (+ a 3rd drag in
  WorkingSetStrip) → one `dragScroll.ts`.
- **Oversized/overloaded:** `App.tsx` (421, extract `useGlobalShortcuts`/`useTabs`),
  `SyncStatus.tsx` (279, god component → pure `deriveSyncView` in lib/sync),
  `Flask.tsx` (335, pull fill math into a tested helper), `grammar.ts` (454).
- **Structure:** flat `components/` (39 files) hides the editor cluster (9+ files) →
  `components/editor/`. Hook-location rule (app `hooks/` vs editor-local) is unwritten.
- **Standards bypass:** ~25 arbitrary `text-[Npx]` sizes in `features/summon/*`
  (violates design.md "no ad-hoc sizes"); untokenized radii (`rounded-md/sm/xl/full`,
  one `rounded-[22px]`); literal gold hex in `DateRangeCalendar` instead of `var(--gold)`.
- **Test gaps (risk-ranked):** `lib/sync/{oauth,vault,graph}` (zero, highest risk),
  `hooks/useSync.ts`, `WorkingSetStrip` drag-reorder.

### Tokens — verdict: no single source of truth
- Desktop `src/index.css` `:root`/`.dark` is a real system (Tailwind only maps it).
  **`design.md` is stale** — doesn't mention `surface-sunken`, `accent-glow`, `gold`,
  the 9-key category palette, flask-hue tokens, or the shipped magical gradients/glows
  it still forbids.
- Phone prototype `:root` is a **hand-copied dark-only fork** — different radius (16 vs
  6px), its own `--accio`/`--spring*`/`--slot`/`--kb`, no light theme, drifts silently.
- **Fix:** one framework-agnostic token source → feeds desktop Tailwind + phone PWA;
  promote category/flask into real Tailwind utilities (kill the `hsl(var(--cat-*))`
  string dialect); lock a radius scale + a 3–4 step type scale; update design.md to match
  shipped reality.

### Phone monolith — verdict: cleanly portable, physics are the crown jewels
- Decomposes into **pure unit-testable modules** (`wheelPhysics`, `loupeFisheye`,
  `scrollSettle`, `accioQuery`, `accioRank`, `syncMachine`, `wordSelection`) + **hooks**
  (keyboard inset, wheel gesture, reel fisheye, caret-visible, autosave, sync, accio) +
  thin **components** (Wheel/Reel/Accio/Sync/Note). All locked tunables captured.
- **Hard porting constraints (non-negotiable):** rAF physics write to DOM via refs and
  must bypass React's render cycle; keyboard `.focus()` must be synchronous-in-gesture
  (no effect/timeout); `NoteBody` is uncontrolled contenteditable React never re-renders
  while typing; touchmove scroll-lock + word-select need native `addEventListener`
  (`{passive:false}`, post-iOS-pass `setTimeout(0)`); ONE filtered/ranked data source for
  reel + search sheet (two lists was the historical bug); preserve the
  `.reel{isolation:isolate;z-index:0}` stacking contract; port formulas verbatim + unit
  test against tunables — do NOT re-approximate with framer-motion/react-spring; strip
  `FAIL_RATE`/`demoForceFail` before real sync.
- Carry over the jsdom verification technique (visualViewport/PointerEvent shims) into
  Vitest for the new hooks.

## Phase 2 notes & non-bug findings (2026-10-11)
- **Sync plumbing display-only sharp edges** (found while writing tests, NOT bugs):
  (1) `oauth.ts` `postToken` strips `\n` but not `\r\n` from `error_description` — a CRLF
  AAD payload leaves a trailing `\r` (display-only). (2) `graph.ts`'s 429/503 retry loop
  gives up after `maxRetries` and returns the **stale** 429/503 response rather than
  throwing — direct `.fetch()` callers must check `res.ok`/go through `.json()` (which
  throws `TransientSyncError`). Intentional per comments; flagged for future direct callers.
- **Radius lock is a small intentional visual shift** — `rounded-sm` 2→4px (1 use),
  `rounded-xl` 12→14px (5 uses), portal 22→20px. `rounded-md` (the ~30× workhorse) is
  unchanged. Watch on the owner's device pass; trivial to retune (all derive from `--radius`).
- **Layering decision:** sync UI-state types (`SyncPhase`/`SyncErrorKind`/`SyncUi`) now live
  in `lib/sync/types.ts` (their domain home) so the pure `deriveSyncView` imports only from
  `lib/`; `useSync` re-exports them so existing call sites are untouched. `types.ts` type-only
  imports `SyncConflict` from `engine.ts` (erased at build → no runtime cycle).
