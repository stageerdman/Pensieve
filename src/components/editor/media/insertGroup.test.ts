import { describe, it, expect, beforeAll, vi } from "vitest";
import { createGroupFromFiles, mergeFilesIntoBlock, insertImagesSmart, mergeMediaBlocksInto, imagesOfMediaBlock, type GroupEditor, type MergeEditor } from "./insertGroup";
import { parseGalleryImages } from "../../../lib/md/gallery";

// The emergent-creation orchestration above the single-image funnel. We assert the BLOCK
// SHAPE each gesture produces (group vs merge vs single, promote, tile count) against a
// fake editor; the background byte-save is best-effort (no media backend in jsdom).

beforeAll(() => {
  if (!URL.createObjectURL) URL.createObjectURL = () => "blob:stub";
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:local");
});

function fakeEditor(doc: GroupEditor["document"] = []) {
  const calls: { insert: unknown[][]; update: Array<[string, unknown]> } = { insert: [], update: [] };
  let counter = 0;
  const editor: GroupEditor = {
    document: doc,
    insertBlocks: (blocks, ref, placement) => {
      calls.insert.push([blocks, ref, placement]);
      return [{ id: `new-${++counter}` }];
    },
    updateBlock: (id, update) => calls.update.push([id as string, update]),
    getTextCursorPosition: () => ({ block: { id: "cursor" } }),
  };
  return { editor, calls };
}

const png = (name: string) => new File([new Uint8Array([1])], name, { type: "image/png" });

describe("createGroupFromFiles", () => {
  it("inserts one imageGroup with a saving tile per file, in order", async () => {
    const { editor, calls } = fakeEditor();
    await createGroupFromFiles(editor, "n1", [png("a.png"), png("b.png"), png("c.png")], "anchor");
    const [blocks, ref, placement] = calls.insert[0] as [Array<{ type: string; props: { images: string } }>, string, string];
    expect(blocks[0].type).toBe("imageGroup");
    expect(ref).toBe("anchor");
    expect(placement).toBe("after");
    const images = parseGalleryImages(blocks[0].props.images);
    expect(images).toHaveLength(3);
    expect(images.every((i) => i.saving)).toBe(true); // partial-upload state: every tile saving
  });
});

describe("mergeFilesIntoBlock", () => {
  it("promotes a single image → an imageGroup (existing first, new appended)", async () => {
    const { editor, calls } = fakeEditor([
      { id: "img", type: "image", props: { url: "media/n1/old.png", caption: "kept" } },
    ]);
    await mergeFilesIntoBlock(editor, "n1", [png("new.png")], "img");
    const [id, update] = calls.update[0] as [string, { type: string; props: { images: string } }];
    expect(id).toBe("img");
    expect(update.type).toBe("imageGroup"); // promoted
    const images = parseGalleryImages(update.props.images);
    expect(images[0]).toMatchObject({ url: "media/n1/old.png", caption: "kept" }); // existing preserved
    expect(images[1].saving).toBe(true); // new tile appended, saving
    expect(images).toHaveLength(2);
  });

  it("appends to an existing imageGroup", async () => {
    const { editor, calls } = fakeEditor([
      { id: "grp", type: "imageGroup", props: { images: JSON.stringify([{ url: "media/n1/a.png" }, { url: "media/n1/b.png" }]) } },
    ]);
    await mergeFilesIntoBlock(editor, "n1", [png("c.png"), png("d.png")], "grp");
    const update = (calls.update[0] as [string, { type: string; props: { images: string } }])[1];
    expect(update.type).toBe("imageGroup");
    expect(parseGalleryImages(update.props.images)).toHaveLength(4);
  });
});

describe("mergeMediaBlocksInto (drag a row ONTO a gallery)", () => {
  function fakeMergeEditor(blocks: Record<string, { id: string; type?: string; props?: Record<string, unknown> }>) {
    const removed: string[] = [];
    const updates: Array<[string, { type?: string; props?: { images?: string } }]> = [];
    const editor: MergeEditor = {
      getBlock: (id) => blocks[id],
      updateBlock: (id, update) => updates.push([id, update as { type?: string; props?: { images?: string } }]),
      removeBlocks: (ids) => removed.push(...ids),
    };
    return { editor, removed, updates };
  }

  it("imagesOfMediaBlock turns an audio block into a kind:audio tile (reusing its url)", () => {
    const tiles = imagesOfMediaBlock({ type: "audio", props: { url: "media/n1/memo.m4a", caption: "" } });
    expect(tiles).toEqual([{ url: "media/n1/memo.m4a", caption: "", kind: "audio" }]);
  });

  it("merges an audio row into a gallery as an audio tile, then removes the source", () => {
    const { editor, removed, updates } = fakeMergeEditor({
      grp: { id: "grp", type: "imageGroup", props: { images: JSON.stringify([{ url: "media/n1/a.png" }]) } },
      aud: { id: "aud", type: "audio", props: { url: "media/n1/memo.m4a" } },
    });
    expect(mergeMediaBlocksInto(editor, "grp", ["aud"])).toBe(true);
    const images = parseGalleryImages(updates[0][1].props!.images!);
    expect(images).toHaveLength(2);
    expect(images[1]).toMatchObject({ url: "media/n1/memo.m4a", kind: "audio" }); // appended as audio
    expect(removed).toEqual(["aud"]); // source row consumed
  });

  it("returns false (no-op) when a dragged audio row has no saved url yet", () => {
    const { editor } = fakeMergeEditor({
      grp: { id: "grp", type: "imageGroup", props: { images: "[]" } },
      aud: { id: "aud", type: "audio", props: { url: "" } },
    });
    expect(mergeMediaBlocksInto(editor, "grp", ["aud"])).toBe(false);
  });
});

describe("insertImagesSmart (plan → dispatch)", () => {
  it("2+ files at a plain paragraph → a new group", async () => {
    const { editor, calls } = fakeEditor([{ id: "cursor", type: "paragraph" }]);
    await insertImagesSmart(editor, "n1", [png("a.png"), png("b.png")], null);
    const inserted = (calls.insert[0] as [Array<{ type: string }>])[0][0];
    expect(inserted.type).toBe("imageGroup");
  });

  it("1 file dropped onto an existing image → merge (promote)", async () => {
    const { editor, calls } = fakeEditor([{ id: "img", type: "image", props: { url: "media/n1/x.png" } }]);
    await insertImagesSmart(editor, "n1", [png("a.png")], "img");
    expect((calls.update[0] as [string, { type: string }])[1].type).toBe("imageGroup");
    expect(calls.insert).toHaveLength(0); // merged, not inserted anew
  });

  it("1 file at an isolated paragraph → a single image block", async () => {
    const { editor, calls } = fakeEditor([
      { id: "t", type: "paragraph" },
      { id: "cursor", type: "paragraph" },
    ]);
    await insertImagesSmart(editor, "n1", [png("a.png")], null);
    const inserted = (calls.insert[0] as [Array<{ type: string }>])[0][0];
    expect(inserted.type).toBe("image");
  });
});
