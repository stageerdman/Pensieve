import { describe, expect, it, vi, afterEach } from "vitest";
import { handleImagePaste, setImageDropHandlers } from "./imagePasteDrop";

// A minimal ClipboardEvent: jsdom has no DataTransfer, so fake the slice we read.
function pasteEvent(files: File[], itemFiles: File[] = [], types: string[] = ["Files"]) {
  const preventDefault = vi.fn();
  const clipboardData = {
    types,
    files,
    items: itemFiles.map((f) => ({ kind: "file", getAsFile: () => f })),
  };
  return { event: { clipboardData, preventDefault } as unknown as ClipboardEvent, preventDefault };
}

afterEach(() => setImageDropHandlers(null, null));

describe("handleImagePaste (⌘V an image)", () => {
  it("takes a copied image FILE (Finder ⌘C) and inserts it at the cursor", () => {
    const onFiles = vi.fn();
    setImageDropHandlers(onFiles, null);
    const png = new File(["x"], "shot.png", { type: "image/png" });
    const { event, preventDefault } = pasteEvent([png]);
    expect(handleImagePaste(event)).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(onFiles).toHaveBeenCalledWith([png], null);
  });

  it("takes a clipboard screenshot that only arrives in `items`", () => {
    const onFiles = vi.fn();
    setImageDropHandlers(onFiles, null);
    const png = new File(["x"], "image.png", { type: "image/png" });
    expect(handleImagePaste(pasteEvent([], [png]).event)).toBe(true);
    expect(onFiles).toHaveBeenCalledWith([png], null);
  });

  it("leaves text paste to BlockNote's default handler", () => {
    const onFiles = vi.fn();
    setImageDropHandlers(onFiles, null);
    expect(handleImagePaste(pasteEvent([], [], ["text/plain"]).event)).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
