# FAST-LOAD wiki

Decisions and measurements land here.

## Phone

Branch `update/fast-load-phone` (off `update/fast-load`).

### Storage — `phone/src/vaultStore.ts`
- **Layout:** IndexedDB `pensieve-phone-vault` v2 — store `notes` (one record per note, key = id,
  value `{ s: seq, n: Note }`; higher `s` = earlier in the array = newer) + store `kv` (layout
  marker `pensieve.phone.vault.layout = 2`). Hydrated once (`getAll`) into a `Map`; never re-parsed.
- **API:** `loadVault`/`persistVault` keep their whole-array shape for PhoneApp; new per-note
  `getNote`/`putNote`/`removeNote`/`listNoteMeta` for the sync LocalVault (`lib/sync/vault.ts`).
- **Copy-on-read** kept: every read returns fresh deep copies (PhoneApp mutates notes in place).
  Stored records are private + immutable (replaced, never mutated).
- **persistVault diffs** against the objects it last handed out: writes only notes the caller
  changed, deletes only notes the caller *saw* and dropped. Consequence (deliberate): a UI save
  during a sync pull no longer wipes the notes the pull wrote behind its back, nor reverts a note
  the pull updated that the UI didn't touch. (Old semantics were "vault = this array" — a UI save
  mid-pull dropped pulled notes, which the next sync would have pushed as deletions.)
- **Writes coalesced:** dirty ids are flushed in one transaction (setTimeout 0); anything dirtied
  while a write is in flight goes in the next one. An edit = 1 record put, not 7 MB.
- **Migration (one-time, crash-safe):** source priority unchanged — localStorage vault (newest:
  it only survives when a previous boot fell back to it) > old single IDB key > empty. The move is
  ONE readwrite transaction over `kv`+`notes`: clear notes, put every record, write the layout
  marker, delete the old key. Atomic → a crash leaves the old layout intact or the new one
  complete. A throw inside the tx body explicitly `abort()`s (otherwise IDB auto-commits the
  requests queued so far). localStorage is removed only after the tx commits; a crash in between
  just re-migrates from localStorage next boot. Unparseable blobs are parked under
  `pensieve.phone.vault.corrupt`, never deleted. The 4 s hydrate timeout → localStorage fallback
  behaviour is unchanged.

### Feed windowing — `lib/wand/feedWindow.ts` (pure) + `hooks/useFeedWindow.ts` + `Reel.tsx`
- Week 0 = today + the 6 days before; open on all of week 0, topped up with whole older weeks
  until ≥ 24 cards (or a screenful). Next older week loads when the focus is within 1 screen of
  the loaded end. A loaded week ≥ 2 screens from the focus for 3+ min unmounts; it remounts as soon
  as it's within 2 screens again. A 30 s clock also evaluates so idle sections unload.
- Every reel card is the rigid 84 px `.slot`, so an unmounted card is an **empty `.slot`** — exact
  height (no scroll jump) and the fisheye's `track.children[i]` still equals card i (its
  `if (!card) continue` already tolerates empty slots).
- No new scroll container → the document touchmove guard allowlist needs no change.
- The reel is now **newest-first by `createdAt`** (stable). Before, it was vault insertion order,
  which after a sync pull is pull order — week sections need date order.
- Accio: a new query restarts the window at the newest matching week; the search sheet still ranks
  across ALL notes (`rankNotes` over the full vault, top 30).
- Logged as `feed:load-week` / `feed:unmount` / `feed:remount`; vault as `vault:hydrated`
  (notes, ms) / `vault:migrated` / `vault:write-failed`.

### Numbers (bench: `BENCH=1 npx vitest run "updates/2026-11-15 FAST-LOAD - OPEN/bench"`)
2,090 notes × ~3.4 KB (≈7 MB), jsdom + fake-indexeddb on the Mac — a CPU proxy, not iPhone timings.

| | before | after |
|---|---|---|
| boot: hydrate + loadVault | 7–10 ms | 12–31 ms (fake-indexeddb `getAll` of 2,090 records vs one string parse; one-off at boot) |
| first reel render | 1,314 ms (all 2,090 cards) | 24 ms (24 cards) |
| 2,000-note sync pull (store side) | 47,165 ms (O(n²)) | 46 ms |
| one edit after the pull | full 7 MB stringify + IDB rewrite | 3 ms, 1 record |

Lesson: the render, not the parse, dominated boot; and the per-note-call pattern, not the parse
itself, made sync quadratic.
