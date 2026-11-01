// audioController.ts — the shared playback engine (ported near-verbatim from
// src/lib/audio/controller.ts, whose own header already calls this "portable to the phone
// app" — same decouple convention as noteMedia.ts/transcript.ts). One HTMLAudioElement per
// KEY, kept in a module-level registry so that:
//   • the inline bar and the full-screen transcript reader for the SAME recording share one
//     playhead (two faces, one controller);
//   • starting ANY recording pauses every other one on the page (one-plays-at-a-time).
// Keyed by the audio REF (not a synthetic block id, unlike desktop) — two distinct recordings
// can never share a ref, so this is simpler and still gives every recording its own playhead.
// Framework-free (plain events).

export type AudioEvent = "time" | "play" | "pause" | "seek" | "ended" | "durationchange" | "error";

export interface AudioController {
  readonly src: string;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(sec: number): void;
  seekFrac(frac: number): void;
  readonly currentTime: number;
  readonly duration: number; // NaN until metadata loads
  readonly playing: boolean;
  /** Set once the element fires a decode/network `error` — the file is NOT going to play. A
   *  caller should swap to a "can't play" state rather than leave a player silently stuck. */
  readonly errorCode: number | null; // MediaError.code (1-4), see MDN
  readonly errorMessage: string; // MediaError.message — often empty on WebKit, kept anyway
  readonly readyState: number; // HTMLMediaElement.readyState (0-4)
  readonly networkState: number; // HTMLMediaElement.networkState (0-3)
  on(ev: AudioEvent, cb: () => void): () => void;
}

interface Impl extends AudioController {
  _el: HTMLAudioElement;
  _subs: Map<AudioEvent, Set<() => void>>;
  _refs: number;
  _lastUsedAt: number;
}

// iOS WebKit silently fails to load/decode a NEW <audio>/<video> element once a page already
// has too many concurrently "loaded" media elements (an unofficial but widely observed budget,
// commonly ~4-6) — elements that already failed to decode still count against it. Nothing in
// this app ever calls `releaseController` (every caller just lets React/DOM teardown happen),
// so without a cap this registry grows by one permanent <audio> element per distinct recording
// ever viewed in a session — browse a reel full of old recordings, or retry a few failed plays,
// and the budget is gone for the rest of the session; only a full reload (fresh budget) frees
// it. Capping it here, independent of any caller remembering to release, is what makes a
// brand-new recording's OWN controller always get a live slot.
const MAX_LIVE_CONTROLLERS = 5;

const registry = new Map<string, Impl>();

/** Evict the least-recently-touched controller (never one currently playing) to make room for
 *  a new one. No-op under the cap. */
function evictLRUIfFull(): void {
  if (registry.size < MAX_LIVE_CONTROLLERS) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [key, c] of registry) {
    if (!c._el.paused) continue;
    if (c._lastUsedAt < oldestAt) {
      oldestAt = c._lastUsedAt;
      oldestKey = key;
    }
  }
  if (oldestKey === null) return; // everything in the registry is somehow playing — nothing safe to evict
  const c = registry.get(oldestKey)!;
  c._el.pause();
  c._el.removeAttribute("src");
  c._el.load();
  registry.delete(oldestKey);
}

/** DEBUG ONLY (VOICE-PLAYBACK investigation, 2026-11-01) — how many live controllers this
 *  session currently holds, to directly confirm/rule out the registry-cap theory on-device
 *  without needing a remote debugging session. Remove once that investigation is closed. */
export function _debugRegistrySize(): number {
  return registry.size;
}

function emit(c: Impl, ev: AudioEvent) {
  const set = c._subs.get(ev);
  if (set) for (const cb of set) cb();
}

function pauseOthers(keep: Impl) {
  for (const c of registry.values()) {
    if (c !== keep && !c._el.paused) c._el.pause();
  }
}

