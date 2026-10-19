import { describe, it, expect, beforeEach } from "vitest";
import { loadQueueState, saveQueueState } from "./queuePersistence";

const KEY = "pensieve:transcription:queue";

describe("queuePersistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is saved", () => {
    expect(loadQueueState()).toBeNull();
  });

  it("round-trips rows + playing + mode", () => {
    saveQueueState({
      rows: { "media/x.m4a": { model: "parakeet", order: 2 } },
      playing: true,
      mode: "one",
    });
    const out = loadQueueState()!;
    expect(out.playing).toBe(true);
    expect(out.mode).toBe("one");
    expect(out.rows["media/x.m4a"]).toEqual({ model: "parakeet", order: 2 });
  });

  it("drops rows with an unknown model or missing order", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        rows: {
          good: { model: "czech-whisper", order: 1 },
          badModel: { model: "whisper-xl", order: 2 },
          noOrder: { model: "parakeet" },
        },
        playing: false,
        mode: "all",
      }),
    );
    const out = loadQueueState()!;
    expect(Object.keys(out.rows)).toEqual(["good"]);
  });

  it("normalizes a bad/missing mode to 'all' and playing to boolean", () => {
    localStorage.setItem(KEY, JSON.stringify({ rows: {}, mode: "nonsense" }));
    const out = loadQueueState()!;
    expect(out.mode).toBe("all");
    expect(out.playing).toBe(false);
  });

  it("returns null on malformed JSON (never throws)", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadQueueState()).toBeNull();
  });
});
