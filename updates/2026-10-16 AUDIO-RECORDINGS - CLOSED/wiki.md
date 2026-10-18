# AUDIO-RECORDINGS — wiki (durable decisions & findings)

## The transcript JSON schema (LOCKED — the target for the future transcription step)
Sidecar file, **not** in the `.md`. Path: `media/<noteId>/<mediaId>.<ext>.transcript.json`
(same dir + stem as the audio; keep `.ext` so `a.mp3`/`a.wav` don't collide). Loaded when the
audio ref is resolved; absence = "no transcript yet" (bar shows a dim transcript icon + a
"Create transcript" action).

```jsonc
{
  "version": 1,
  "media": "audio.mp3",              // the media ref/stem this belongs to (sanity check)
  "meta": {
    "model": "czech-large-v3-mlx",   // transcription model id
    "language": "cs",
    "transcribedAt": "2026-10-15T10:43:42",
    "durationSec": 1143.85,
    "speakers": ["Klient", "Obchodník"],  // [] if no diarization
    "diarization": "multitrack",     // "multitrack" | "mono" | null
    "polished": true                 // AI-cleaned vs raw
  },
  "segments": [
    {
      "id": 0,
      "speaker": "Klient",           // null if undiarized
      "start": 0.0,                  // seconds
      "end": 2.0,
      "text": "A na divadlo.",
      "words": [                     // word-level timings drive word-by-word highlight
        { "w": "A",   "s": 0.0, "e": 0.67 },
        { "w": "na",  "s": 0.67, "e": 1.33 },
        { "w": "divadlo.", "s": 1.33, "e": 2.0 }
      ]
    }
    // ...
  ]
}
```
- **Rendering** uses `segments` (speaker grouping + utterance timestamps) and `words` (the
  highlight as audio plays; click a word → `seek(word.s)`).
- **Search** uses only concatenated `segments[].text` — folded into the note's `bodies()` doc.
- **Why both levels:** the owner's real export is utterance-level (`**Speaker** [mm:ss]`);
  whisper can emit true word stamps. We interpolate words inside an utterance until it does —
  same shape either way, so nothing changes when real word stamps arrive.
- The human-readable `.md` transcript (speaker + `[mm:ss]` blocks) is the **download/export**
  form, not the runtime form.

## Grounded codebase facts (with cites) — from P0 recon
### Editor / media blocks
- Custom blocks: `createReactBlockSpec(config, impl)()` — MUST be **called** at registration
  (`src/components/editor/media/ImageBlock.tsx:411`, gotcha in MEDIA-IMAGES wiki). Registered
  in `src/components/editor/editorSchema.ts:12` (`image`, `imageGroup`). Props must be
  primitives; lists stored as JSON strings. `content:"none"` = void/atom block.
- Shared visual base: `src/components/editor/media/MediaBlock.tsx` — states
  `empty|loading|saving|loaded|broken`; interaction lives in the composing block.
- Markdown bridge: `src/lib/md/extended.ts` orchestrates; `image.ts` / `gallery.ts` do the
  fence encode/decode (`pensieve:image`, `pensieve:gallery`). Ref→url resolved **inside**
  `extendedMdToBlocks` before mount (avoids false dirty/undo). → add `lib/md/audio.ts`,
  `pensieve:audio`, wire into `encodeStructure`/`reconstructStructure`.
- Slash menu: `Editor.tsx` disables BlockNote's own (`slashMenu={false}`), filters out default
  image/video/**audio**/file (`MEDIA_KEYS`), appends custom items. → add an "Audio" item.
- Resize handles MUST use **native mousedown/touchstart + preventDefault** (not React
  synthetic) or ProseMirror hijacks the drag (`src/components/editor/media/mediaResize.ts`).

### Reference + storage (pre-seamed for audio)
- `MediaRef` (`src/lib/media/ref.ts:12`): `{ mediaId, kind:"image", caption?, width?, timecode? }`
  — `kind`/`timecode` reserved for audio/video + in-clip points. Canonical ref
  `media/<noteId>/<mediaId>.<ext>` (`mediaRef`). `extractMediaRefs` feeds sync — matches any
  `media/<id>/<id>.<ext>`, so audio bytes sync for free.
- `Store` media methods (`src/lib/types.ts:108`) are ext-generic: `saveMedia(noteId,bytes,ext)`,
  `loadMediaUrl(ref)`. Only new need: audio MIME→ext entries in
  `insertImage.ts` `MIME_EXT` (`audio/mpeg`→mp3, `audio/mp4`→m4a, `audio/webm`, `audio/wav`).
- Tauri: `write_bytes`/`read_bytes`/`read_text`/`write_text`/`list_dir`/`remove_path` over
  vault-relative paths (`src-tauri/src/lib.rs`). Asset-protocol scope `$APPDATA/vault/media/**`
  already covers audio playback. **No whisper/transcription command exists** (out of scope).
- `read_bytes` exists in Rust but has **no JS wrapper** yet in `tauri.ts` (add if needed).

### Search / index
- **No SQLite anywhere** — in-memory inverted index `MemoryIndex` (`src/lib/search/indexer.ts`)
  fed by `Store.bodies()` via `src/hooks/useSearchIndex.ts` (lazy, incremental on note change).
  `runSearch` (`search.ts`) matches terms vs title/tags/body; ranks title>tag>body>structural.
- **To make transcripts searchable:** extend `bodies()` in BOTH `store/tauri.ts:103` and
  `store/browser.ts:71` to append referenced-transcript text to each `NoteBody.text`, and
  mirror in `useSearchIndex.ts:58`. Snippets then include transcript text for free. (If corpus
  ever gets huge, documented swap is SQLite FTS5 behind the same interface — deferred.)

### Desktop shell / surfaces
- One layout file `src/App.tsx`. Body flex-row at `App.tsx:291` is the split axis: editor
  `section flex-1` (centered `max-w-[72ch]`) + optional right dock `RightPanel` (fixed
  `w-72`, Timeline **or** Details, mutually exclusive). **No resizable 50/50 split exists.**
- Tabs = open-note ids over ONE shared editor showing `current` (`useTabs.ts`,
  `TabBar.tsx`); `HOME` sentinel = the Gallery. Session-only.
- Home = `features/gallery/Gallery.tsx`; notes = `FlaskCard` (glyph+title+excerpt+tags only,
  **no media thumbnail**). Hover peek = `PreviewPortal` (z-40) renders full note via
  `NotePreview` using the **same `editorSchema`** → a new audio block renders there for free.
- Image lightbox = `components/media/lightboxController.ts` (module pub/sub, callable from
  blocks) + `ImageLightbox.tsx` mounted once at `App.tsx:399` (z-30, FLIP, Esc/arrows). The
  **model** for opening the transcript Split View from an inline bar.
- **No video** anywhere (planned after audio). "Timeline" = version history, not media.
- `design.md` already names `MediaBlock` ✅(built) and `TranscriptView` (unbuilt) as base
  components — the transcript panel has a named home.

## Design constraints the prototypes MUST honor (design.md / UX.md)
- **One accent only** (the magical blue `--accent`). Shadows/gradients are reserved for the
  "magical" language (accent glow, Basin depth, flask glass) — never to "lift" flat UI.
- Token-driven, **full light AND dark** with real AA contrast. Type scale fixed
  (2xs/xs/sm/base/lg); radius scale fixed; 4px spacing. Timestamps use `font-mono`.
- Calm, fast, UI-disappears. Background work (transcribing) = quiet non-blocking status, never
  a blocking spinner.
- Keyboard-first; visible focus; honest specific states (no transcript / transcribing / ready).

## Token values (mirror of src/styles/tokens.css — for the prototype kit)
Light: surface `210 30% 99%` · surface-sunken `214 20% 96%` · surface-raised `214 16% 94%` ·
text `218 16% 19%` · text-muted `218 9% 45%` · border `214 15% 90%` · accent `216 83% 49%` ·
accent-glow `216 90% 60%` · gold `43 92% 55%` · success `150 30% 40%` · danger `0 72% 58%`.
Dark: surface `222 24% 11%` · surface-sunken `222 22% 13%` · surface-raised `222 18% 17%` ·
text `216 18% 84%` · text-muted `218 12% 60%` · border `222 16% 21%` · accent `215 85% 74%` ·
accent-glow `218 100% 72%` · gold `43 92% 55%`.
Font sans = system UI stack; mono = JetBrains Mono / ui-monospace. radius base 6px.

## Test assets (`prototypes/assets/`)
- `audio.mp3` — real 19-min diarized sales call (gitignored, 19MB).
- `transcript.json` — parsed to the locked schema: 206 segments, 2,390 word-timings, speakers
  Klient/Obchodník, spans 0–1102s. Czech. Word timings interpolated within utterances.

## Lessons (append as we learn)
- (P0) Older docs claim SQLite + whisper.cpp binding; neither exists. Trust the code, not the
  prose — search is in-memory, transcription is unbuilt.
- (P1) **Word-sync must be segment-aware, not flat.** A flat word-level binary search assumes
  globally monotonic word start times. With `diarization:"multitrack"` the two speakers' words
  overlap (9/205 segments here, up to 1.5s), so flat search steps backward at seams and
  mis-highlights. Correct model: binary-search the **sorted segment starts**, then the word
  within the segment, mapping (seg,word)→flat offset. Verified 0 backward events over a full
  0.1s sweep. Carry into the real `TranscriptView`.
- (P1) **"One bar everywhere" vs the justified gallery strip.** A bar has no aspect ratio, so
  it can't be a justified image tile. Resolution (prototype 03, Option C): the *tile* is a
  thumbnail per medium (images show a cropped tile, audio shows a waveform card) while the
  *player* stays the one canonical bar, relocated to a dock on open. Don't force a 56px control
  into a 220px row cell.
- (P1) **One-accent forces non-colour signals.** Recording/stop is accent (not red); transcript
  search hits are marked by a ∿ glyph + muted text + timecodes (not a tinted row); speakers are
  weight/tone. Colour stays reserved — state (gold/danger) is signal, never a 2nd accent.
- (P1) **Peek never auto-plays.** On the Basin, hovering is for recognition; audio opens paused
  with a quiet "Space to play". Note the `Space` collision: Basin uses it to pin a peek,
  design-spec gives it to a focused bar — decide a clear two-tier owner before building.

## Prototype kit (P1 deliverables — reuse when building the real components)
- `_kit.css` — tokens (light + `[data-theme="dark"]`/`.dark`) + the full audio component system
  (bar, play, waveform, time, icon buttons + transcript states, ⋯ menu, status line, broken,
  transcript dock/turn/word, split view, theme toggle). The visual source of truth.
- `_audio.js` — `Pensieve.Audio`: `loadAssets`, `fmt`, `controller(src)` (one-plays-at-a-time
  registry), `Waveform(canvas,peaks,opts)` (HiDPI, resamples to fit width), `bindScrub`,
  `sync(transcript)`, `theme`, `icon`. Behaviour source of truth. Missing icons noted: replace,
  trash, recorder-stop (promote to ICONS). No tooltip primitive yet (01 added a page-local one).
- `design-spec.md` — the binding contract (anatomy table, state machine, interaction, token map,
  motion, a11y, transcript + split-view spec). P3+ components must match it.
- `prototypes/index.html` — entry page linking all 7 prototypes + the owner decisions.
- Prototypes run under `file://` via `assets/peaks.js` + `assets/transcript.js` global-wrapper
  fallbacks (Chrome blocks `fetch()` of local JSON; `<audio src>` playback is fine).
