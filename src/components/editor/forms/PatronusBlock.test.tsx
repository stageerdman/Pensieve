import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PatronusView } from "./PatronusBlock";
import { PatronusTrigger } from "../../../features/assistant/PatronusTrigger";
import { DEFAULT_SPELL } from "../../../lib/packages/kinds";

describe("the Patronus block in a form", () => {
  it("fixed label, the default spell as placeholder, edits the instruction", () => {
    const updateBlock = vi.fn();
    render(<PatronusView block={{ id: "b1", props: { instruction: "" } }} editor={{ isEditable: true, updateBlock }} />);
    expect(screen.getByText("Patronus · on sync")).toBeTruthy();
    const box = screen.getByLabelText("Patronus sync spell") as HTMLTextAreaElement;
    expect(box.placeholder).toBe(DEFAULT_SPELL.form);
    fireEvent.change(box, { target: { value: "I speak English." } });
    expect(updateBlock).toHaveBeenCalledWith("b1", { props: { instruction: "I speak English." } });
  });
  it("two orbs on one page don't share SVG defs (block + trigger)", () => {
    const { container } = render(
      <>
        <PatronusTrigger onOpen={() => {}} />
        <PatronusView block={{ id: "b1", props: { instruction: "x" } }} editor={{ isEditable: false, updateBlock: () => {} }} />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient")].map((g) => g.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});