function create(src: string): Impl {
  const el = new Audio();
  el.preload = "metadata";
  el.src = src;
  const subs = new Map<AudioEvent, Set<() => void>>();
  const c: Impl = {
    src,
    _el: el,
    _subs: subs,
    _refs: 0,
    _lastUsedAt: Date.now(),
    get currentTime() {
      return el.currentTime;
    },
    get duration() {
      return el.duration;
    },
    get playing() {
      return !el.paused;
    },
    get errorCode() {
      return el.error ? el.error.code : null;
    },
    get errorMessage() {
      return el.error?.message ?? "";
    },
    get readyState() {
      return el.readyState;
    },
    get networkState() {
      return el.networkState;
    },
    play() {
      c._lastUsedAt = Date.now();
      pauseOthers(c);
      void el.play().catch(() => {/* autoplay/user-gesture guards — harmless */});
    },
    pause() {
      el.pause();
    },
    toggle() {
      if (el.paused) c.play();
      else el.pause();
    },
    seek(sec: number) {
      const d = el.duration;
      const clamped = Math.max(0, Number.isFinite(d) ? Math.min(sec, d) : sec);
      el.currentTime = clamped;
      emit(c, "seek");
      emit(c, "time");
    },
    seekFrac(frac: number) {
      const d = el.duration;
      if (Number.isFinite(d)) c.seek(frac * d);
    },
    on(ev, cb) {
      let set = subs.get(ev);
      if (!set) subs.set(ev, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
  };
  el.addEventListener("timeupdate", () => emit(c, "time"));
  el.addEventListener("play", () => emit(c, "play"));
  el.addEventListener("pause", () => emit(c, "pause"));
  el.addEventListener("ended", () => emit(c, "ended"));
  el.addEventListener("durationchange", () => emit(c, "durationchange"));
  el.addEventListener("loadedmetadata", () => emit(c, "durationchange"));
  // One silent retry before surfacing an error to subscribers: a fresh recording's playback
  // element can fail its first decode attempt on iOS if the OS audio session hasn't finished
  // swapping from "record" (mic capture) to "playback" yet (see voiceCapture.ts's
  // AUDIO_SESSION_SETTLE_MS) — `el.load()` re-attempts against the same src and normally
  // succeeds once that settles. Without this, that one transient failure was permanent for the
  // rest of the session (this registry caches one controller per ref, never recreated).
  let retriedAfterError = false;
  el.addEventListener("error", () => {
    if (!retriedAfterError) {
      retriedAfterError = true;
      setTimeout(() => el.load(), 300);
      return;
    }
    emit(c, "error");
  });

  // Self-heal a missing duration (MediaRecorder WebM / fragmented mp4 sometimes report
  // Infinity/NaN with no seek index — and a recording ASSEMBLED FROM MULTIPLE CHUNKS, like the
  // phone's chunked voice-recording engine, can report a flat 0 instead, since the container's
  // header only ever described the live/open-ended stream it started as) — seek far past the
  // end once to force the engine to scan + build a seek table, then jump back to the start.
  let healed = false;
  const healDuration = () => {
    if (healed) return;
    const d = el.duration;
    if (d === Infinity || Number.isNaN(d) || d === 0) {
      healed = true;
      const onTick = () => {
        el.removeEventListener("timeupdate", onTick);
        try { el.currentTime = 0; } catch { /* not seekable yet — ignore */ }
        emit(c, "durationchange");
        emit(c, "time");
      };
      el.addEventListener("timeupdate", onTick);
      try { el.currentTime = 1e101; } catch { healed = false; }
    } else {
      healed = true;
    }
  };
  el.addEventListener("loadedmetadata", healDuration);
  el.addEventListener("durationchange", healDuration);
  return c;
}

/** Get (or create) the shared controller stored under `key` (the audio ref), playing `src`
 *  (the resolved blob url). Ref-counted via `release`. */
export function getController(key: string, src: string = key): AudioController {
  let c = registry.get(key);
  if (!c) {
    evictLRUIfFull();
    registry.set(key, (c = create(src)));
  }
  c._refs++;
  c._lastUsedAt = Date.now();
  return c;
}

/** Drop a reference obtained from getController (by the same `key`). When the last holder
 *  releases, the element is paused, torn down, and removed from the registry. */
export function releaseController(key: string): void {
  const c = registry.get(key);
  if (!c) return;
  c._refs--;
  if (c._refs <= 0) {
    c._el.pause();
    c._el.removeAttribute("src");
    c._el.load();
    registry.delete(key);
  }
}

/** Pause whatever is currently playing (used when leaving a note). */
export function pauseAllAudio(): void {
  for (const c of registry.values()) if (!c._el.paused) c._el.pause();
}

/** Format seconds as `m:ss` (or `h:mm:ss` past an hour). NaN/negative → "0:00". */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}
