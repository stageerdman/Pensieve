// The shared playback engine. One HTMLAudioElement per source, kept in a module-level
// registry so that:
//   • several bars pointing at the same recording (e.g. an inline bar + a docked player in
//     a transcript view) share ONE playhead — two faces, one controller;
//   • starting ANY recording pauses every other one on the page (one-plays-at-a-time).
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

/** Get (or create) the shared controller for a source url. Ref-counted via `release`. */
export function getController(src: string): AudioController {
  let c = registry.get(src);
  if (!c) registry.set(src, (c = create(src)));
  c._refs++;
  return c;
}

/** Drop a reference obtained from getController. When the last holder releases, the
 *  element is paused, torn down, and removed from the registry. */
export function releaseController(src: string): void {
  const c = registry.get(src);
  if (!c) return;
  c._refs--;
  if (c._refs <= 0) {
    c._el.pause();
    c._el.removeAttribute("src");
    c._el.load();
    registry.delete(src);
  }
}

/** Pause whatever is currently playing (used when leaving a surface, closing a view, etc.). */
export function pauseAll(): void {
  for (const c of registry.values()) if (!c._el.paused) c._el.pause();
}
