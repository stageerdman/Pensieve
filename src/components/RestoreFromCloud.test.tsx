import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RestoreFromCloud } from "./RestoreFromCloud";

// The destructive escape hatch is a two-tap affair: the text only ARMS a confirm;
// nothing is wiped until the explicit "Restore from cloud" is pressed. Timers drive
// the auto-disarm, so fake them for determinism.
describe("RestoreFromCloud — click to arm, confirm to restore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("the first click only reveals the confirm, never restores", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    expect(screen.getByText("Restore from cloud")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirming fires onConfirm exactly once", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    fireEvent.click(screen.getByText("Restore from cloud"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Cancel backs out with no restore", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Restore everything from cloud")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("auto-disarms if the confirm is left untouched", () => {
    const onConfirm = vi.fn();
    render(<RestoreFromCloud onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore everything from cloud"));
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByText("Restore everything from cloud")).toBeInTheDocument();
    expect(screen.queryByText("Restore from cloud")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
