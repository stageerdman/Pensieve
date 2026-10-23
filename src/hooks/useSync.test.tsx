// useSync orchestrates createEngine() + the connect/disconnect/conflict surface and
// the syncing→synced/failed/offline/needs-summon phase machine. Everything native
// (engine, connect, tokens, vault) is mocked so the hook's wiring is exercised in
// isolation — the engine's own sync logic is covered by lib/sync/engine.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const isTauri = vi.fn();
const createEngine = vi.fn();
const connectOneDrive = vi.fn();
const disconnectOneDrive = vi.fn();
const isConnected = vi.fn();
const tauriVault = vi.fn();

vi.mock("../lib/store", () => ({ isTauri: (...a: unknown[]) => isTauri(...a) }));
vi.mock("../lib/sync/engine", () => ({ createEngine: (...a: unknown[]) => createEngine(...a) }));
vi.mock("../lib/sync/connect", () => ({
  connectOneDrive: (...a: unknown[]) => connectOneDrive(...a),
  disconnectOneDrive: (...a: unknown[]) => disconnectOneDrive(...a),
}));
vi.mock("../lib/sync/tokens", () => ({ isConnected: (...a: unknown[]) => isConnected(...a) }));
vi.mock("../lib/sync/vault", () => ({ tauriVault: (...a: unknown[]) => tauriVault(...a) }));

import { useSync } from "./useSync";
import type { SyncConflict, SyncResult } from "../lib/sync/engine";
import { ReconnectNeededError, RemoteRootMissingError, TransientSyncError } from "../lib/sync/types";

function result(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    pulled: [],
    pushed: [],
    pulledDeletes: [],
    pushedDeletes: [],
    pushedMedia: [],
    pulledMedia: [],
    conflicts: [],
    lastSyncedAt: 123,
    ...overrides,
  };
}

// A promise the test can resolve/reject on its own schedule, so we can observe the
// transient "syncing" phase before the run settles.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface EngineMock {
  run: ReturnType<typeof vi.fn>;
  summon: ReturnType<typeof vi.fn>;
  keepLocal: ReturnType<typeof vi.fn>;
  keepRemote: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
}

let engine: EngineMock;
let vault: { readState: ReturnType<typeof vi.fn> };

