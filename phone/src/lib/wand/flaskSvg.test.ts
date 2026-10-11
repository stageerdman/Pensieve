import { describe, it, expect } from "vitest";
import { flaskSVG, SHAPES, CAT_HUE } from "./flaskSvg";

describe("CAT_HUE", () => {
  it("maps every seed category to an h s% l% triple", () => {
    expect(CAT_HUE["--cat-blue"]).toBe("212 70% 68%");
    expect(CAT_HUE["--cat-gold"]).toBe("43 92% 55%");
    expect(Object.keys(CAT_HUE)).toHaveLength(8);
  });
});

describe("flaskSVG", () => {
  it("produces a self-contained <svg> string for every shape", () => {
    for (const shape of SHAPES) {
      const svg = flaskSVG(shape, "212 70% 68%", 0.5);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("viewBox=\"0 0 48 68\"");
      expect(svg).toContain("hsl(212 70% 68%)"); // the liquid colour
      expect(svg.trim().endsWith("</svg>")).toBe(true);
    }
  });

  it("falls back to 'round' geometry for an unknown shape", () => {
    // Compare the shape-defining pieces (clip path + body path), not the whole
    // string — the gradient/clip ids are randomized per call by design.
    const roundClip = 'd="M24 20a14 14 0 1 0 0.001 0Z"';
    const roundBody = 'd="M24 10v10a14 14 0 1 1-0.001 0Z M18 10h12"';
    const unknown = flaskSVG("not-a-shape", "0 0% 0%", 0.5);
    expect(unknown).toContain(roundClip);
    expect(unknown).toContain(roundBody);
  });

  it("clamps fill into a visible minimum band", () => {
    const empty = flaskSVG("vial", "0 0% 0%", 0); // fill clamps to .12 minimum
    const full = flaskSVG("vial", "0 0% 0%", 1);
    expect(empty).not.toBe(full);
    // Both still well-formed.
    expect(empty).toContain("<svg");
    expect(full).toContain("<svg");
  });

  it("derives the deep (gradient-bottom) colour from the same hue, darker", () => {
    const svg = flaskSVG("round", "212 70% 68%", 0.5);
    expect(svg).toContain("hsl(212 70% 46%)"); // deep = same h/s, l fixed to 46%
  });
});
