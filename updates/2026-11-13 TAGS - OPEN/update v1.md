# Update v1 — TAGS (what a tag is, and how AI tags well)

Status: **PROPOSAL — awaiting owner decisions (see "Open decisions").** Nothing built yet.

## Goal
Redefine tags around how the owner actually uses them — **fast filtering / pulling a thread
later**, not describing a note — and make AI tagging safe: it reuses the vocabulary
("whispering"), never invents near-duplicates, and never adds tags that basic search already
finds.

## The definition (proposed)
**A tag is a promise to retrieve.** It names a thread you will deliberately pull later —
a project (`@CANI` → daily actions, weekly review), a practice (`@Success Bag`), or a focus
you want to study one day (`@Sales Mindset`, `@Mindset Review`). Test for every tag:
*"Can I picture the day I'll search for this?"* If not, it isn't a tag.

What is explicitly **not** a tag (already has a better home):
- What kind of note → **category** (Journal / Execution / Idea).
- Important / current → **starred** / **pinned**.
- Words that appear in the text, dates, weeks → **search** (Accio: text + time lens).
- "Related to that note" / people → **links**.
- Status (raw → done), mood scale, life chapter → later as properties, not tags.

## The smart part: tags become threads you can open
A tag is the handle; the payoff is what pulling it gives you. Opening a thread (`#@Sales Mindset`
in Accio, or clicking a chip) shows all its notes in time order — and on desktop, the coach can
read the whole thread: "what have I learned about sales mindset across 40 entries?" That turns
"one day I want to focus on sales mindset" into a one-click session. (Matches UX.md's
"topical shelves".)

## How AI tags (desktop only)
1. **Vocabulary with meaning.** Each tag gets an optional one-line definition ("what belongs
   here") in a `tags.json` (like `categories.json`). The definition is what lets AI pick the
   right existing tag instead of guessing from the name.
2. **Reuse first (whispering).** AI picks only from the vocabulary.
3. **Search-redundancy test.** Before proposing, the tag's words are run as a plain search; if
   search already finds this note + the tag's notes, the tag adds nothing → dropped.
4. **New tags are rare.** At most 1 new proposal per note, only when ≥3 notes share a thread
   search can't find, with the reason and those notes shown. Near-duplicates (case, plural,
   word order, similar meaning) map to the existing tag instead.
5. **Owner approves.** Proposals appear as ghost chips with a one-line "why" (accept / dismiss);
   batched in the processing drawer during journal processing.
6. **Gardening pass.** Occasionally AI proposes merges, renames and retiring stale tags.

## Facts this rests on (audit 2026-11-13)
- Tags are a flat string list in frontmatter (`tags: [a, b]`) + `.meta.json` mirror; three
  parsers (desktop TS, phone TS, Rust MCP).
- Real use is near zero: 5 of 85 notes, 6 tags, each used once. Clean slate.
- No AI writes tags today; Patronus has `add_tag` etc. built but disabled.
- Accio already supports `#tag` filters; whisper is A–Z unranked, no rename/merge.
- Phone can't see or add tags at all.
- `@` in the editor already means "link a note" — tags stay in chips, so no real clash, but
  worth knowing.
- Notion: ~700 sprawling `Dags` to be imported later.

## Phased roadmap (after decisions)
- [ ] **P1 — Vocabulary.** `tags.json` (name, optional definition, archived); whisper ranked
      by recent use; case-insensitive dedupe on add; rename + merge (rewrites notes).
- [ ] **P2 — Tags beside the flask.** Tag chips on the same row as category above the editor
      (like category, no Details trip).
- [ ] **P3 — Thread view.** Clicking a tag opens its thread (filtered gallery, time order);
      desktop "Ask the coach about this thread".
- [ ] **P4 — AI tagger.** Ghost-chip proposals following the rules above; on journal
      processing + on demand. Enable Patronus `add_tag`.
- [ ] **P5 — Gardening pass.** Merge / rename / retire proposals.
- [ ] **P6 — Phone.** See + add tags (no AI); filter by tag in Accio.
- [ ] **P7 — Notion tags.** AI clusters ~700 Dags into ~30 threads on one review screen;
      dropped ones kept hidden (`notionTags`) so search still finds them. Feeds NOTION-IMPORT P5.

## Open decisions (owner)
1. **One kind or two?** A: every tag is a thread (recommended). B: threads + "lenses" for
   states like `Emotional Low` that AI may create more freely (risk: Notion-style sprawl).
2. **AI applies or proposes?** Recommended: always proposes (ghost chips) at first.
3. **Tags next to category above the editor?** Recommended: yes.
