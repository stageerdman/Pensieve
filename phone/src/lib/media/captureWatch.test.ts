import { describe, expect, it, vi } from "vitest";
import { watchCapture } from "./captureWatch";

function setup(capturing = true) {
  const ctx = Object.assign(new EventTarget(), { state: "running" as AudioContextState });
  const track = new EventTarget();
  let t = 0;
  let lastTick = 0;
  let tick: () => void = () => {};
  const cancel = vi.fn();
  const onLost = vi.fn();
  const stop = watchCapture({ ctx, track }, onLost, {
    lastTickAt: () => lastTick,
    now: () => t,
    isCapturing: () => capturing,
    every: (fn) => ((tick = fn), cancel),
  });
  return {
    ctx,
    track,
    onLost,
    stop,
    cancel,
    advance: (ms: number, withAudio: boolean) => {
      t += ms;
      if (withAudio) lastTick = t;
      tick();
    },
    setState: (s: string) => {
      ctx.state = s as AudioContextState;
      ctx.dispatchEvent(new Event("statechange"));
    },
  };
}

describe("watchCapture — noticing a phone call took the mic", () => {
  it("fires when the audio context is interrupted (WebKit's state during a call)", () => {
    const w = setup();
    w.setState("interrupted");
    expect(w.onLost).toHaveBeenCalledWith("context-interrupted", 0);
  });

  it("fires when the mic track is muted", () => {
    const w = setup();
    w.track.dispatchEvent(new Event("mute"));
    expect(w.onLost).toHaveBeenCalledWith("track-muted", 0);
  });

  it("fires when audio callbacks stop arriving, reporting the last good moment", () => {
    const w = setup();
    w.advance(1000, true);
    w.advance(1000, false);
    w.advance(1000, false);
    expect(w.onLost).not.toHaveBeenCalled();
    w.advance(1500, false);
    expect(w.onLost).toHaveBeenCalledWith("stalled", 1000);
  });

  it("fires once, then removes its listeners and timer", () => {
    const w = setup();
    w.setState("interrupted");
    w.track.dispatchEvent(new Event("ended"));
    expect(w.onLost).toHaveBeenCalledTimes(1);
    expect(w.cancel).toHaveBeenCalled();
  });

  it("ignores silence and suspension while the take is paused, and a context that closes", () => {
    const w = setup(false);
    w.setState("suspended");
    w.track.dispatchEvent(new Event("mute"));
    w.advance(60_000, false);
    expect(w.onLost).not.toHaveBeenCalled();
    const live = setup();
    live.setState("closed");
    expect(live.onLost).not.toHaveBeenCalled();
  });
});
