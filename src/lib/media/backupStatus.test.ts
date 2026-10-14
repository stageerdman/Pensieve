import { describe, it, expect, beforeEach } from "vitest";
import {
  _resetMediaBackup,
  setMediaBackupEnabled,
  isMediaBackupEnabled,
  getMediaBackupState,
  setMediaBackupState,
  primeMediaBackupStates,
  subscribeMediaBackup,
  subscribeMediaBackupAll,
  mediaBackupSummary,
} from "./backupStatus";

const REF = "media/n/a.png";

beforeEach(() => _resetMediaBackup());

describe("media backup status store", () => {
  it("defaults an unknown ref to 'local' and a null ref to 'backed-up' (no rune)", () => {
    expect(getMediaBackupState(REF)).toBe("local");
    expect(getMediaBackupState(null)).toBe("backed-up");
    expect(getMediaBackupState(undefined)).toBe("backed-up");
  });

  it("drives the rune transitions local → uploading → backed-up / failed", () => {
    setMediaBackupState(REF, "uploading");
    expect(getMediaBackupState(REF)).toBe("uploading");
    setMediaBackupState(REF, "backed-up");
    expect(getMediaBackupState(REF)).toBe("backed-up");
    setMediaBackupState(REF, "failed");
    expect(getMediaBackupState(REF)).toBe("failed");
  });

  it("notifies a per-ref subscriber only when its ref changes", () => {
    let hits = 0;
    const unsub = subscribeMediaBackup(REF, () => hits++);
    setMediaBackupState(REF, "uploading");
    setMediaBackupState(REF, "uploading"); // no-op, no notify
    setMediaBackupState("media/n/other.png", "uploading"); // different ref
    expect(hits).toBe(1);
    unsub();
    setMediaBackupState(REF, "backed-up");
    expect(hits).toBe(1); // unsubscribed
  });

  it("computes a stable aggregate summary (same identity until a value changes)", () => {
    const s0 = mediaBackupSummary();
    expect(s0).toEqual({ uploading: 0, failed: 0, total: 0 });
    setMediaBackupState("a", "uploading");
    setMediaBackupState("b", "uploading");
    setMediaBackupState("c", "failed");
    const s1 = mediaBackupSummary();
    expect(s1).toEqual({ uploading: 2, failed: 1, total: 3 });
    // No change → identical reference (useSyncExternalStore safety).
    expect(mediaBackupSummary()).toBe(s1);
  });

  it("pokes the global subscriber on any change", () => {
    let hits = 0;
    const unsub = subscribeMediaBackupAll(() => hits++);
    setMediaBackupState(REF, "uploading");
    setMediaBackupState("media/n/b.png", "failed");
    expect(hits).toBe(2);
    unsub();
  });

  it("primes backed-up refs from persisted records", () => {
    primeMediaBackupStates({ [REF]: { backedUp: true }, "media/n/b.png": { backedUp: false } });
    expect(getMediaBackupState(REF)).toBe("backed-up");
    expect(getMediaBackupState("media/n/b.png")).toBe("local");
  });

  it("toggles the enabled flag", () => {
    expect(isMediaBackupEnabled()).toBe(false);
    setMediaBackupEnabled(true);
    expect(isMediaBackupEnabled()).toBe(true);
  });
});
