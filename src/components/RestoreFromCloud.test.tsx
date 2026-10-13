import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RestoreFromCloud } from "./RestoreFromCloud";

// Accident-proof by design: the SAME line takes two clicks. The first only arms it
// ("Are you sure?"); only a second click restores. If left alone it reverts after 5s.
// Fake timers so the revert is deterministic.
describe("RestoreFromCloud — two clicks on one line, 5s auto-revert", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the first click only arms it (turns into 'Are you sure?'), never restores", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a second click on 'Are you sure?' restores exactly once", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    fireEvent.click(screen.getByText("Are you sure?"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // settles back to the resting label
    expect(screen.getByText("Restore everything from cloud")).toBeInTheDocument();
  });

  it("reverts to the resting label after 5s if the second click never comes", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    act(() => void vi.advanceTimersByTime(4999));
    expect(screen.getByText("Are you sure?")).toBeInTheDocument(); // not yet
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText("Restore everything from cloud")).toBeInTheDocument();
    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
