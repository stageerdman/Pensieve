// The shared playback engine. One HTMLAudioElement per KEY, kept in a module-level
// registry so that:
//   • the several faces of ONE recording (an inline bar + its docked player in a transcript
//     view + its dropdown reader) share ONE playhead — two faces, one controller;
//   • starting ANY recording pauses every other one on the page (one-plays-at-a-time).
// The registry is keyed by a caller-supplied KEY (the owning block's id), NOT by the raw
// url — otherwise two SEPARATE audio blocks that happen to reference the same file (e.g. a
// duplicated block) would collide onto one playhead and scrub each other. `src` is just the
// loadable url handed to the <audio> element.
// Framework-free (plain events) so React, and later the phone app, just subscribe.

export type AudioEvent = "time" | "play" | "pause" | "seek" | "ended" | "durationchange";

export interface AudioController {
  readonly src: string;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Seek to an absolute time in seconds (clamped to [0, duration]). */
  seek(sec: number): void;
  /** Seek to a fraction 0..1 of the duration. */
  seekFrac(frac: number): void;
  readonly currentTime: number;
  readonly duration: number; // NaN until metadata loads
  readonly playing: boolean;
  /** Subscribe to an event; returns an unsubscribe fn. */
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

/** Pause every controller except `keep` — enforces one-plays-at-a-time across the page. */
function pauseOthers(keep: Impl) {
  for (const c of registry.values()) {
    if (c !== keep && !c._el.paused) c._el.pause();
  }
}

function create(src: string): Impl {
  // `src` here is the loadable url (what the element plays / what `.src` reports); the
  // registry key under which this controller is stored is a separate caller concern.
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
  return c;
}

/** Get (or create) the shared controller stored under `key`, playing `src`. All the faces
 *  of one recording pass the SAME key (the owning block's id) so they share a playhead;
 *  distinct blocks pass distinct keys so they stay independent even on the same file.
 *  `src` defaults to `key` for simple single-face callers/tests. Ref-counted via `release`. */
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

/** Pause whatever is currently playing (used when leaving a surface, closing a view, etc.). */
export function pauseAll(): void {
  for (const c of registry.values()) if (!c._el.paused) c._el.pause();
}
