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
  on(ev: AudioEvent, cb: () => void): () => void;
}

interface Impl extends AudioController {
  _el: HTMLAudioElement;
  _subs: Map<AudioEvent, Set<() => void>>;
  _refs: number;
}

const registry = new Map<string, Impl>();

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
    play() {
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
  el.addEventListener("error", () => emit(c, "error"));

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
  if (!c) registry.set(key, (c = create(src)));
  c._refs++;
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
