// MediaImg.test.tsx — locks in a real bug report: the Journal detail screen showed no
// photos at all when opened after the in-memory url cache had gone cold (a fresh page
// load, or a page pulled down by sync) — the old code only called the synchronous,
// cache-only `cachedMediaUrl`, with no IndexedDB fallback. This proves MediaImg
// upgrades from nothing to a resolved url once the async lookup finishes.

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaImg } from "./MediaImg";

vi.mock("../../lib/media/mediaStore", () => ({
  cachedMediaUrl: vi.fn(() => null),
  resolveMediaUrl: vi.fn(() => Promise.resolve("blob:resolved-from-idb")),
}));

afterEach(cleanup);

describe("MediaImg", () => {
  it("renders with no src while the cache is cold, then upgrades once resolveMediaUrl settles", async () => {
    const { container } = render(<MediaImg mediaRef="media/r1/a.jpg" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBeNull();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(img.getAttribute("src")).toBe("blob:resolved-from-idb");
  });

  it("uses the cached url synchronously when one is already warm, no flash of empty src", async () => {
    const { cachedMediaUrl } = await import("../../lib/media/mediaStore");
    vi.mocked(cachedMediaUrl).mockReturnValue("blob:already-cached");
    const { container } = render(<MediaImg mediaRef="media/r1/a.jpg" />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("blob:already-cached");
  });
});
