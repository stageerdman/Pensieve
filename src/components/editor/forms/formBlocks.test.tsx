import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScaleView, splitAnchors } from "./ScaleBlock";
import { CharmView } from "./CharmBlock";

const anchors = JSON.stringify(["Delete it", "Noise", "Fine", "Mini high", "Core memory"]);
const editorWith = (isEditable = true) => ({ isEditable, updateBlock: vi.fn() });

describe("ScaleView", () => {
  it("rates on click and clears when the picked point is clicked again", () => {
    const ed = editorWith();
    const { rerender } = render(<ScaleView block={{ id: "b", props: { anchors, value: 0 } }} editor={ed} />);
    fireEvent.click(screen.getByRole("radio", { name: /^4:/ }));
    expect(ed.updateBlock).toHaveBeenLastCalledWith("b", { props: { anchors, value: 4 } });
    rerender(<ScaleView block={{ id: "b", props: { anchors, value: 4 } }} editor={ed} />);
    expect(screen.getByText("Mini high")).toBeTruthy(); // the picked meaning stays beside the row
    fireEvent.click(screen.getByRole("radio", { name: /^4:/ }));
    expect(ed.updateBlock).toHaveBeenLastCalledWith("b", { props: { anchors, value: 0 } });
  });

  it("is read-only when the editor is", () => {
    render(<ScaleView block={{ id: "b", props: { anchors, value: 2 } }} editor={editorWith(false)} />);
    expect((screen.getByRole("radio", { name: /^1:/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Edit points")).toBeNull();
  });

  it("a fresh scale opens its points for editing; pasting lines fills them all", () => {
    const ed = editorWith();
    const blank = JSON.stringify(["", "", "", "", ""]);
    render(<ScaleView block={{ id: "b", props: { anchors: blank, value: 0 } }} editor={ed} />);
    const first = screen.getByLabelText("Meaning of 1");
    fireEvent.paste(first, { clipboardData: { getData: () => "*1: I could delete it\n2: Background noise\n3: Fine*" } });
    expect(ed.updateBlock).toHaveBeenLastCalledWith("b", {
      props: { anchors: JSON.stringify(["I could delete it", "Background noise", "Fine"]), value: 0 },
    });
  });

  it("splitAnchors strips numbering and emphasis", () => {
    expect(splitAnchors("_1. a_\n\n2) b\n3 - c")).toEqual(["a", "b", "c"]);
  });
});

describe("CharmView", () => {
  it("edits the name and prompt", () => {
    const ed = editorWith();
    render(<CharmView block={{ id: "c", props: { name: "", prompt: "" } }} editor={ed} />);
    fireEvent.change(screen.getByLabelText("Charm name"), { target: { value: "Compress" } });
    expect(ed.updateBlock).toHaveBeenLastCalledWith("c", { props: { name: "Compress" } });
    fireEvent.change(screen.getByLabelText("Charm prompt"), { target: { value: "Summarise my week" } });
    expect(ed.updateBlock).toHaveBeenLastCalledWith("c", { props: { prompt: "Summarise my week" } });
  });
});
