import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ToolPicker } from "./ToolPicker";

const WEB = { id: "web", label: "Web search", description: "Search the web." };

afterEach(cleanup);

function mount(enabled: string[], available = [WEB]) {
  const onChange = vi.fn();
  const r = render(
    <ToolPicker available={available} enabled={enabled} onChange={onChange} />,
  );
  return { ...r, onChange };
}

describe("ToolPicker", () => {
  it("renders nothing when the registry has no tools", () => {
    const { container } = mount([], []);
    expect(container.firstChild).toBeNull();
  });

  it("off: a quiet Tools button; the list switches web on", () => {
    const r = mount([]);
    expect(r.queryByText("Web")).toBeNull();
    fireEvent.click(r.getByLabelText("Tools"));
    const sw = r.getByRole("switch", { name: /Web search/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(r.onChange).toHaveBeenCalledWith(["web"]);
  });

  it("on: shows a Web pill, and × switches it off in one click", () => {
    const r = mount(["web"]);
    expect(r.getByText("Web")).toBeTruthy();
    fireEvent.click(r.getByLabelText("Turn off Web search"));
    expect(r.onChange).toHaveBeenCalledWith([]);
  });

  it("on: the list shows the switch checked, and toggling turns it off", () => {
    const r = mount(["web"]);
    fireEvent.click(r.getByLabelText("Tools: Web search on"));
    const sw = r.getByRole("switch", { name: /Web search/ });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(r.onChange).toHaveBeenCalledWith([]);
  });

  it("Escape closes the list", () => {
    const r = mount([]);
    fireEvent.click(r.getByLabelText("Tools"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(r.queryByRole("switch")).toBeNull();
  });
});
