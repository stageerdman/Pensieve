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
## Desktop (P1 + P2) — branch `update/fast-load-desktop`

### Data path decisions
- **One invoke, parallel reads.** `src-tauri/src/vault_bulk.rs`: `list_notes_bulk` (meta +
  `.md` stamp per note, body only on a stamp miss; `withBodies:false` for the sync engine),
  `read_note_bodies` (search index), `read_texts_bulk` (transcript sidecars, raw records),
  `list_media_bulk` (one walk of `media/*/*`). std scoped threads, no rayon. Async commands →
  off the main thread.
- **The derive rules stay in TS; Rust is a dumb reader.** excerpt/chars/frontmatter parsing
  have one definition (`lib/text.ts`, `lib/md/frontmatter.ts`); porting them to Rust would
  create a second one to drift. Rust only decides *which* bodies to ship.
- **Derived-field cache** = `vault/.cache/list-index.json`, owned by `lib/store/listCache.ts`:
  per note `{st:[mtimeµs,size], icon, extra, links, excerpt, chars}`. Keyed by the `.md`
  stamp, so ANY writer (editor save, sync pull, AI tool, hand edit) invalidates it with no
  hooks. Versioned (`LIST_CACHE_VERSION` — **bump it when excerpt/chars/frontmatter rules
  change**), tolerant of missing/corrupt files, pruned of deleted notes, written fire-and-
  forget after the list is returned. Safe to delete (costs one cold listing). Not synced
  (the sync engine only touches notes/raw/media/sync). Kept in memory after first read.
- **No relist on our own changes.** `useNotes` patches the in-memory list for save /
  create / remove / pin / star (`lib/store/noteMeta.ts` — `metaFromNote` is locked equal to a
  fresh `list()` entry by a test). Before: *every 500 ms autosave* re-ran the full listing.
  A full `refresh()` remains only for out-of-band changes (sync pull, AI tag adopt, form fill).
- **Launch opens the most recently updated note** (`newestNote`) — `list()` is unordered, so
  the old `list[0]` was an arbitrary note.
- **Off the first paint** (`lib/idle.ts` `whenIdle`; WKWebView has no requestIdleCallback →
  delay fallback): the Process-queue vault scan (media/raw/forms) waits ~0.8 s; the search
  index is pre-warmed ~1.5 s after notes arrive (two invokes total) so the first Accio
  keystroke is instant. Still builds on the first typed query if that comes sooner.

### Gallery window decisions (P2)
- Window = a **cutoff timestamp**, not a card count — a new memory on top never pushes an
  old one off the bottom. Opening cutoff = local midnight 7 days ago, or further back to fit
  ≥ 24 cards. Each load step = one more week AND ≥ 12 more cards (crosses empty months in one
  step — the Notion history has gaps).
- Invisible loader: a 1 px sentinel after the last section, IntersectionObserver with a
  150 % bottom margin; the observer is recreated after each step so a still-visible sentinel
  (short week) keeps loading. No button, no spinner.
- Unload: every section is observed with a ±200 % margin; one that stays outside for 3 min
  (swept every 20 s) is measured (`getBoundingClientRect`) and rendered as an empty
  `<section style="height:…">` — same element, so the rail row height and scroll position
  hold. Back within range → remounted. A width change (reflow) remounts everything.
- Granularity is the date section (Today / Yesterday / Last week / Last month / month). A
  month is one grid; splitting it would leave ragged rows mid-month.
- Accio: same window over the results (ordered by updatedAt); the lifted "Starred" lead is
  never windowed; a new query resets to the opening window. Search itself still covers
  every note (the index is all bodies).
- No IntersectionObserver → no windowing (render all). jsdom tests therefore keep working;
  `Gallery.window.test.tsx` scripts a fake IO to test the wiring.

### Measurements (vault copy: 2,090 notes, 6.7 MB of `.md`; MacBook, release build)
| path | before | after |
|---|---|---|
| IPC invokes for the note list | **4,181** serial | **1** (+1 to read the cache file, first list only) |
| Rust fs work for the list | serial per-file reads: 72 ms warm OS cache, ~950 ms–1.05 s cold OS cache | bulk parallel: 34–40 ms cold-cache-of-ours (ships all bodies, 7.0 MB payload), **19–24 ms warm** (0.55 MB payload) |
| JS parse/derive for the list | 280–600 ms (serial read + parse every body) | cold (no cache) 64–74 ms · **warm 3 ms** |
| search index bodies | ~2,090 + 1 per media ref serial invokes | 2 invokes |
| media walk (`listMedia`, 155 folders) | 156 serial invokes | 1 invoke, 2–4 ms |
| list after each autosave | full relist | none (in-memory patch) |
- Not measured: per-invoke WKWebView IPC latency in the real app (I must not run the app
  against the live vault — it would write the cache there). At an assumed 0.5–2 ms per
  invoke the old list's 4,181 round-trips alone were ~2–8 s; the new one is one round-trip.
- Parity: `bench-list.ts` checks the new listing equals the old one on every note (ids,
  excerpt, chars, links) and that the warm (cache) result equals the cold one — both true.
- Run: `bench/bench-rust.sh <vault-copy>` and
  `npx tsx "updates/2026-11-15 FAST-LOAD - OPEN/bench/bench-list.ts" <vault-copy>`.

### Lessons
- The biggest hidden cost wasn't the launch list — it was `persist()` calling `refresh()`
  after every debounced save, i.e. a full 4,000-invoke relist while typing.
- `engine.media.test.ts` (large-media sync) can time out at 5 s under full-suite load and
  passes alone — pre-existing flake, unrelated.
