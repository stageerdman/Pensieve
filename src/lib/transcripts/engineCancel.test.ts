import { describe, it, expect } from "vitest";
import { CANCELLED, isCancelled } from "./engine";

describe("isCancelled", () => {
  it("matches the sentinel as a bare string, an Error, or a wrapped message", () => {
    expect(isCancelled(CANCELLED)).toBe(true);
    expect(isCancelled(new Error(CANCELLED))).toBe(true);
    expect(isCancelled(`invoke failed: ${CANCELLED}`)).toBe(true);
  });

  it("does not match a real failure", () => {
    expect(isCancelled("engine exited with status 120")).toBe(false);
    expect(isCancelled(new Error("spawn failed"))).toBe(false);
  });
});
