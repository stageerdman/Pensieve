import { describe, it, expect } from "vitest";
import { deriveSyncView } from "./deriveSyncView";
import type { SyncUi } from "./types";

const base: SyncUi = {
  phase: "idle",
  lastSyncedAt: null,
  conflicts: [],
  error: null,
  errorKind: null,
  account: null,
  quota: null,
  transfer: null,
};
const ui = (over: Partial<SyncUi>): SyncUi => ({ ...base, ...over });

describe("deriveSyncView", () => {
  it("hides on the unavailable phase (sync is desktop-only)", () => {
    expect(deriveSyncView(ui({ phase: "unavailable" }), false, false).hidden).toBe(true);
    expect(deriveSyncView(base, false, false).hidden).toBe(false);
  });

  it("disconnected → connect action, offline glyph, not connected", () => {
    const v = deriveSyncView(ui({ phase: "disconnected" }), false, false);
    expect(v.connected).toBe(false);
    expect(v.glyphState).toBe("offline");
    expect(v.primary).toEqual({ kind: "connect", label: "Connect OneDrive" });
    expect(v.headerTitle).toBe("Back up your thoughts.");
  });

  it("needs-summon → summon action + warn dot", () => {
    const v = deriveSyncView(ui({ phase: "needs-summon" }), false, false);
    expect(v.primary?.kind).toBe("summon");
    expect(v.dot).toBe("bg-warn");
    expect(v.glyphState).toBe("offline");
    expect(v.connected).toBe(true);
  });

  it("pending at rest → nudge, reminder glyph, backup action", () => {
    const v = deriveSyncView(ui({ phase: "idle" }), true, false);
    expect(v.nudge).toBe(true);
    expect(v.glyphState).toBe("reminder");
    expect(v.headerTitle).toBe("Ready to back up.");
    expect(v.primary).toEqual({ kind: "backup", label: "Back up now", hint: "⌘S" });
  });

  it("just-synced beats a pending nudge (flash, 'All backed up.')", () => {
    const v = deriveSyncView(ui({ phase: "synced" }), true, true);
    expect(v.nudge).toBe(false);
    expect(v.glyphState).toBe("flash");
    expect(v.headerTitle).toBe("All backed up.");
  });

  it("syncing → direction-aware title, no action, no subtext (row carries it)", () => {
    const down = deriveSyncView(
      ui({ phase: "syncing", transfer: { direction: "down", name: "a", doneItems: 0, totalItems: 3 } }),
      false,
      false,
    );
    expect(down.headerTitle).toBe("Catching up…");
    expect(down.primary).toBeNull();
    expect(down.subText).toBeNull();
    expect(down.glyphState).toBe("syncing");
    const up = deriveSyncView(
      ui({ phase: "syncing", transfer: { direction: "up", name: "a", doneItems: 0, totalItems: 3 } }),
      false,
      false,
    );
    expect(up.headerTitle).toBe("Backing up…");
  });

  it("error distinguishes expired (reconnect) from offline/other (retry)", () => {
    const expired = deriveSyncView(ui({ phase: "error", errorKind: "expired" }), false, false);
    expect(expired.headerTitle).toBe("Sign-in expired.");
    expect(expired.primary?.kind).toBe("reconnect");

    const offline = deriveSyncView(ui({ phase: "error", errorKind: "offline" }), false, false);
    expect(offline.headerTitle).toBe("Can't reach OneDrive.");
    expect(offline.primary?.kind).toBe("retry");

    const other = deriveSyncView(ui({ phase: "error", errorKind: "other", error: "boom" }), false, false);
    expect(other.headerTitle).toBe("Backup hit a snag.");
    expect(other.subText).toBe("boom");
    expect(other.primary?.kind).toBe("retry");
  });

  it("conflicts → pluralized title, warn dot, no subtext", () => {
    const one = deriveSyncView(
      ui({ phase: "conflicts", conflicts: [{ noteId: "a", reason: "both-changed" }] }),
      false,
      false,
    );
    expect(one.headerTitle).toBe("1 note changed here and elsewhere.");
    const two = deriveSyncView(
      ui({
        phase: "conflicts",
        conflicts: [
          { noteId: "a", reason: "both-changed" },
          { noteId: "b", reason: "both-changed" },
        ],
      }),
      false,
      false,
    );
    expect(two.headerTitle).toBe("2 notes changed here and elsewhere.");
    expect(two.dot).toBe("bg-warn");
    expect(two.subText).toBeNull();
  });

  it("showMeter only when connected, not errored/needs-summon, and quota known", () => {
    const quota = { usedBytes: 1, totalBytes: 10 };
    expect(deriveSyncView(ui({ phase: "idle", quota }), false, false).showMeter).toBe(true);
    expect(deriveSyncView(ui({ phase: "idle", quota: null }), false, false).showMeter).toBe(false);
    expect(deriveSyncView(ui({ phase: "error", errorKind: "other", quota }), false, false).showMeter).toBe(false);
    expect(deriveSyncView(ui({ phase: "disconnected", quota }), false, false).showMeter).toBe(false);
  });

  it("not-backed-up vs last-backed-up subtext at rest", () => {
    expect(deriveSyncView(ui({ phase: "idle", lastSyncedAt: null }), false, false).subText).toBe(
      "Not backed up yet.",
    );
    expect(
      deriveSyncView(ui({ phase: "idle", lastSyncedAt: 1 }), false, false).subText,
    ).toMatch(/^Last backed up ·/);
  });
});
