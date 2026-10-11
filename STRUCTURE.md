# STRUCTURE.md — where code lives

How the repo is organised so any piece can be found and fixed in isolation. Pairs with
`CODING.md` (how to write it) and `design.md` (the visual standard). Referenced by
`CLAUDE.md` Core Principle 1 (Modularity).

## The rule
**Flat until it needs folders.** Start flat; the moment a cluster is ≥ ~6 related files,
give it a folder. **Every logical UI element gets its own file.** Compile/bundle into a
single file ONLY when something must be posted or served somewhere (that is exactly why
the phone prototype was one `.html` — and why it graduates to modules once it ships).

## The three layers (the spine of the whole codebase)
Code falls into exactly one of three layers. Keep them separate — it's what makes a bug
have one obvious home and makes logic testable without a DOM.

1. **Pure modules** — plain functions, no React, no DOM, no I/O. All real logic lives
   here: parsing, ranking, geometry, physics, state reducers, formatting. Unit-tested
   directly. (`lib/**`, and co-located pure files like `components/editor/blockDrag.ts`.)
2. **Hooks** — the imperative wiring: event listeners, rAF loops, `visualViewport`,
   refs, timers, store subscriptions. Hooks CALL pure modules; they never re-implement
   logic. (`hooks/**` for app-level; co-located `useX.ts` for element-local.)
3. **Components** — markup + the output of hooks. A component renders; it must not
   re-derive logic a pure module already owns.

## Map
```
src/
  main.tsx, App.tsx          app entry + top-level composition (thin — wires hooks)
  index.css                  imports tokens.css, then Tailwind, then global rules
  styles/
    tokens.css               THE design-token source of truth (see design.md)
  components/                reusable, standardized UI (parents children compose from)
    editor/                  the TipTap editor cluster (component + schema + block ops + skin)
  features/                  self-contained product surfaces — NO cross-feature imports
    capture/ editor/ audio/ video/ journal-import/ timeline/ coach/
    gallery/ summon/         (current surfaces)
  hooks/                     app-level React hooks (useNotes, useSync, useTheme, …)
  lib/                       pure logic, DOM-free, heavily tested
    store/                   persistence adapter (getStore() is the ONLY entry point)
    sync/ search/ md/ categories/ flasks/ gallery/
  test/                      shared test setup
src-tauri/                   Rust shell (filesystem, SQLite index, media, whisper.cpp)
phone/                       the phone PWA (own Vite app; see below) — created in UI-FOUNDATION
```

## Boundaries (enforced conventions)
- **Features never import each other.** `features/gallery` must not import from
  `features/summon`. Shared needs move DOWN into `components/` or `lib/`.
- **Store access only through `lib/store/index.ts` `getStore()`.** No component or
  feature reaches a concrete store (browser/tauri) directly.
- **`lib/` is DOM-free and React-free.** If something in `lib/` needs the DOM, it's in
  the wrong layer — move the wiring up into a hook.
- **Hook location:** a hook used by one element lives beside it (`components/editor/
  useBlockDrag.ts`); a hook used across the app lives in `hooks/`. One caller → co-locate;
  second caller → promote.

## The phone PWA (`phone/`)
Separate Vite+React+TS app (per PWA-CAPTURE). It **does not share desktop components**
(different runtime, one-handed glance-and-go UI) but it **shares the token source**
(`src/styles/tokens.css`) and may reuse DOM-free `lib/` logic (search, md, sync concepts).
Its own three layers mirror the spine: `phone/src/lib/wand/` (pure physics), `hooks/`,
`components/`. See `updates/2026-10-11 UI-FOUNDATION`.

## Updates folder
Every non-trivial task is `updates/YYYY-MM-DD NAME - OPEN/` with `update vX.md` (goal +
phased roadmap + live status) and `wiki.md` (durable decisions). `- OPEN` → `- CLOSED`
when merged. This is the project's progress tracker — keep it current.
