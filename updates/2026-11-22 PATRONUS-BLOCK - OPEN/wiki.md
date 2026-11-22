# PATRONUS-BLOCK — wiki (durable decisions & lessons)

## Decisions
- **Generalise the package loop; don't build a new one.** `lib/packages/protocol.ts` and
  `run.ts` already do "Patronus decides, the app executes" with an action allowlist and
  injected deps. Note spells add actions (`add_text`, `rewrite_text`, `remove_media`).
  They do not add a new architecture.
- **No `state:` line = inert.** Form templates' Patronus blocks have no state line. Only
  an explicit `state: pending` block in a casual memory ever runs. This is the guarantee
  behind "a memory without a block behaves exactly as now".
- **The block is the truth. The `patronus: pending` frontmatter key is only an index
  hint**, so the Mac's scan costs nothing for memories without one (FAST-LOAD).
- **One write per run.** "Running" is never written to the memory, so there is one sync
  and one conflict window.
- **Never merge AI output into text the owner changed.** Pull, compare hashes, then write
  or discard (and re-run on the next sync).
- **"Remove media" = unlink.** Media bytes are never deleted anywhere today (sync never
  deletes them, and `removeMedia` is explicit-only). Undo is a Timeline restore
  (`before-patronus`). Real byte deletion is out of scope.

## Gotchas found while researching
- `parsePatronus` treats everything after the `spell:` line as the instruction. Without
  Phase 1, new header lines would show up in the desktop block's text box and be
  re-saved as part of the instruction.
- `asSpell` maps an unknown spell id to `sync`, so a new spell id would silently become
  `sync` on older builds. That is a reason to keep `spell: sync` and add `state:` instead
  of inventing a spell id.
- The Process queue pauses on **any** row error today. For the new row kind only, a
  failure must not pause the queue, or one bad instruction would hold up transcriptions.
- A memory's `.md` can arrive before its recording. Reuse `mediaReadyFilter`-style waiting
  for both content media and the `voice:` command recording.
- Timelines are Mac-only (not synced), so phone Undo has to be a request (`state: undo`)
  that the Mac carries out.
