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
- Sync menu shows a package as ONE row with stages ("Daily Review · transcribe → fill"), not
  an unrelated transcription row + a form row.

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
2. **Form → package:** phone Done writes a sealed package ending in a Patronus block; card +
   read-only preview on the phone; desktop runner = transcribe → fill as one row with stages;
   result = normal memory (block consumed); phone gets the memory, the card disappears.
3. **Form template override:** a sync-spell block in a form (default otherwise).
4. **Journal → package:** same runner, Journal's spell; migrate existing awaiting batches.
5. **Close-out:** merge, build, deploy, CLOSED.

## Live status
- 2026-11-13: shipped to main ahead of this update (owner-reported, fixed same day):
  `fb60969` open filled memory reloads (no restart); `450b91e` English is the default model;
  `b1ccc6e` answers right under questions, never below the recording; Redo with AI… (⋯ menu)
  + the sync drawer opens on any manual transcription request. Next: Phase 1.
