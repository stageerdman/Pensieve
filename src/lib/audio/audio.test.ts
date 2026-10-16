import { describe, it, expect, vi } from "vitest";
import { fmt } from "./time";
import { resamplePeaks, placeholderPeaks } from "./peaks";
import { getController, releaseController } from "./controller";

// jsdom doesn't implement these media methods; the controller calls them on teardown.
HTMLMediaElement.prototype.load = vi.fn();
HTMLMediaElement.prototype.pause = vi.fn();

describe("audio time fmt", () => {
  it("formats m:ss and pads seconds", () => {
    expect(fmt(0)).toBe("0:00");
    expect(fmt(5)).toBe("0:05");
    expect(fmt(65)).toBe("1:05");
    expect(fmt(1143.85)).toBe("19:03");
  });
  it("formats h:mm:ss past an hour", () => {
    expect(fmt(3661)).toBe("1:01:01");
  });
  it("guards NaN/negative → 0:00", () => {
    expect(fmt(NaN)).toBe("0:00");
    expect(fmt(-10)).toBe("0:00");
  });
});

describe("waveform peaks resample", () => {
  it("returns exactly n bars", () => {
    expect(resamplePeaks([0.1, 0.9, 0.3, 0.7], 2)).toHaveLength(2);
    expect(resamplePeaks([0.5], 8)).toHaveLength(8);
    expect(resamplePeaks([], 5)).toHaveLength(5);
  });
  it("max-pools each bucket (preserves transients)", () => {
    // 4 → 2: bucket[0]=max(0.1,0.9)=0.9, bucket[1]=max(0.3,0.7)=0.7
    expect(resamplePeaks([0.1, 0.9, 0.3, 0.7], 2)).toEqual([0.9, 0.7]);
  });
  it("passes through when length already matches", () => {
    const a = [0.2, 0.4, 0.6];
    expect(resamplePeaks(a, 3)).toEqual(a);
  });
  it("placeholder is deterministic per key and within [0,1]", () => {
    const a = placeholderPeaks("media/n/x.mp3", 50);
    const b = placeholderPeaks("media/n/x.mp3", 50);
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    // different key → different shape
    expect(placeholderPeaks("media/n/y.mp3", 50)).not.toEqual(a);
  });
});

describe("audio controller registry (key vs src)", () => {
  it("shares ONE controller for the same key (the block's several faces)", () => {
    const a = getController("block-1", "media/n/x.mp3");
    const b = getController("block-1", "media/n/x.mp3");
    expect(b).toBe(a); // two faces, one playhead
    expect(a.src).toBe("media/n/x.mp3");
    releaseController("block-1");
    releaseController("block-1");
  });

  it("keeps DISTINCT controllers for distinct keys on the SAME src (a duplicated block)", () => {
    // The whole point of the fix: two blocks referencing one file must not scrub each other.
    const a = getController("block-A", "media/n/same.mp3");
    const b = getController("block-B", "media/n/same.mp3");
    expect(b).not.toBe(a);
    expect(a.src).toBe("media/n/same.mp3");
    expect(b.src).toBe("media/n/same.mp3");
    releaseController("block-A");
    releaseController("block-B");
  });

  it("defaults src to key for simple single-face callers", () => {
    const c = getController("media/n/solo.mp3");
    expect(c.src).toBe("media/n/solo.mp3");
    releaseController("media/n/solo.mp3");
  });
});
