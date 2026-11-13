# Wiki — TAGS

## Research (2026-11-13, research agent)
- Tools split structure into **type** (what it is), **property** (a value), **link/page**
  (a hub), **tag** (cross-cutting retrieval). Pensieve's categories already = type.
- Logseq/Roam: tag = page with backlinks → closest to "@CANI pulls up the thread".
- Tana supertags = type + schema (more than we need). Mem dropped manual tags for AI
  clustering; users found it untrustworthy.
- Info-science: free tagging drifts into synonyms (Golder & Huberman 2006) → needs gardening
  (merge, preferred term, aliases). Ahrens: tag by "when will I want to stumble on this?",
  not "what is it about?". Matuschak: tags are low-signal; prefer curated indexes/links.
- LLM tagging best practice: closed vocabulary with definitions + few examples; max 1 new
  proposal with reason; embedding/near-dup dedupe to canonical; confidence thresholds;
  human accept/reject; periodic gardening for drift. Reject tags whose words already appear
  in the text (search covers them).
- Better homes than tags: rituals → templates/forms; open loops → status; people → mentions;
  life chapters → date ranges; mood → one small scale property.

## Design (2026-11-13, UX agent)
- Concept A "Threads" (one kind, `@Name`, small vocabulary 20–40, archive not delete) —
  recommended. Concept B "Threads + Lenses" kept as fallback if non-thread tags keep wanting
  to exist after a month of use.
- The search-redundancy test is the mechanism that makes "don't repeat what search finds"
  enforceable rather than a prompt hope.

## Audit (2026-11-13) — see update v1.md "Facts".
