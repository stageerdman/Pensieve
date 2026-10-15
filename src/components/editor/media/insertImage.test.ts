import { describe, it, expect, vi, beforeAll } from "vitest";
import { extForFile, insertImageFromFile, type InsertEditor } from "./insertImage";
import { DEFAULT_IMAGE_WIDTH } from "../../../lib/md/image";

// The single insert funnel: every entry point inserts an image block showing a local
// object url instantly (the "saving" state), then swaps to the saved url in the
// background. Here we verify the block is inserted with the right shape; the background
// persist is best-effort (no media backend in jsdom).

beforeAll(() => {
  // jsdom has no object-URL support.
  if (!URL.createObjectURL) URL.createObjectURL = () => "blob:stub";
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
});

function fakeEditor() {
  const calls: { insert: unknown[][]; update: Array<[unknown, unknown]> } = { insert: [], update: [] };
  const editor: InsertEditor = {
    insertBlocks: (blocks, ref, placement) => {
      calls.insert.push([blocks, ref, placement]);
      return [{ id: "img-1" }];
    },
    updateBlock: (id, update) => {
      calls.update.push([id, update]);
    },
    getTextCursorPosition: () => ({ block: { id: "cursor-block" } }),
  };
  return { editor, calls };
}

describe("extForFile", () => {
  it("prefers the filename extension", () => {
    expect(extForFile(new File([], "photo.JPG", { type: "image/jpeg" }))).toBe("jpg");
  });
  it("falls back to the mime type", () => {
    expect(extForFile(new File([], "clipboard", { type: "image/png" }))).toBe("png");
    expect(extForFile(new Blob([], { type: "image/webp" }))).toBe("webp");
  });
  it("defaults to png for an unknown type", () => {
    expect(extForFile(new Blob([], { type: "application/octet-stream" }))).toBe("png");
  });
});

describe("insertImageFromFile", () => {
  it("inserts one image block in the saving state at the given reference", async () => {
    const { editor, calls } = fakeEditor();
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const spy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-1");

    const id = await insertImageFromFile(editor, "note1", file, "ref-block", "after");
    expect(id).toBe("img-1");

    const [blocks, ref, placement] = calls.insert[0] as [Array<{ type: string; props: Record<string, unknown> }>, string, string];
    expect(blocks[0].type).toBe("image");
    expect(blocks[0].props).toMatchObject({ url: "blob:local-1", status: "saving", width: DEFAULT_IMAGE_WIDTH, caption: "" });
    expect(ref).toBe("ref-block");
    expect(placement).toBe("after");
    spy.mockRestore();
  });

  it("falls back to the text-cursor block when no reference is given", async () => {
    const { editor, calls } = fakeEditor();
    const file = new File([new Uint8Array([1])], "y.png", { type: "image/png" });
    await insertImageFromFile(editor, "note1", file);
    expect(calls.insert[0][1]).toBe("cursor-block");
  });
});
