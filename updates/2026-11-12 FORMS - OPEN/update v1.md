# FORMS

## Goal
**Forms** = reusable documents with pre-filled questions (templates) that become ordinary Memories
when filled. Open-ended questions, ratings, checklists, lists, guided prompts. First form to replicate:
the owner's **Daily Review** (`daily-form-example.md`).

Three ways a form gets filled:
1. **Desktop, by hand.** Create a new memory → while it's empty, offer the existing templates → pick
   one → type answers / tick / rate directly. Simple.
2. **Phone, by capture.** Walk through the questions; at any question record **audio, video, a photo,
   or text** — whatever is natural. It's saved as a (raw) memory to be processed. **No AI on the phone.**
   When the desktop syncs, it transcribes all audio/video and uses all the text to **fill in the
   answers, or expand answers already typed by hand**.
3. **Desktop, "memory compressing" (future).** A form (e.g. *Weekly Summary*) the owner can fill by
   hand AND press an **AI button**: AI reads past memories (e.g. the week's Daily Reviews), extracts
   what the form asks for and fills it in; the owner edits — and can type manually at the same time.

## Constraints (from CLAUDE.md / UX.md / design.md / memory)
- AI is desktop-only (Claude Code CLI). The phone captures; the desktop processes.
- Phone: Dock + Spell Menu only, controls at the bottom, never a top bar.
- A filled form must still be an ordinary Memory (`.md` + media, searchable) — reuse Raw Memory
  processing (RAW-MEMORY-JOURNAL) and the transcription pipeline rather than a parallel system.
- Steve-Jobs strict: fewest screens/controls/steps.

## Phased roadmap

### Phase 0 — UX concept round (multi-team) — IN PROGRESS (2026-11-12)
Owner asked for a real team of different UX experts, each producing interactive concepts built on an
outline of the existing UI (real stylesheets linked, as in RAW-MEMORY-JOURNAL's real-UI prototypes).
Teams (one `.html` each in `concepts/`, hub at `concepts/index.html`):
- **Steve Jobs team** — radical simplicity, one obvious way.
- **Disney Imagineering team** — story, ritual, magic, delight (the Pensieve world).
- **Don Norman team** — human-centred: affordances, mapping, feedback, error-proofing.
- **Bret Victor team** — direct manipulation, see-what-AI-does live, explorable.
- **Nintendo / Miyamoto team** — game feel, play, a ritual you want to come back to.
- **BJ Fogg × Kathy Sierra team** — habit design, tiny steps, make the user feel capable.

Each team covers all 5 surfaces: (A) template builder + field types, (B) desktop fill via empty-memory
template picker, (C) phone capture-through-questions, (D) desktop sync → AI fills/expands answers,
(E) memory compressing (weekly AI fill + manual edit).
Note: UX.md's "≤2 concepts at a time" rule is overridden for this round by the owner's explicit ask
for many concepts; the *next* round narrows to ≤2.

### Phase 1 — Owner review → pick direction, decide field-type set — next
### Phase 2 — Tech research: form storage format in `.md` (template + filled), BlockNote custom
blocks per field type, phone renderer parity (`noteMedia.ts`), sync object kind, AI fill contract
(Claude CLI prompt → structured answers, merge with hand-typed text without clobbering).
### Phase 3 — Templates: data model + desktop builder.
### Phase 4 — Desktop fill-in (empty-memory picker + field blocks).
### Phase 5 — Phone capture-through-questions (+ deploy).
### Phase 6 — Desktop processing: transcribe → AI fill/expand answers.
### Phase 7 — Memory compressing (AI fill from past memories).
Each build phase ends with tests + a real run; commit + push per phase.

## Live status
- 2026-11-12: update opened on `update/forms`; concept teams launched.
