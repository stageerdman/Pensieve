import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useDismiss } from "./useDismiss";

afterEach(cleanup);

function Harness(props: {
  onDismiss: () => void;
  enabled?: boolean;
  onEscape?: () => void;
}) {
  const ref = useDismiss<HTMLDivElement>(props.onDismiss, {
    enabled: props.enabled,
    onEscape: props.onEscape,
  });
  return (
    <div>
      <div ref={ref} data-testid="inside">
        <button data-testid="child">child</button>
      </div>
      <button data-testid="outside">outside</button>
    </div>
  );
}

describe("useDismiss", () => {
  it("fires on mousedown outside the ref, not inside it", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.mouseDown(getByTestId("child"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("fires on Escape", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} enabled={false} />);
    fireEvent.mouseDown(getByTestId("outside"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("routes Escape to onEscape when provided (leaving outside-click on onDismiss)", () => {
    const onDismiss = vi.fn();
    const onEscape = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} onEscape={onEscape} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
