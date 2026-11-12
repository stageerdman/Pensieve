# FORMS — v2 (direction locked, build plan)

v1 = the open concept round. v2 = the owner's chosen direction (see `wiki.md` → DECIDED 2026-11-12) turned
into a step-by-step build plan grounded in the real code (three research passes, summarised in
"Ground truth" below).

## The product, as decided
- **A form is a memory.** Write the questions in an ordinary memory and flip **Use as form**. No builder.
  The form also carries its **Compress instruction**, which tells AI what Compress does for it.
- **Three field types, plain Markdown:**
  | Type | In the template `.md` | Filled |
  |---|---|---|
  | **Question** | a bold-only line `**…**`, optional italic guidance lines after it | text, bullets or numbers below it |
  | **Checklist** | a bold line followed by `- [ ]` items | `- [x]` ticks |
  | **Scale** | a bold line + a `pensieve:scale` block (1–N, one anchor per point) | the picked number; the block shows "4 · Mini high" |
- **Desktop: fill by hand.** ⌘N → the empty memory offers your forms → pick one → its questions are written
  in → type, tick, rate. It's just a memory from then on.
- **Phone: One Question.** Full-screen deck, one question per screen, swipe to move. Type / tick / rate
  in place. **One Record** runs across the whole session, with **live voice movement at the top**. The
  end has a **review step**: replay the saved recording, optionally **add photos or a video**, then
  **Done** → saved as a memory marked *awaiting processing*.
- **After sync (desktop):** transcribe → AI writes the answers in as **plain text** (fills empty answers,
  expands ones you typed, sets a blank rating/tick only if you said it out loud, never overrides yours) →
  **the original recording stays at the bottom** → the "awaiting" mark is removed. It's now **forged**: a
  normal memory, editable anywhere.
- **Compress (desktop):** a memory made from a form that has a Compress instruction shows one
  **Compress** button, and nothing else beside it. AI reads the past memories the instruction names and fills the answers,
  citing each fact with **date chips** that link to the memory of that day.

## Ground truth from the code (what shapes the plan)
1. **Frontmatter drops unknown keys** in all three parsers: desktop `src/lib/md/frontmatter.ts:34/66`,
   phone `phone/src/.../noteFormat.ts:65-84`, Rust MCP `src-tauri/src/mcp/tools.rs:54-104` (which also
   already drops `icon`, a live bug). Any form flag would vanish on save → **fix first**.
2. **Checklists already round-trip** on desktop (BlockNote writes `* [ ]`) and parse on phone
   (`noteMedia.ts:199`), but **the phone can't toggle a box**.
3. **No notes SQLite index**: notes are listed via the store + an in-memory `MemoryIndex`; date filtering
   exists (`search/evaluate.ts:44`, `dates.ts:72`). Listing forms = a flag in the store's list results.
4. **New memory** = `useTabs.newNote` → `TauriStore.create` (empty markdown). No empty-note UI yet.
   Replacing a body uses the `restoreVersion` pattern (`useNotes.ts:189`: set → bump `loadEpoch` → persist).
5. **Custom blocks** = `createReactBlockSpec` + a `pensieve:*` fence codec in `src/lib/md/` (audio/gallery/
   video/journal are the templates). The phone has its own fence parser (`noteMedia.ts`), which must stay in parity.
6. **Phone voice engine** (`voiceCapture.ts`) already exposes live RMS level (`activeSnapshot()`) → the
   top visual is cheap. BUT it **finalises when the app is hidden** (screen lock ends the take) and it
   always writes into an open Note. Both need a change for a session-long take.
7. **Phone media**: photo/video pickers exist but bail without an open note → the review step needs its own handlers.
   Swipe pager to copy: `PhoneLightbox` scroll-snap track. New overlay **must** join the touch-guard
   allowlist (`PhoneApp.tsx:910`).
