import { afterEach, describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { SyncStatus } from "./SyncStatus";
import type { SyncUi } from "../hooks/useSync";

// Build a fake `useSync` return with a given UI state, so we can assert the panel
// shows the right words + the right primary action for each state — the heart of
// the "honest states" fix.

const baseUi: SyncUi = {
  phase: "idle",
  lastSyncedAt: null,
  conflicts: [],
  error: null,
  errorKind: null,
  account: { email: "owner@example.com" },
  quota: { usedBytes: 200 * 1024 ** 3, totalBytes: 1024 ** 4 },
  transfer: null,
};

function mountPanel(ui: Partial<SyncUi>) {
  const fns = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    syncNow: vi.fn(),
    keepLocal: vi.fn(),
    refreshInfo: vi.fn(),
  };
  const sync = { ui: { ...baseUi, ...ui }, ...fns } as unknown as Parameters<typeof SyncStatus>[0]["sync"];
  const r = render(<SyncStatus sync={sync} titleFor={(id) => `Title:${id}`} pending={ui.phase === "idle" && false} />);
  fireEvent.click(r.getByLabelText("OneDrive sync")); // open the panel
  return { ...r, fns };
}

afterEach(cleanup);

describe("SyncStatus panel", () => {
  it("off-desktop (unavailable) renders nothing", () => {
    const sync = { ui: { ...baseUi, phase: "unavailable" }, connect: vi.fn(), disconnect: vi.fn(), syncNow: vi.fn(), keepLocal: vi.fn(), refreshInfo: vi.fn() } as unknown as Parameters<typeof SyncStatus>[0]["sync"];
    const { container } = render(<SyncStatus sync={sync} titleFor={(id) => id} />);
    expect(container.firstChild).toBeNull();
  });

  it("idle shows 'All backed up.' + last-synced + account footer + Back up now", () => {
    const { getByText, getByRole } = mountPanel({ phase: "synced", lastSyncedAt: Date.now() - 4 * 60_000 });
    expect(getByText("All backed up.")).toBeTruthy();
    expect(getByText(/Last backed up ·/)).toBeTruthy();
    expect(getByText("owner@example.com")).toBeTruthy();
    expect(getByRole("button", { name: /Back up now/ })).toBeTruthy();
  });

  it("expired says 'Sign-in expired.' with Reconnect (not Try again)", () => {
    const { getByText, getByRole, queryByRole, fns } = mountPanel({
      phase: "error",
      errorKind: "expired",
      error: "Your OneDrive sign-in has expired.",
    });
    expect(getByText("Sign-in expired.")).toBeTruthy();
    expect(getByText(/safe on this Mac/)).toBeTruthy();
    expect(queryByRole("button", { name: /Try again/ })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Reconnect" }));
    expect(fns.connect).toHaveBeenCalled();
  });

  it("offline (transient) says 'Can't reach OneDrive.' with Try again (not Reconnect)", () => {
    const { getByText, getByRole, queryByRole, fns } = mountPanel({
      phase: "error",
      errorKind: "offline",
      error: "temporary",
    });
    expect(getByText("Can't reach OneDrive.")).toBeTruthy();
    expect(queryByRole("button", { name: "Reconnect" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Try again" }));
    expect(fns.syncNow).toHaveBeenCalled();
  });

  it("syncing shows the live transfer (direction, N of M, current title) and no action", () => {
    const { getByText, queryByRole } = mountPanel({
      phase: "syncing",
      transfer: { direction: "up", name: "note-7", doneItems: 2, totalItems: 12 },
    });
    expect(getByText("Backing up…")).toBeTruthy();
    expect(getByText(/3 of 12/)).toBeTruthy();
    expect(getByText("Title:note-7")).toBeTruthy();
    // No "Back up now" / "Sync now" while it's already working.
    expect(queryByRole("button", { name: /Back up now|Sync now/ })).toBeNull();
  });

  it("disconnected shows the first-time pitch + Connect", () => {
    const { getByText, getByRole, fns } = mountPanel({ phase: "disconnected", account: null, quota: null });
    expect(getByText("Back up your thoughts.")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Connect OneDrive" }));
    expect(fns.connect).toHaveBeenCalled();
  });

  it("conflicts lists the note and keeps the local copy on request", () => {
    const { getByText, getByRole, fns } = mountPanel({
      phase: "conflicts",
      conflicts: [{ noteId: "n1", reason: "both-changed" }],
    });
    expect(getByText("Title:n1")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Keep this device/ }));
    expect(fns.keepLocal).toHaveBeenCalledWith("n1");
  });
});
