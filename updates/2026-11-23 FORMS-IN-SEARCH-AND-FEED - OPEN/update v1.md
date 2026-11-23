# FORMS-IN-SEARCH-AND-FEED — update v1

Feature: f-forms-in-search-and-feed — "Forms Improvement: Search, Feed, Categories".

## Goal
1. **Find forms in Accio.** Typing "Form" (or "fo…", "forms") offers a selectable **Form**
   suggestion; picking it stacks a chip that keeps only form templates.
2. **Forms look a little different** in the feed/gallery (a soft glow or similar) so a form
   template is recognisable at a glance.
3. **A memory made from a form keeps its labels.** Starting a memory from a form (desktop
   "start from form", and a phone walk-through resolved on the desktop) carries the form's
   **categories and tags** onto the new memory.

Must not hurt the fast relevance ranking just shipped (FAST-RELEVANT-SEARCH): the Form
suggestion never consumes the typed text, so the word "form" still ranks as free text.

## Impact research
- "Duplicating a form" = making a memory from a form template. Two paths do it:
  `useNotes.startFromForm` (desktop) and `memoryFromPackage` (a phone form package resolved by
  the desktop Process queue, `useProcessQueue.runPackageItem`). Both drop the template's
  categories/tags today. The phone never writes the final memory, so the phone needs no change.
- A form template is just frontmatter `form: true` in `NoteMeta.extra` (lib/forms/meta.ts) —
  already in the fast list, so a Form filter needs no body read and no index change.
- Search suggestions: `lib/search/grammar.ts`. Claims (dates, flags, exact categories) remove
  text from the live query; **completions do not** — the Form suggestion is a completion so
  the ranked text query is unchanged.

## P1 — A memory from a form inherits its categories and tags (backend)
- `lib/forms/inherit.ts`: `inheritLabels(note, template)` — pure; returns the note with the
  union of its own and the template's categories and tags (order kept, case-insensitive tag
  de-dupe). Shared by both paths.
- `useNotes.startFromForm` and `useProcessQueue.runPackageItem` apply it.
- Tests: union + de-dupe + order; a template with no labels leaves the note alone; the package
  path keeps `fromForm` and gains the template's labels.

## P2 — Form filter in search (backend)
- `Filter` gains `{ kind: "form" }`; `SearchableNote.form` from `isFormTemplate(extra)`;
  `matchFilter`, `filterLabel` ("Form") handle it.
- `grammar.completionsFor`: a prefix of "form"/"forms" (≥ 2 chars, exact word included) offers
  a `hint: "type"` suggestion labelled "Form", with a source span (confirm splices just that
  word out), never a claim.
- Tests: "fo", "form", "Forms", "daily form" offer it; it does not change `parse.text`;
  `runSearch` with the chip keeps only templates; chip + text still ranks; the ranking suite
  and benchmark stay green.

## P3 — UI (Jony)
- The Form suggestion row and Form chip in Summon (hint `"type"`), and the FilterEditPopover
  line for it.
- Forms glow (or similar) in the gallery/feed cards — `isFormTemplate(note.extra)`.
- Tests: Summon shows the Form row for "form" and filters to forms; a form card carries its
  form treatment.

## P4 — Verify + ship
`npm test`, `npx tsc --noEmit`, `npm run bench`; real-vault check (type "form", pick it, see
only forms; start a memory from a categorised form and see the categories). Rebuild the Mac
app (`npm run tauri:build`); `deploy:phone` only if `phone/` changed.

## Live status
- [x] Roadmap
- [ ] P1 labels inherited
- [ ] P2 Form filter in search
- [ ] P3 UI (Jony)
- [ ] P4 verify + ship
