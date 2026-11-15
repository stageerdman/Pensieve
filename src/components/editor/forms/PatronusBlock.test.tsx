import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PatronusView } from "./PatronusBlock";
import { PatronusTrigger } from "../../../features/assistant/PatronusTrigger";
import { DEFAULT_SPELL } from "../../../lib/packages/kinds";
import { SPELLS } from "../../../lib/packages/patronus";

describe("the Patronus block in a form", () => {
  it("'Patronus' + a spell picker; the spell's default as placeholder; edits the instruction", () => {
    const updateBlock = vi.fn();
    render(<PatronusView block={{ id: "b1", props: { spell: "sync", instruction: "" } }} editor={{ isEditable: true, updateBlock }} />);
    expect(screen.getByText("Patronus")).toBeTruthy();
    const picker = screen.getByLabelText("Spell") as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual(["Process on sync", "Compress"]);
    expect(picker.value).toBe("sync");
    const box = screen.getByLabelText("Patronus Process on sync spell") as HTMLTextAreaElement;
    expect(box.placeholder).toBe(DEFAULT_SPELL.form);
    fireEvent.change(box, { target: { value: "I speak English." } });
    expect(updateBlock).toHaveBeenCalledWith("b1", { props: { instruction: "I speak English." } });
    fireEvent.change(picker, { target: { value: "compress" } });
    expect(updateBlock).toHaveBeenLastCalledWith("b1", { props: { spell: "compress" } });
  });
  it("a Compress spell shows its own placeholder", () => {
    render(<PatronusView block={{ id: "b2", props: { spell: "compress", instruction: "" } }} editor={{ isEditable: true, updateBlock: () => {} }} />);
    const box = screen.getByLabelText("Patronus Compress spell") as HTMLTextAreaElement;
    expect(box.placeholder).toBe(SPELLS.find((s) => s.id === "compress")!.placeholder);
  });
  it("two orbs on one page don't share SVG defs (block + trigger)", () => {
    const { container } = render(
      <>
        <PatronusTrigger onOpen={() => {}} />
        <PatronusView block={{ id: "b1", props: { spell: "sync", instruction: "x" } }} editor={{ isEditable: false, updateBlock: () => {} }} />
      </>,
    );
    const ids = [...container.querySelectorAll("radialGradient")].map((g) => g.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });
});
