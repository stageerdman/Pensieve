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

## Notion Dags analysis (2026-11-13)
- Notion MCP was slow: grouped SQL queries all errored, workspace hit the Query Data Source
  allowance (~25 calls/hour on this plan). Counts are a SAMPLE of 406/~1,990 entries
  (mid-2024→Jan 2025 + Sep–Nov 2026); the option list (1,008, not ~700) came from the
  2026-10-28 survey fetch. For exact counts later: plain paged `SELECT "Dags", createdTime
  … LIMIT 100 OFFSET n` after the allowance resets.
- Of 1,008 options only ~3% are threads; ~75% are plain topics search already covers —
  confirms the "tags are threads" decision.
- Merges worth remembering (apply in NOTION-IMPORT): @Mindset Capture/@Mindset Resolution/
  "sales mindset" → @Sales Mindset; @sales_training_protocol/@sales_repport/"objection
  handling" → @Sales Training; fashtag/FashTek/FashTac/Fashion Tech → @Fashtag; 8 "…patterns"
  → @Patterns; #question → @Open Questions; "Breaking Pattern" → @Pattern Break; emoji
  stripped (@🟣CANI → @CANI).
- Definitions are AI-inferred from names + a few entries — owner may want to reword.
