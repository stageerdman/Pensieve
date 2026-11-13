# Update v1 — TAGS (what a tag is, and how AI tags well)

Status: **BUILDING on `update/tags`** — owner decided 2026-11-13 (see Decisions). Live status at the bottom.

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

## Decisions (owner, 2026-11-13)
- **Meaning locked:** a tag is a thread (promise to retrieve). Name stays "tag". Recorded in
  UX.md "Tags are threads — DECIDED" + auto-memory `tags-are-threads`.
- **One kind** (Concept A). No lenses.
- **Owner tags by default**, on the flask row beside category.
- **AI tags only when asked** (e.g. "check my last entries, take the untagged ones, tag
  them") — never automatically during journal processing.
- **Seed the vocabulary from Notion:** analyse the Notion `Dags`, keep only the real
  threads, add them to `tags.json`.

## Phased roadmap
- [x] **P1 — Vocabulary.** `src/lib/tags/vocab.ts` (pure: tagKey/cleanTag/canonicalTag,
      buildSuggestions ranked by use, whisper) + `store.ts` (`<vault>/tags.json`) +
      `hooks/useTagVocab`. Typing a case-variant reuses the existing spelling; a new name is an
      explicit "＋ New tag" row and joins the vocabulary. Whisper shows threads + their
      definition on focus; ↑/↓/Enter.
- [x] **P2 — Tags beside the flask.** `TagEditor variant="inline"` on the flask row after
      category; Tags + Category removed from Details (one home).
- [x] **P3 — AI tags on request.** MCP: `list_tags` → vocabulary with definitions + use
      counts; `list_recent untagged_only`; `add_tag` enabled — reuses spelling, refuses an
      unknown tag unless `create: true` (owner consent), created tags join `tags.json`. Rules
      in the tool description + `TAGGING_GUIDE` in agent prompts; saved Patronus/Curator
      prompts migrated (old "writing tools aren't enabled" sentences rewritten on load).
      After every agent reply the app re-reads notes + vocabulary and folds tags the open
      note gained on disk into the editor (union, so autosave can't drop them).
- [ ] **P4 — Seed threads from Notion.** Analyse `Dags` → thread vocabulary with
      definitions → write to the real vault's `tags.json` (backup first).
- [ ] **P5 — Ship.** Merge to main, `tauri:build`, owner tries it.
- Later (not this update): thread view + "ask the coach about this thread"; gardening
  pass (merge/rename/retire); phone tags; definition editing UI; Notion import maps `Dags`
  → these threads (NOTION-IMPORT P5).

## Known limits
- If the owner is typing in a note at the exact moment the AI tags *that same* note, the
  editor's autosave can write the old tag list over the AI's before the reply ends.
  Rare; the AI reports what it tagged, so it's visible.
- `tags.json` is desktop-local like `categories.json` (not synced to the phone, which has
  no tag UI yet).
