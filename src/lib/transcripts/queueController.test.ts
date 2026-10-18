import { describe, it, expect } from "vitest";
import * as Q from "./queueController";
import type { Job } from "./queueController";

const jobs = (...refs: string[]): Job[] => refs.map(Q.makeJob);
const state = (js: Job[], ref: string) => js.find((j) => j.ref === ref)?.state;

describe("queueController — one-at-a-time with pause/hold/resume", () => {
  it("nextToStart is the first queued job when the slot is free", () => {
    let js = jobs("a", "b", "c");
    expect(Q.nextToStart(js)).toBeNull(); // all idle
    js = Q.enqueue(js, "b", "parakeet");
    js = Q.enqueue(js, "c", "czech-whisper");
    expect(Q.nextToStart(js)).toBe("b"); // first queued in array order
  });

  it("only one job runs — a running (or paused) job occupies the slot", () => {
    let js = jobs("a", "b");
    js = Q.enqueue(js, "a", "parakeet");
    js = Q.enqueue(js, "b", "parakeet");
    js = Q.start(js, "a");
    expect(Q.activeRef(js)).toBe("a");
    expect(Q.nextToStart(js)).toBeNull(); // slot busy → b must wait
    // pausing the active job keeps the slot occupied (nothing else starts)
    js = Q.hold(js, "a");
    expect(state(js, "a")).toBe("paused");
    expect(Q.nextToStart(js)).toBeNull();
    // resume then finish → b becomes eligible
    js = Q.resume(js, "a");
    expect(state(js, "a")).toBe("running");
    js = Q.markDone(js, "a");
    js = Q.removeDone(js);
    expect(Q.nextToStart(js)).toBe("b");
  });

  it("holding a queued job skips it; resume puts it back in line", () => {
    let js = jobs("a", "b");
    js = Q.enqueue(js, "a", "parakeet");
    js = Q.enqueue(js, "b", "parakeet");
    js = Q.hold(js, "a"); // held jobs are skipped
    expect(state(js, "a")).toBe("held");
    expect(Q.nextToStart(js)).toBe("b");
    js = Q.resume(js, "a");
    expect(state(js, "a")).toBe("queued");
  });

  it("progress clamps 0..100 and carries the phase", () => {
    let js = Q.start(Q.enqueue(jobs("a"), "a", "czech-whisper"), "a");
    js = Q.setProgress(js, "a", 142, "polishing");
    expect(js[0].pct).toBe(100);
    expect(js[0].phase).toBe("polishing");
    js = Q.setProgress(js, "a", -5);
    expect(js[0].pct).toBe(0);
  });

  it("error → retry re-queues with the same model", () => {
    let js = Q.start(Q.enqueue(jobs("a"), "a", "parakeet"), "a");
    js = Q.markError(js, "a");
    expect(state(js, "a")).toBe("error");
    js = Q.retry(js, "a");
    expect(state(js, "a")).toBe("queued");
    expect(js[0].model).toBe("parakeet"); // model preserved
    expect(js[0].pct).toBe(0);
  });

  it("enqueueAll queues every idle job under one model, leaving active ones alone", () => {
    let js = jobs("a", "b", "c");
    js = Q.start(Q.enqueue(js, "a", "parakeet"), "a"); // a running
    js = Q.enqueueAll(js, "czech-whisper");
    expect(state(js, "a")).toBe("running"); // untouched
    expect(state(js, "b")).toBe("queued");
    expect(state(js, "c")).toBe("queued");
    expect(js.find((j) => j.ref === "b")?.model).toBe("czech-whisper");
  });

  it("inFlightCount counts the whole pipeline, not idle/done", () => {
    let js = jobs("a", "b", "c", "d");
    js = Q.enqueue(js, "a", "parakeet");
    js = Q.start(js, "a");
    js = Q.enqueue(js, "b", "parakeet");
    js = Q.hold(js, "b");
    expect(Q.inFlightCount(js)).toBe(2); // a running + b held; c,d idle
  });

  it("transitions are immutable (return new arrays)", () => {
    const js = Q.enqueue(jobs("a"), "a", "parakeet");
    const js2 = Q.hold(js, "a");
    expect(js2).not.toBe(js);
    expect(js[0].state).toBe("queued"); // original untouched
  });
});
