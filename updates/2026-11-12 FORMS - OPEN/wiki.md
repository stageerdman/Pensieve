# FORMS — wiki (durable decisions & lessons)

## Carried-in lessons
- Prototype fidelity: generic fake-bezel mockups were rejected in RAW-MEMORY-JOURNAL. Concepts must
  link the REAL stylesheets (phone: `phone/src/styles/*.css`; desktop: compiled Tailwind +
  `blocknote-skin.css`) and reuse real class names/markup.
- Prototypes are local self-contained `.html` (classic script, file://-safe) — owner doesn't use Artifacts.
- Phone controls live in the Dock + Spell Menu, bottom only.

## DECIDED (2026-11-12, owner review of the six-team concept round)
All concepts dropped except the Steve Jobs team's (`concepts/jobs.html`, git history holds the rest).
- **Build + desktop fill = "Just a Note"** (jobs.html concept 1, surfaces A+B). No form builder: a form
  template is an ordinary memory flagged "Use as form". Field types come from plain Markdown: a bold
  line = Question, `- [ ]` items = Checklist, a question + numbered anchor lines = Scale. A new empty
  memory offers the forms (desktop AND phone); picking one fills the questions in; type/tick/rate directly.
- **Phone = "One Question"** (jobs.html concept 2, surface C): one question per full screen, swipe to move.
  Owner changes:
  - **ONE voice recording for the whole session**, no per-question splitting. AI sorts out which part
    answers what later.
  - **Live voice movement at the top while speaking** so it's obvious the mic is registering.
  - **Before Done: a review step** showing the saved recording, playable again.
  - **At the very end: optional extra photos or a video.** Rare, "just in case".
- **After sync: answers are written straight in as plain text** in each field (no pale ink, no
  accept/reject). Owner edits freely on desktop or phone. **Original recording stays at the bottom**
  of the note.
- **Once processed, the form is "forged" into a normal memory.** It is no longer a form; it behaves
  exactly like any other memory.
- **Compress = "Just a Note" E** (jobs.html concept 1, surface E): a single **"Compress"** button, with
  **no side notes/caption next to it**. Answers reference past memories **by date** (day chips), which the
  owner especially likes. **What Compress does must be defined when the form is created** (the template
  carries its compress instruction, e.g. which memories and over what range), so AI knows what to do.

- **Phone entry = a Form spell** in the gold Spell Menu (one form → straight in; several → pick).
- **Charms (owner's concept, 2026-11-12):** Compress is not a setting. It's a `/charm` block placed in the
  template: the owner names it (e.g. "Compress") and writes a plain prompt. It's **invisible** in memories
  copied from the form, where it appears only as a button with its name. **AI decides by itself** the period
  and what to find/filter. "A command for AI added to the form"; more charm concepts will come later, so
  build it as a general mechanism, not a Compress special case.

## Open questions (for owner, after concept review)
- Is a filled form one Memory, or does each answer become linkable/searchable on its own?
- Ratings/checklists over time: should they become trackable (trend of "satisfaction" across days)?
- When AI expands a hand-typed answer, how is AI text distinguished from the owner's words?
- Template editing after use: do old filled forms keep their version of the questions?

## Phase 1 lessons (2026-11-12)
- **Frontmatter now round-trips unknown keys** everywhere (desktop `NoteFields.extra`, phone
  `ForeignMeta.extra`, Rust MCP `Frontmatter.extra`). Forms keys ride there: `form`, `fromForm`,
  `formStatus`. Read them only via `src/lib/forms/meta.ts`.
- **One forms module, shared**: `src/lib/forms/` is pure and dependency-free, and the phone imports it
  directly (`../../../src/lib/forms`). That breaks the old "phone duplicates desktop parsers" habit on
  purpose: this logic (field parsing, answer merge) is too important to keep two copies of.
- **Field grammar works on the stored .md, line-based** — no editor in the loop, identical on both
  platforms. Proven: the Daily Review round-trips byte-for-byte through the real BlockNote converter
  (bar a trailing newline) AND through the phone's `parseNoteContent`/`serializeBlocks`.
- BlockNote today loads `pensieve:scale`/`pensieve:charm` as plain code blocks (lossless); Phase 2 gives
  them real blocks. The phone shows them as raw text lines until Phase 4 renders them.
- Field ids are slugs of the question text, so they are stable between a template and memories made from it.