8. **Desktop Process queue** is scan-based (no "needs processing" marker anywhere). Items are a tagged
   union (`queueOps.ts:19`), one job at a time, auto-runs on sync (any open conflict blocks it).
   Adding a `form` job = new union member + scan + runner, modelled on `runJournalItem`.
9. **Claude calls**: one-shot `claude -p` pattern in `src-tauri/src/ai_vision.rs` (no timeout, no logs),
   which is the template for form-fill and compress (add timeout + logging + JSON answer).
10. **Raw Memory was considered and rejected** as the vessel: it's journal-photo-only. An ordinary memory
    with an *awaiting* mark is simpler, visible + editable on the phone, and already syncs with its media.

## Build plan (each phase: tests → real run → commit + push; phone phases deploy; desktop phases `tauri:build`)

### Phase 1: Foundations (no UI)
- Frontmatter round-trips **unknown keys** in desktop TS, phone, and Rust MCP (fixes the MCP `icon` loss too).
  New keys: `form: true` (template), `compress: "…"` (template), `fromForm: <templateId>` (made from a form),
  `formStatus: awaiting` (phone session waiting for desktop).
- `lib/forms/`, a pure module: parse a template `.md` → fields `[{kind, question, guidance, anchors|items}]`;
  locate each field's answer region in a filled memory; write answers back. Tested on the owner's
  Daily Review verbatim (9 fields → 3 types).
- `pensieve:scale` fence codec (desktop) + phone parser parity.
- **Test:** round-trip suites (unknown keys survive edit+save on all 3 sides), parser on the real form.

### Phase 2: Desktop: author a form
- **Use as form** toggle on a memory (in the existing memory menu), with the **Compress instruction** field
  shown once it's a form.
- **Scale block** in the editor (slash menu `/scale`, edit N + anchors inline; owner's 1–5 anchors
  convert from the pasted numbered lines).
- Build the owner's Daily Review as the first real form.

### Phase 3: Desktop: fill by hand
- Empty new memory → offer "Start from a form" (disappears on first keystroke) → pick → questions
  written in, `fromForm` set. Type / tick / rate in the normal editor. **`tauri:build`, owner tries it.**

### Phase 4: Phone: One Question deck
- Entry point (see open question 1) → full-screen deck (scroll-snap pager), Dock per the standard
  (Record · Back + gold menu), answer in place (type / tick / rate), progress dots.
- **Session take:** one Record across all questions; live level visual at the top; screen-lock **pauses**
  and resumes into the same take instead of ending it.
- **Review step:** play the saved recording, add optional photos / video, **Done** → memory saved with
  questions + typed answers + `pensieve:audio` at the bottom + extras + `formStatus: awaiting`.
- Phone can also tick checkboxes and rate in an ordinary (forged) memory.
- **`deploy:phone`, owner device pass.**

### Phase 5: Desktop: process & forge
- Process queue `form` job: scans `formStatus: awaiting` memories; waits for the recording's transcript
  (existing auto-transcribe), then one Claude call (Rust command with timeout + logs) → JSON answers per field.
- Merge: fill empty, append after typed text, blank scale/checklist only, never override; save a Timeline
  checkpoint first; reload the editor if that memory is open; remove `formStatus` → forged; sync.
- **`tauri:build` + end-to-end on the real phone → sync → desktop.**

### Phase 6: Compress
- Compress button on memories whose form has a `compress` instruction (no caption).
- Gather the named memories by date (existing date ranges + `fromForm`), one Claude call → answers with
  date citations → date chips linking to those memories. Fields you're typing in are skipped.
- Build the owner's **Weekly Summary** form as the first compress form. **`tauri:build`, owner tries it.**

### Phase 7: Close-out
- Merge `update/forms` → `main`, final `tauri:build` + `deploy:phone`, folder → CLOSED.

## Live status
- 2026-11-12: direction locked by owner (Jobs: Just a Note + One Question + Just a Note compress, with
  owner changes). Other concepts removed from the folder (in git history). Plan v2 written. Next: Phase 1.
