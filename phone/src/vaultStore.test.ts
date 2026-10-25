import { beforeEach, describe, expect, it } from "vitest";
import { clearVault, loadVault, newId, persistVault } from "./vaultStore";

beforeEach(() => {
  localStorage.clear();
});

describe("vaultStore", () => {
  it("starts empty when nothing is stored yet — no seed fallback", () => {
    expect(loadVault()).toEqual([]);
  });

  it("an explicitly empty vault stays empty", () => {
    persistVault([]);
    expect(loadVault()).toEqual([]);
  });

  it("persists and reloads a vault round-trip", () => {
    const note = { id: "x1", t: "T", c: "B", cat: "--cat-blue", shape: "vial" as const, fill: 0.2, d: "Today", created: "Today", createdAt: 1, updatedAt: 2 };
    persistVault([note]);
    expect(loadVault()).toEqual([note]);
  });

  it("clearVault removes the stored vault", () => {
    persistVault([{ id: "x1", t: "T", c: "B", cat: "--cat-blue", shape: "vial" as const, fill: 0.2, d: "Today", created: "Today", createdAt: 1, updatedAt: 2 }]);
    clearVault();
    expect(loadVault()).toEqual([]);
  });

  it("newId mints distinct string ids", () => {
    const a = newId();
    const b = newId();
    expect(typeof a).toBe("string");
    expect(a).not.toBe(b);
  });
});
