# wiki — NOTION-UX

Durable decisions and lessons for the Notion-like block experience.

## The core constraint (why this update is shaped the way it is)
Plain `.md` on disk is the **source of truth** and the round-trip must stay
faithful + idempotent (INITIAL-BUILD P1, `editor.test.ts`). Every choice below is
downstream of that one rule.

## Open-source editor research (2026) — "outsource as much as possible"
Evaluated six libraries against: same engine as our TipTap stack · drag/slash/
block-select/toolbar out of the box · **Markdown fidelity** · license · maturity ·
weight · embeddable-vs-template.

| Library | License | Engine | Drag/Slash/Select/Toolbar | Markdown fidelity | Notes |
|---|---|---|---|---|---|
| **BlockNote** | Core MPL-2.0 (commercial OK); "XL" add-ons GPL-3.0/paid ($195/mo) | ProseMirror + **TipTap** | All ✅ OOTB | **Lossy** both ways; docs discourage MD as truth, route via HTML | Best *reuse* fit by engine, but loses our data model |
| **Plate / PlateJS** | MIT | **Slate** (not PM) | All ✅ (richest) | Best-in-class (remark/mdast, MDX for custom nodes) but documented round-trip bugs (#5138) | Would replace our whole engine |
| **Tiptap Notion template** | Proprietary, paid Start plan for prod | **TipTap** | All ✅ + collab/AI | No MD serialization story | CLI template, not a neutral lib; heavy |
| **Editor.js** | Apache-2.0 | Custom | Partial (plugin per block) | No first-class MD | Poor fit for MD truth |
| **Yoopta** | MIT | **Slate** | All ✅ | `getMarkdown()` exists, fidelity under-documented; small community | Engine mismatch |
| **Novel** | Apache-2.0 | **TipTap** + Vercel AI | Slash+bubble ✅, drag partial | uses `tiptap-markdown` (same lossy subset) | AI-writing *template*, not a block-editor lib |

**Decision:** stay on **TipTap + `tiptap-markdown`**; add open-source TipTap
*extensions* for drag + slash. No JSON-block editor is lossless on Markdown, so a
wholesale swap trades away the one hard constraint. Fallback (only if P2 fails):
BlockNote with JSON-as-truth + a `.md` export — revisit with owner first.

Sources: blocknotejs.org/docs/foundations/supported-formats · platejs.org/docs/markdown ·
github.com/udecode/plate/issues/5138 · tiptap.dev/docs/ui-components/templates/notion-like-editor ·
editorjs.io · github.com/yoopta-editor/Yoopta-Editor · github.com/steven-tey/novel

## Candidate extensions for P2 to decide between
- **Drag handle:** official `@tiptap/extension-drag-handle-react` (functional, but
  install pulls `@tiptap/extension-collaboration` + `y-tiptap` + `yjs` — heavy for
  a single-user local app) **vs.** community `tiptap-extension-global-drag-handle`
  (no yjs, lighter). Lean lightweight unless the official one clearly wins.
- **Slash menu:** TipTap's official **DragContextMenu** UI component bundles a
  `withSlashCommandTrigger`, but it's part of the (paid) UI-components set — check
  licensing. Otherwise build on the MIT `@tiptap/suggestion` utility (same
  primitive the mention/slash examples use) for full control + zero license risk.

## Data model decision — metadata as YAML frontmatter
Category / tags / relationships live as **YAML frontmatter** at the top of each
`.md` file, body unchanged below. Keeps everything in one local file, human-
readable, diff-friendly, and consistent with "`.md` is truth." Parser must be
back-compatible: a file with no frontmatter loads with defaults and only gains a
frontmatter block once metadata is set. Category enum v1: `Notes & Lessons`,
`In my mind`, `Execution`.

## Chrome restructure rationale
- "Pensieve" label and inline theme button are chrome-for-its-own-sake (design.md
  "every element must earn its place") → removed.
- Theme belongs to the OS-level **native menu** on macOS (standard place for
  appearance), freeing the header.
- A **⋯ menu** is the extension point for future per-note actions; Timeline is its
  first inhabitant so the right edge isn't a standing panel.
- Meta sidebar is **opt-in** (icon-toggled) so the default view stays distraction-
  free writing.

## Pivot — "own the Markdown standard" (owner idea, 2026-10-04)
Reframe: Markdown is only "lossy" relative to a library's *built-in* converter. If
**we define our own extended-Markdown standard** (e.g. `==text==` → highlight) and
wrap the editor so it **always serialises to our `.md` on change and parses from
our `.md` on load**, then `.md` stays the source of truth and "lossy" shrinks to
"things we chose not to encode." This makes BlockNote viable *without* surrendering
the `.md` truth — if the round-trip is reliably idempotent and custom syntax can be
bridged. P2 spike must prove exactly that.

Spike lives in `./spike/` (throwaway). Questions it must answer:
1. Does BlockNote autoconvert blocks→`.md` and autoload `.md`→blocks **idempotently**
   for the core block set? (md → blocks → md must stabilise.)
2. What does its built-in converter silently drop (the "lossy" surface we'd have to
   cover with our own standard)?
3. Can a custom convention like `==highlight==` be bridged reliably, and at what cost
   (string-level transform vs. custom BlockNote inline content + serialiser)?
Compare the effort against doing the same on our existing TipTap + `tiptap-markdown`
(where per-mark markdown (de)serialisation is a first-class hook).

## P2 spike findings (VERIFIED, BlockNote 0.55, 2026-10-04)
Spike in `./spike/` (BlockNote + Mantine). Logic verified headlessly with the
official `ServerBlockNoteEditor` (`./spike/check.mjs`, `./spike/edge.mjs`) — same
converter API as the browser, so results hold for the real editor.

**Result: the owner's "own-the-.md-standard" idea works, and BlockNote is viable as
a `.md`-truth editor.**
- **Idempotent round-trip.** For the full v1 block set (headings, para, bold/italic/
  code, links, bullet/ordered/nested/3-deep lists, todos, quote, code block) and
  edge cases (bare URL, md link, bold-in-list), `md → blocks → md` **stabilises
  after one pass and stays identical** (md1 === md2 in every case). The autolink
  round-trip bug (#3114) does **not** reproduce in 0.55.
- **One caveat — dialect normalisation, not data loss.** BlockNote rewrites to its
  canonical style: `-` bullets → `*`, and a blank line after headings. So the first
  save reformats a hand-authored `.md` once; afterwards it's stable. If we want to
  keep `-`/exact spacing (nicer git diffs, tool compat) we add a thin deterministic
  normaliser on write. Low risk.
- **Custom standard bridges losslessly.** `==text==` ⇄ red highlight, implemented at
  the *block* level around BlockNote's converter (`./spike/src/extended.ts`),
  decodes to a styled run, survives round-trip, and the `==…==` is preserved in the
  `.md`. This is the template for every convention markdown can't natively express
  (colours, callouts, etc.) — exactly the owner's proposal.

**Implication for the decision:** BlockNote's documented "lossy" warning is about
features *beyond* standard markdown; for our block set the round-trip is clean, and
anything extra is covered by our own standard layer. BlockNote now a real contender
*without* giving up `.md`-as-truth — it buys drag handle + slash menu + block
selection + formatting toolbar out of the box. Remaining trade-offs to weigh before
P3: bundle weight (pulls Mantine + a yjs/collab stack as transitive deps), the
MPL-2.0 core vs. paid "XL" add-ons, and that we'd re-skin it to match design.md.

Open counter-option still on the table: same custom-standard layer on our existing
TipTap + `tiptap-markdown` (lighter, we already own it, but we build the drag/slash
UI ourselves from open-source extensions). Decide in the P2 wrap with the owner.

### Running the spike
`cd "updates/2026-10-04 NOTION-UX - OPEN/spike" && npm run dev` → http://localhost:5178
(installed with `--legacy-peer-deps`; needs `@mantine/core`+`@mantine/hooks` and, for
the headless checks, the yjs trio — all already added). Headless: `npx tsx check.mjs`.
NOTE: the in-session Chrome extension could not render localhost here (server was
healthy on curl) — a local Chrome permission/port issue, not a spike bug.

## Lessons (append as we learn)
- Verify editor round-trip claims with `@blocknote/server-util` headlessly — far
  faster and more reproducible than driving the browser, and no DOM needed.
