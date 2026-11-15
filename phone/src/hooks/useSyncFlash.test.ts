import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSyncFlash } from "./useSyncFlash";
import type { SyncStatus } from "../lib/wand/syncMachine";

describe("useSyncFlash", () => {
  it("shows a brief green flash right after a sync finishes, then rests", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ s }: { s: SyncStatus }) => useSyncFlash(s, 1000), { initialProps: { s: "synced" as SyncStatus } });
    expect(result.current).toBe("synced"); // no flash on mount
    rerender({ s: "syncing" });
    expect(result.current).toBe("syncing");
    rerender({ s: "synced" });
    expect(result.current).toBe("flash");
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe("synced");
    vi.useRealTimers();
  });

  it("no flash when a sync fails", () => {
    const { result, rerender } = renderHook(({ s }: { s: SyncStatus }) => useSyncFlash(s), { initialProps: { s: "syncing" as SyncStatus } });
    rerender({ s: "failed" });
    expect(result.current).toBe("failed");
  });
});
