// captureWatch.ts — notices when the OS takes the microphone away mid-recording.
//
// Why: on iOS a phone call (or Siri, an alarm, another app grabbing audio) interrupts the
// page's audio session. The AudioContext leaves "running" ("interrupted" on WebKit, "suspended"
// elsewhere), the mic track goes muted, and the ScriptProcessor simply stops delivering
// samples — no error is raised anywhere. Left unwatched, the recorder's clock kept ticking over
// a take that was capturing nothing, and the session never recovered after the call. Any one
// of these signals means "capture is gone"; the stall check catches WebKit builds that fire
// none of the events at all.

export type CaptureLossReason = "context-interrupted" | "track-muted" | "track-ended" | "stalled";

export interface CaptureWatchTarget {
  ctx: Pick<AudioContext, "state" | "addEventListener" | "removeEventListener">;
  track?: Pick<MediaStreamTrack, "addEventListener" | "removeEventListener">;
}

export interface CaptureWatchOptions {
  /** When the last audio callback arrived (same clock as `now`). */
  lastTickAt: () => number;
  now: () => number;
  /** No callback for this long while recording = the capture has stalled. */
  stallMs?: number;
  /** Repeat `fn` every `ms`; returns a canceller. Injected so tests drive time by hand. */
  every?: (fn: () => void, ms: number) => () => void;
  /** Only judge staleness while this is true (paused takes legitimately get no samples). */
  isCapturing: () => boolean;
}

const DEFAULT_STALL_MS = 3000;
const STALL_CHECK_MS = 1000;

const defaultEvery = (fn: () => void, ms: number) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

/** Calls `onLost` at most once, with the reason and the moment capture was last known good.
 *  Returns a stop function that removes every listener and timer. */
export function watchCapture(target: CaptureWatchTarget, onLost: (reason: CaptureLossReason, lastGoodAt: number) => void, opts: CaptureWatchOptions): () => void {
  const stallMs = opts.stallMs ?? DEFAULT_STALL_MS;
  let fired = false;
  const lose = (reason: CaptureLossReason, at: number) => {
    if (fired) return;
    fired = true;
    stop();
    onLost(reason, at);
  };

  const onState = () => {
    if (target.ctx.state !== "running" && target.ctx.state !== "closed" && opts.isCapturing()) lose("context-interrupted", opts.now());
  };
  const onMute = () => opts.isCapturing() && lose("track-muted", opts.now());
  const onEnded = () => lose("track-ended", opts.now());
  const checkStall = () => {
    if (!opts.isCapturing()) return;
    const last = opts.lastTickAt();
    if (opts.now() - last > stallMs) lose("stalled", last);
  };

  target.ctx.addEventListener("statechange", onState);
  target.track?.addEventListener("mute", onMute);
  target.track?.addEventListener("ended", onEnded);
  const cancelTimer = (opts.every ?? defaultEvery)(checkStall, STALL_CHECK_MS);

  function stop() {
    target.ctx.removeEventListener("statechange", onState);
    target.track?.removeEventListener("mute", onMute);
    target.track?.removeEventListener("ended", onEnded);
    cancelTimer();
  }
  return stop;
}
