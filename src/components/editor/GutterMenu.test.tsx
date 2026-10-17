import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { GutterMenu, type GutterMenuEditor } from "./GutterMenu";

afterEach(cleanup);

function fakeEditor(types: Record<string, string>): GutterMenuEditor & {
  removed: string[][];
  updates: Array<[string, unknown]>;
} {
  const removed: string[][] = [];
  const updates: Array<[string, unknown]> = [];
  return {
    getBlock: (id) => ({ id, type: types[id] }),
    updateBlock: (id, update) => updates.push([id, update]),
    removeBlocks: (ids) => removed.push(ids),
    removed,
    updates,
  };
}

describe("GutterMenu", () => {
  it("Delete removes the selected row(s) and closes", () => {
    const editor = fakeEditor({ a: "paragraph" });
    const onClose = vi.fn();
    render(<GutterMenu x={0} y={0} ids={["a"]} editor={editor} onClose={onClose} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(editor.removed).toEqual([["a"]]);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Change type for a text block → converts to the picked type", () => {
    const editor = fakeEditor({ a: "paragraph" });
    render(<GutterMenu x={0} y={0} ids={["a"]} editor={editor} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Change type")); // open the submenu
    fireEvent.click(screen.getByText("Heading 2"));
    expect(editor.updates).toEqual([["a", { type: "heading", props: { level: 2 } }]]);
  });

  it("hides Change type for a media row (only Delete)", () => {
    const editor = fakeEditor({ g: "imageGroup" });
    render(<GutterMenu x={0} y={0} ids={["g"]} editor={editor} onClose={() => {}} />);
    expect(screen.queryByText("Change type")).toBeNull();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("change type applies to every selected row", () => {
    const editor = fakeEditor({ a: "paragraph", b: "bulletListItem" });
    render(<GutterMenu x={0} y={0} ids={["a", "b"]} editor={editor} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Change type"));
    fireEvent.click(screen.getByText("Text"));
    expect(editor.updates).toEqual([
      ["a", { type: "paragraph" }],
      ["b", { type: "paragraph" }],
    ]);
  });
});
