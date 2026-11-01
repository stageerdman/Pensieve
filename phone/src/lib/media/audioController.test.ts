import { describe, it, expect, vi } from "vitest";
import { getController } from "./audioController";

// jsdom never actually loads an <audio src>, so these are pure registry/eviction tests — no
// real decode ever happens here, which is fine: we're locking in the LRU cap itself, not
// playback behavior.

describe("getController LRU cap", () => {
  it("evicts the least-recently-touched entry once the cap is exceeded", () => {
    const keys = Array.from({ length: 5 }, (_, i) => `media/test/take${i}.wav`);
    const first = keys.map((k) => getController(k, `blob:${k}`));

    // A 6th distinct key pushes the registry over MAX_LIVE_CONTROLLERS (5) — keys[0] is the
    // least-recently touched (nothing has re-touched it since its own creation), so it should
    // be the one evicted and recreated.
    getController("media/test/take5.wav", "blob:take5");

    // keys[1..4] were touched (created) AFTER keys[0], so none of them should have been
    // evicted by that single overflow — check these BEFORE touching keys[0] again, since
    // re-requesting an evicted key is itself a fresh-creation event that would otherwise
    // trigger a second eviction round and confuse this assertion.
    for (let i = 1; i < keys.length; i++) {
      expect(getController(keys[i], `blob:${keys[i]}`)).toBe(first[i]);
    }

    const reFetched0 = getController(keys[0], `blob:${keys[0]}`);
    expect(reFetched0).not.toBe(first[0]);
  });

  it("never evicts a controller that is currently playing", () => {
    const keys = Array.from({ length: 5 }, (_, i) => `media/play-test/take${i}.wav`);
    const controllers = keys.map((k) => getController(k, `blob:${k}`));
    // Fake "playing" without relying on jsdom's unimplemented HTMLMediaElement.play().
    vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
    try {
      void controllers[0].playing; // touches the mocked getter so TS doesn't flag it unused
      getController("media/play-test/overflow.wav", "blob:overflow");
      // Every existing entry reports as "playing" (mocked), so eviction must give up rather
      // than tear down a live playback — the registry simply grows past the cap this one time.
      expect(getController(keys[0], `blob:${keys[0]}`)).toBe(controllers[0]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
