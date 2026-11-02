import { describe, it, expect, vi, afterEach } from "vitest";
import { offerSaveToPhotos } from "./saveToPhotos";

const file = new File(["x"], "clip.mov", { type: "video/quicktime" });

afterEach(() => {
  (navigator as Partial<Navigator>).share = undefined;
  (navigator as Partial<Navigator>).canShare = undefined;
});

describe("offerSaveToPhotos", () => {
  it("does nothing when the Web Share API isn't available (never throws)", async () => {
    await expect(offerSaveToPhotos(file)).resolves.toBeUndefined();
  });

  it("skips when canShare says the payload isn't shareable", async () => {
    const share = vi.fn();
    navigator.share = share;
    navigator.canShare = () => false;
    await offerSaveToPhotos(file);
    expect(share).not.toHaveBeenCalled();
  });

  it("calls navigator.share with the file when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    navigator.canShare = () => true;
    await offerSaveToPhotos(file);
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });

  it("swallows a dismissed share sheet (AbortError) without throwing", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    navigator.share = share;
    await expect(offerSaveToPhotos(file)).resolves.toBeUndefined();
  });
});