beforeEach(() => {
  engine = {
    run: vi.fn().mockResolvedValue(result()),
    summon: vi.fn().mockResolvedValue(result()),
    keepLocal: vi.fn().mockResolvedValue(undefined),
    keepRemote: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue({ account: { email: "me@example.com" }, quota: { usedBytes: 1, totalBytes: 2 } }),
  };
  vault = { readState: vi.fn().mockResolvedValue({ lastSyncedAt: null }) };

  isTauri.mockReturnValue(true);
  createEngine.mockReturnValue(engine);
  connectOneDrive.mockResolvedValue(undefined);
  disconnectOneDrive.mockResolvedValue(undefined);
  isConnected.mockResolvedValue(true);
  tauriVault.mockReturnValue(vault);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Render + wait for the mount effect to settle into "idle" (the common starting
// point for the phase-transition tests below).
async function mountIdle(onChanged?: () => void) {
  const hook = renderHook(() => useSync(onChanged));
  await waitFor(() => expect(hook.result.current.ui.phase).toBe("idle"));
  return hook;
}

describe("useSync — mount wiring", () => {
  it("is 'unavailable' off the native app, and never probes the connection", async () => {
    isTauri.mockReturnValue(false);
    const { result: r } = renderHook(() => useSync());
    expect(r.current.ui.phase).toBe("unavailable");
    await Promise.resolve();
    expect(isConnected).not.toHaveBeenCalled();
  });

  it("goes to 'disconnected' when no refresh token is stored", async () => {
    isConnected.mockResolvedValue(false);
    const { result: r } = renderHook(() => useSync());
    await waitFor(() => expect(r.current.ui.phase).toBe("disconnected"));
    expect(r.current.ui.lastSyncedAt).toBeNull();
  });

  it("goes to 'idle' with the persisted lastSyncedAt when connected, then fills account/quota in the background", async () => {
    vault.readState.mockResolvedValue({ lastSyncedAt: 555 });
    const { result: r } = await mountIdle();
    expect(r.current.ui.lastSyncedAt).toBe(555);
    await waitFor(() => expect(r.current.ui.account).toEqual({ email: "me@example.com" }));
    expect(r.current.ui.quota).toEqual({ usedBytes: 1, totalBytes: 2 });
  });

  it("tolerates a missing sync state (no prior sync) and still reaches idle", async () => {
    vault.readState.mockRejectedValue(new Error("no state file"));
    const { result: r } = await mountIdle();
    expect(r.current.ui.lastSyncedAt).toBeNull();
  });
});

describe("useSync — runSync phase transitions", () => {
  it("syncNow: idle → syncing → synced, clearing any prior error/transfer", async () => {
    const d = deferred<SyncResult>();
    engine.run.mockReturnValue(d.promise);
    const { result: r } = await mountIdle();

    act(() => {
      void r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("syncing");
    expect(r.current.ui.error).toBeNull();

    await act(async () => {
      d.resolve(result({ lastSyncedAt: 999 }));
      await d.promise;
    });
    await waitFor(() => expect(r.current.ui.phase).toBe("synced"));
    expect(r.current.ui.lastSyncedAt).toBe(999);
    expect(r.current.ui.transfer).toBeNull();
  });

  it("surfaces in-flight progress via onProgress, then clears it on completion", async () => {
    const d = deferred<SyncResult>();
    engine.run.mockImplementation((onProgress?: (p: unknown) => void) => {
      onProgress?.({ direction: "up", name: "x", doneItems: 0, totalItems: 1 });
      return d.promise;
    });
    const { result: r } = await mountIdle();

    act(() => {
      void r.current.syncNow();
    });
    expect(r.current.ui.transfer).toEqual({ direction: "up", name: "x", doneItems: 0, totalItems: 1 });

    await act(async () => {
      d.resolve(result());
      await d.promise;
    });
    expect(r.current.ui.transfer).toBeNull();
  });

  it("goes to 'conflicts' (not 'synced') when the result reports conflicts", async () => {
    engine.run.mockResolvedValue(result({ conflicts: [{ noteId: "x", reason: "both-changed" }] }));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("conflicts");
    expect(r.current.ui.conflicts).toEqual([{ noteId: "x", reason: "both-changed" }]);
  });

  it("calls onChanged when the sync actually touched local notes (pulled)", async () => {
    engine.run.mockResolvedValue(result({ pulled: ["a"] }));
    const onChanged = vi.fn();
    const { result: r } = await mountIdle(onChanged);
    await act(async () => {
      await r.current.syncNow();
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("calls onChanged when the sync removed notes locally (pulledDeletes)", async () => {
    engine.run.mockResolvedValue(result({ pulledDeletes: ["a"] }));
    const onChanged = vi.fn();
    const { result: r } = await mountIdle(onChanged);
    await act(async () => {
      await r.current.syncNow();
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onChanged when nothing pulled/removed locally (push-only sync)", async () => {
    engine.run.mockResolvedValue(result({ pushed: ["a"] }));
    const onChanged = vi.fn();
    const { result: r } = await mountIdle(onChanged);
    await act(async () => {
      await r.current.syncNow();
    });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("RemoteRootMissingError → 'needs-summon', no generic error text", async () => {
    engine.run.mockRejectedValue(new RemoteRootMissingError());
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("needs-summon");
    expect(r.current.ui.error).toBeNull();
    expect(r.current.ui.errorKind).toBeNull();
  });

  it("ReconnectNeededError → 'error' with errorKind 'expired'", async () => {
    engine.run.mockRejectedValue(new ReconnectNeededError("Your OneDrive sign-in has expired."));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("error");
    expect(r.current.ui.errorKind).toBe("expired");
    expect(r.current.ui.error).toBe("Your OneDrive sign-in has expired.");
  });

  it("TransientSyncError → 'error' with errorKind 'offline' (never 'expired')", async () => {
    engine.run.mockRejectedValue(new TransientSyncError("Can't reach OneDrive right now."));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("error");
    expect(r.current.ui.errorKind).toBe("offline");
  });

  it("an unrecognized error → 'error' with errorKind 'other', message preserved verbatim", async () => {
    engine.run.mockRejectedValue(new Error("disk full"));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("error");
    expect(r.current.ui.errorKind).toBe("other");
    expect(r.current.ui.error).toBe("disk full");
  });

  it("ignores a second syncNow while one is already in flight (busy guard)", async () => {
    const d = deferred<SyncResult>();
    engine.run.mockReturnValue(d.promise);
    const { result: r } = await mountIdle();

    act(() => {
      void r.current.syncNow();
      void r.current.syncNow(); // should be a no-op — busy.current is already true
    });
    expect(engine.run).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(result());
      await d.promise;
    });
  });
});

describe("useSync — connect / disconnect", () => {
  it("connect() signs in then immediately runs a first sync", async () => {
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.connect();
    });
    expect(connectOneDrive).toHaveBeenCalledTimes(1);
    expect(engine.run).toHaveBeenCalledTimes(1);
    expect(r.current.ui.phase).toBe("synced");
  });

  it("connect() failure leaves the UI 'disconnected' with the error, and never syncs", async () => {
    connectOneDrive.mockRejectedValue(new Error("user cancelled"));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.connect();
    });
    expect(r.current.ui.phase).toBe("disconnected");
    expect(r.current.ui.error).toBe("user cancelled");
    expect(engine.run).not.toHaveBeenCalled();
  });

  it("disconnect() clears the whole UI back to defaults", async () => {
    engine.run.mockResolvedValue(result({ conflicts: [{ noteId: "x", reason: "both-changed" }] }));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("conflicts");

    await act(async () => {
      await r.current.disconnect();
    });
    expect(disconnectOneDrive).toHaveBeenCalledTimes(1);
    expect(r.current.ui).toEqual({
      phase: "disconnected",
      lastSyncedAt: null,
      conflicts: [],
      error: null,
      errorKind: null,
      account: null,
      quota: null,
      transfer: null,
    });
  });
});

// A real (unfaked) macrotask tick — lets the resolve queue's microtasks/awaits drain
// without fighting testing-library's `waitFor` polling, which fake timers complicate.
function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("useSync — summon and conflict resolution", () => {
  it("summon() drives the engine's summon (not run) and reaches 'synced'", async () => {
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.summon();
    });
    expect(engine.summon).toHaveBeenCalledTimes(1);
    expect(engine.run).not.toHaveBeenCalled();
    expect(r.current.ui.phase).toBe("synced");
  });

  // Drive a sync that reports conflicts, landing the hook in "conflicts" with the
  // given list — the shared starting point for the resolution tests below.
  async function mountWithConflicts(conflicts: SyncConflict[]) {
    engine.run.mockResolvedValue(result({ conflicts }));
    const { result: r } = await mountIdle();
    await act(async () => {
      await r.current.syncNow();
    });
    expect(r.current.ui.phase).toBe("conflicts");
    return r;
  }

  it("keepLocal() resolves the conflict immediately — no synchronous full re-sync", async () => {
    const r = await mountWithConflicts([{ noteId: "note-x", reason: "both-changed" }]);
    await act(async () => {
      r.current.keepLocal("note-x");
      await tick();
      await tick();
    });
    expect(engine.keepLocal).toHaveBeenCalledWith("note-x");
    expect(r.current.ui.conflicts).toEqual([]); // removed as soon as it resolves
    expect(r.current.ui.phase).toBe("idle"); // not "synced" — no sync actually ran
    expect(engine.run).toHaveBeenCalledTimes(1); // only the seeding sync from mountWithConflicts
  });

  it("schedules exactly one trailing sync after the debounce window, even after several resolves", async () => {
    const r = await mountWithConflicts([
      { noteId: "a", reason: "both-changed" },
      { noteId: "b", reason: "both-changed" },
    ]);
    await act(async () => {
      r.current.keepLocal("a");
      await tick();
      r.current.keepLocal("b");
      await tick(50); // well inside the 600ms debounce window
    });
    expect(engine.keepLocal).toHaveBeenCalledTimes(2);
    expect(r.current.ui.conflicts).toEqual([]);
    expect(engine.run).toHaveBeenCalledTimes(1); // only the seeding sync — still debouncing

    await act(async () => {
      await tick(650);
    });
    expect(engine.run).toHaveBeenCalledTimes(2); // + exactly one trailing sync, not two
  });

  it("keepLocal() keeps the conflict and records an error on failure — no follow-up sync", async () => {
    engine.keepLocal.mockRejectedValue(new Error("network blip"));
    const r = await mountWithConflicts([{ noteId: "note-x", reason: "both-changed" }]);
    await act(async () => {
      r.current.keepLocal("note-x");
      await tick();
      await tick();
    });
    expect(r.current.ui.conflicts).toEqual([{ noteId: "note-x", reason: "both-changed" }]);
    expect(r.current.conflictErrors["note-x"]).toMatch(/try again/i);

    await act(async () => {
      await tick(650);
    });
    expect(engine.run).toHaveBeenCalledTimes(1); // only the seeding sync — no follow-up was scheduled
  });

  it("keepRemote() calls the engine, removes the conflict, and notifies onChanged (content changed on disk)", async () => {
    const onChanged = vi.fn();
    engine.run.mockResolvedValue(result({ conflicts: [{ noteId: "note-x", reason: "both-changed" }] }));
    const { result: r } = await mountIdle(onChanged);
    await act(async () => {
      await r.current.syncNow();
    });
    onChanged.mockClear();

    await act(async () => {
      r.current.keepRemote("note-x");
      await tick();
      await tick();
    });
    expect(engine.keepRemote).toHaveBeenCalledWith("note-x");
    expect(engine.keepLocal).not.toHaveBeenCalled();
    expect(r.current.ui.conflicts).toEqual([]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("keepAllLocal() resolves every pending conflict", async () => {
    const r = await mountWithConflicts([
      { noteId: "a", reason: "both-changed" },
      { noteId: "b", reason: "both-changed" },
      { noteId: "c", reason: "both-changed" },
    ]);
    await act(async () => {
      r.current.keepAllLocal();
      await tick();
      await tick();
      await tick();
    });
    expect(engine.keepLocal).toHaveBeenCalledTimes(3);
    expect(engine.keepLocal).toHaveBeenCalledWith("a");
    expect(engine.keepLocal).toHaveBeenCalledWith("b");
    expect(engine.keepLocal).toHaveBeenCalledWith("c");
    expect(r.current.ui.conflicts).toEqual([]);
  });

  it("ignores a second click on the same still-resolving conflict", async () => {
    const r = await mountWithConflicts([{ noteId: "note-x", reason: "both-changed" }]);
    await act(async () => {
      r.current.keepLocal("note-x");
      r.current.keepLocal("note-x"); // same tick — already marked resolving
      await tick();
      await tick();
    });
    expect(engine.keepLocal).toHaveBeenCalledTimes(1);
  });
});
