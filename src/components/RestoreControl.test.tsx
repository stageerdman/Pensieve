import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RestoreControl } from "./RestoreControl";

// Timers drive the arm-revert and the 2s hold; fake them so the flow is deterministic.
describe("RestoreControl — click to arm, hold 2s to confirm", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a single click only arms it (turns into 'Hold me'), never restores", () => {
    const onConfirm = vi.fn();
    render(<RestoreControl onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore"));
    expect(screen.getByText("Hold me")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms only after holding for the full 2s", () => {
    const onConfirm = vi.fn();
    render(<RestoreControl onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore"));

    const hold = screen.getByText("Hold me");
    fireEvent.pointerDown(hold);
    act(() => void vi.advanceTimersByTime(1999));
    expect(onConfirm).not.toHaveBeenCalled(); // not yet
    act(() => void vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledTimes(1); // at 2s
  });

  it("releasing early cancels the hold — no restore", () => {
    const onConfirm = vi.fn();
    render(<RestoreControl onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Restore"));

    const hold = screen.getByText("Hold me");
    fireEvent.pointerDown(hold);
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.pointerUp(hold); // let go at 1s
    act(() => void vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disarms back to 'Restore' if armed but never engaged within 2s", () => {
    render(<RestoreControl onConfirm={() => {}} />);
    fireEvent.click(screen.getByText("Restore"));
    expect(screen.getByText("Hold me")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByText("Restore")).toBeInTheDocument();
    expect(screen.queryByText("Hold me")).not.toBeInTheDocument();
  });
});
