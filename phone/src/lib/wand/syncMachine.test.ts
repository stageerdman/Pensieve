import { describe, it, expect } from "vitest";
import { syncReducer, initialSyncState, type SyncState } from "./syncMachine";

describe("initialSyncState", () => {
  it("starts synced when online, offline when not", () => {
    expect(initialSyncState(true)).toEqual({ status: "synced", dirty: false, online: true });
    expect(initialSyncState(false)).toEqual({ status: "offline", dirty: false, online: false });
  });
});

describe("syncReducer", () => {
  it("EDIT moves synced -> reminder and marks dirty", () => {
    const s = syncReducer(initialSyncState(true), { type: "EDIT" });
    expect(s.status).toBe("reminder");
    expect(s.dirty).toBe(true);
  });

  it("EDIT while offline stays offline but marks dirty", () => {
    const s = syncReducer(initialSyncState(false), { type: "EDIT" });
    expect(s.status).toBe("offline");
    expect(s.dirty).toBe(true);
  });

  it("CAST starts a sync when online and not already syncing", () => {
    const edited = syncReducer(initialSyncState(true), { type: "EDIT" });
    const s = syncReducer(edited, { type: "CAST" });
    expect(s.status).toBe("syncing");
  });

  it("CAST is a no-op while offline", () => {
    const s = syncReducer(initialSyncState(false), { type: "CAST" });
    expect(s.status).toBe("offline");
  });

  it("CAST is a no-op while already syncing", () => {
    const syncing: SyncState = { status: "syncing", dirty: true, online: true };
    const s = syncReducer(syncing, { type: "CAST" });
    expect(s).toEqual(syncing);
  });

  it("SYNC_SUCCEEDED clears dirty and returns to synced (while online)", () => {
    const syncing: SyncState = { status: "syncing", dirty: true, online: true };
    const s = syncReducer(syncing, { type: "SYNC_SUCCEEDED" });
    expect(s).toEqual({ status: "synced", dirty: false, online: true });
  });

  it("SYNC_SUCCEEDED lands on offline if connectivity dropped mid-cast", () => {
    const syncing: SyncState = { status: "syncing", dirty: true, online: false };
    const s = syncReducer(syncing, { type: "SYNC_SUCCEEDED" });
    expect(s.status).toBe("offline");
    expect(s.dirty).toBe(false);
  });

  it("SYNC_FAILED moves to failed and stays dirty (retry is offered)", () => {
    const syncing: SyncState = { status: "syncing", dirty: true, online: true };
    const s = syncReducer(syncing, { type: "SYNC_FAILED" });
    expect(s.status).toBe("failed");
    expect(s.dirty).toBe(true);
  });

  it("WENT_ONLINE goes to reminder if dirty, synced otherwise", () => {
    const dirtyOffline: SyncState = { status: "offline", dirty: true, online: false };
    expect(syncReducer(dirtyOffline, { type: "WENT_ONLINE" })).toEqual({
      status: "reminder",
      dirty: true,
      online: true,
    });
    const cleanOffline: SyncState = { status: "offline", dirty: false, online: false };
    expect(syncReducer(cleanOffline, { type: "WENT_ONLINE" })).toEqual({
      status: "synced",
      dirty: false,
      online: true,
    });
  });

  it("WENT_OFFLINE always moves to offline", () => {
    const synced: SyncState = { status: "synced", dirty: false, online: true };
    expect(syncReducer(synced, { type: "WENT_OFFLINE" })).toEqual({
      status: "offline",
      dirty: false,
      online: false,
    });
  });

  it("full happy path: synced -> edit -> cast -> succeed -> synced", () => {
    let s = initialSyncState(true);
    s = syncReducer(s, { type: "EDIT" });
    expect(s.status).toBe("reminder");
    s = syncReducer(s, { type: "CAST" });
    expect(s.status).toBe("syncing");
    s = syncReducer(s, { type: "SYNC_SUCCEEDED" });
    expect(s).toEqual({ status: "synced", dirty: false, online: true });
  });
});
