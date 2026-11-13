# PACKAGES — v1 (a standard for raw memories that the desktop AI resolves on sync)

## Goal (owner, 2026-11-13)
Phone captures that need desktop AI are **packages**, not notes: sealed until processed, and
each one ENDS with a **Patronus block** holding a **sync spell** — the instruction the desktop
AI follows when the package arrives ("transcribe this and fill in the form from it", "describe
these pages and make dated memories"). One standard, one desktop runner, for Form and Journal.

## Decisions (owner answers, 2026-11-13)
- **Sealed = preview only.** Phone shows a Journal-style dashed card ("Daily Review · awaiting
  processing"); tap → read-only preview (typed answers + play the recording); delete allowed;
  no editing until it's processed and back.
- **The Patronus block is consumed** when processed — the result is a normal memory
  (questions + answers + recording at the bottom). But **redo must exist** (wrong language, AI
  out of credits…). Minimal redo already shipped (`Redo with AI…`, see Live status); the
  Steve-Jobs version belongs to the Patronus agent (below).
- **Instruction = per-type default, overridable per form** (a sync-spell block in the form
  template, written like /charm).
- **Journal moves onto the standard in this update**, after Forms (it works today → later phase).
- **The AI decides what to do, not the runner** (owner, 2026-11-13): on sync the desktop finds a
  package, reads its Patronus block's sync spell, and Patronus (Claude) EXECUTES it. No
  hard-coded "transcribe → fill" pipeline per type. The runner only hands Patronus the package
  + the instruction + TOOLS (via the Pensieve MCP, whose write tools exist but are dormant):
  `transcribe(ref, language)` (local engine — Claude can't hear audio itself), read pages,
  write answers into the form, create memories, finish/consume the package. So the spell can
  say "I speak English" or "only fill the King question" and it just works.
- Sync menu shows a package as ONE row ("Daily Review · Patronus") whose live status line is
  whatever step Patronus is on (from its tool calls), not fixed stages.

## Related, separate (owner vision — NOT this update)
**Patronus as the one agent that can do anything for you**: see the code, debug, change the code,
run sync commands, change transcription settings, redo a package — and always know the context
of the note/page you're on (its Timeline etc.). Belongs with `updates/2026-11-10 PATRONUS-AI - OPEN`.

## Phases (draft — each: tests → real run → commit/push; phone → deploy; desktop → tauri:build)
1. **Standard + codec:** `pensieve:patronus` fence (spell: `sync`, instruction text, package
   type), shared pure module in `src/lib/packages/` (phone imports it, like lib/forms). Where a
   package lives: decide in research — reuse `raw/<id>.json` (Journal's sealed record, already
   synced + hidden from notes) vs a note flagged `package:` (Forms today). UX agents for the
   phone card + preview + desktop row.
2. **Patronus runner:** one Process row per package → headless Claude + Pensieve MCP tools
   (enable write tools, add `transcribe`, `fill_form`, `finish_package`), timeout + logs +
   step-by-step status into the row; Redo = run the spell again from the sealed original.
3. **Form → package:** phone Done writes a sealed package ending in a Patronus block (default
   spell: "Transcribe the recording and fill in the form from it"); card + read-only preview
   on the phone; result = normal memory (block consumed); the card disappears on the phone.
4. **Form template override:** a sync-spell block in a form (default otherwise).
5. **Journal → package:** same runner, Journal's spell; migrate existing awaiting batches.
6. **Close-out:** merge, build, deploy, CLOSED.

## Live status
- 2026-11-13: shipped to main ahead of this update (owner-reported, fixed same day):
  `fb60969` open filled memory reloads (no restart); `450b91e` English is the default model;
  `b1ccc6e` answers right under questions, never below the recording; Redo with AI… (⋯ menu)
  + the sync drawer opens on any manual transcription request. Next: Phase 1.
- 2026-11-13: `side-view player ⋯ removed` (its Regenerate was wired to nothing — the
  owner's "no language prompt"). Plan revised: Patronus reads the sync spell and decides +
  executes via tools; no hard-coded per-type stages.
- 2026-11-13: **Phases 1–4 BUILT, merged to main, .app installed (10:50), phone deployed. NOT yet
  owner device-tested.**
  - P1 `c215e77`: `src/lib/packages` — pensieve:patronus fence, default spells, step protocol
    (actions transcribe / fill_form / finish, validated), `runPackage` loop. Live spike with the
    real claude (`spike-runner/`): picked English, filled 6 fields, finished in 2 steps.
  - P2 `deca2ce`: package = raw record + kind/title/fromForm/markdown/media; one Process row
    with a live step line; resolves into the memory with the SAME id (media never copied, never
    wiped — both desktop raw-delete paths now spare a folder a memory owns); restore point =
    what the phone sent ("Redo with AI…" keeps working); auto-transcriber skips package audio.
  - P3 `b39853c`: phone Done seals the walk-through (a local `draft` until then, never synced;
    crash-left drafts sealed at startup); dashed card "Waiting for the desktop" / "Patronus is
    working…"; read-only preview ending in the Patronus block; Delete only (frees the audio).
  - P4: `/patronus` block in a form (its own sync spell), shared PatronusOrb + SpellCard.
  - Decided: the word "package" never shows; orb keeps the shipped accent colour (matches the
    desktop trigger) rather than gold.
  - NEXT: owner device pass (Form spell → Done → card → preview → desktop row → memory back on
    the phone). Then P5 Journal → package, P6 close-out.
