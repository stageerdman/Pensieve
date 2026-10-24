import { beforeEach, describe, expect, it } from "vitest";
import { clearVault, loadVault, newId, persistVault } from "./vaultStore";

beforeEach(() => {
  localStorage.clear();
});

describe("vaultStore", () => {
  it("falls back to the seed when nothing is stored yet", () => {
    expect(loadVault().length).toBeGreaterThan(0);
  });

  it("an explicitly empty vault stays empty — does NOT fall back to the seed", () => {
    persistVault([]);
    expect(loadVault()).toEqual([]);
  });

  it("persists and reloads a vault round-trip", () => {
    const note = { id: "x1", t: "T", c: "B", cat: "--cat-blue", shape: "vial" as const, fill: 0.2, d: "Today", created: "Today", createdAt: 1, updatedAt: 2 };
    persistVault([note]);
    expect(loadVault()).toEqual([note]);
  });

  it("clearVault removes the stored vault (falls back to seed again)", () => {
    persistVault([]);
    clearVault();
    expect(loadVault().length).toBeGreaterThan(0);
  });

  it("newId mints distinct string ids", () => {
    const a = newId();
    const b = newId();
    expect(typeof a).toBe("string");
    expect(a).not.toBe(b);
  });
});
