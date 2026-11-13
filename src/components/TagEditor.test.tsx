import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagEditor } from "./TagEditor";
import { buildSuggestions } from "../lib/tags/vocab";

const suggestions = buildSuggestions(
  [{ name: "@CANI", definition: "daily actions + weekly review" }, { name: "@Sales Mindset" }],
  [],
);

function setup(tags: string[] = []) {
  const onChange = vi.fn();
  const onCreate = vi.fn();
  render(<TagEditor tags={tags} suggestions={suggestions} onChange={onChange} onCreate={onCreate} variant="inline" />);
  const input = screen.getByRole("textbox", { name: "Add a tag" });
  return { onChange, onCreate, input };
}

describe("TagEditor (threads)", () => {
  it("offers the vocabulary with meanings on focus, before typing", () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: /@CANI.*weekly review/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /@Sales Mindset/ })).toBeInTheDocument();
  });

  it("Enter takes the highlighted known thread — a half-typed word never becomes a tag", () => {
    const { input, onChange, onCreate } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "sal" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["@Sales Mindset"]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("a case-variant reuses the existing spelling", () => {
    const { input, onChange, onCreate } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "@cani," } });
    expect(onChange).toHaveBeenCalledWith(["@CANI"]);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("a new name is an explicit 'New tag' row and creates a thread", () => {
    const { input, onChange, onCreate } = setup(["@CANI"]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "@Weekly Review" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /New tag “@Weekly Review”/ }));
    expect(onCreate).toHaveBeenCalledWith("@Weekly Review");
    expect(onChange).toHaveBeenCalledWith(["@CANI", "@Weekly Review"]);
  });
});
