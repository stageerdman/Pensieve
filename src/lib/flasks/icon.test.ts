import { describe, it, expect } from "vitest";
import {
  fillForChars,
  encodeIcon,
  parseIcon,
  NORMAL_CHARS,
  OVERFILL_CHARS,
  NORMAL_FILL,
} from "./icon";

describe("fillForChars", () => {
  it("is empty for a title-only note", () => {
    expect(fillForChars(0)).toBe(0);
  });

  it("reaches the normal fill at ~5000 content chars", () => {
    expect(fillForChars(NORMAL_CHARS)).toBeCloseTo(NORMAL_FILL, 5);
  });

  it("overfills to the brim by ~10000 chars and caps there", () => {
    expect(fillForChars(OVERFILL_CHARS)).toBe(1);
    expect(fillForChars(OVERFILL_CHARS * 3)).toBe(1);
  });

  it("rises monotonically and stays within 0..1", () => {
    let prev = -1;
    for (const n of [0, 500, 2000, 5000, 7000, 10000, 50000]) {
      const f = fillForChars(n);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe("icon encode/parse with vibrancy + shine", () => {
  it("omits vibrancy/shine at their defaults (compact 2-field form)", () => {
    expect(encodeIcon({ shape: "vial", color: "gray" })).toBe("vial/gray");
  });

  it("round-trips non-default vibrancy + shine as percentages", () => {
    const enc = encodeIcon({ shape: "round-bottom", color: "blue", vibrancy: 0.8, shine: 0.3 });
    expect(enc).toBe("round-bottom/blue/80/30");
    const back = parseIcon(enc)!;
    expect(back.shape).toBe("round-bottom");
    expect(back.color).toBe("blue");
    expect(back.vibrancy).toBeCloseTo(0.8, 5);
    expect(back.shine).toBeCloseTo(0.3, 5);
  });

  it("reads a legacy 2-field icon (vibrancy/shine fall back to default)", () => {
    const back = parseIcon("beaker/red")!;
    expect(back).toEqual({ shape: "beaker", color: "red" });
    expect(back.vibrancy).toBeUndefined();
  });

  it("ignores an unknown shape/colour", () => {
    expect(parseIcon("teapot/blue/50/50")).toBeUndefined();
  });
});

describe("icon encode/parse with a spectrum hue", () => {
  it("encodes a free hue as h<deg> and round-trips it", () => {
    expect(encodeIcon({ shape: "vial", color: 212 })).toBe("vial/h212");
    const back = parseIcon("vial/h212")!;
    expect(back).toEqual({ shape: "vial", color: 212 });
  });

  it("normalises an out-of-range hue when encoding", () => {
    expect(encodeIcon({ shape: "vial", color: 365 })).toBe("vial/h5");
    expect(encodeIcon({ shape: "vial", color: 0 })).toBe("vial/h0");
  });

  it("keeps the hue alongside non-default vibrancy/shine", () => {
    const enc = encodeIcon({ shape: "teardrop", color: 300, vibrancy: 1, shine: 0 });
    expect(enc).toBe("teardrop/h300/100/0");
    expect(parseIcon(enc)!.color).toBe(300);
  });

  it("rejects a malformed hue but still accepts palette keys", () => {
    expect(parseIcon("vial/h999")).toBeUndefined(); // 999 > 359
    expect(parseIcon("vial/hxyz")).toBeUndefined();
    expect(parseIcon("vial/blue")!.color).toBe("blue");
  });
});
