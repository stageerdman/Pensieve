import { describe, it, expect } from "vitest";
import { describeTransfer } from "./deriveSyncView";

describe("describeTransfer", () => {
  it("labels a note transfer with a plain count and the note id", () => {
    expect(describeTransfer({ direction: "up", name: "n1", doneItems: 2, totalItems: 9 })).toEqual({ count: "3 of 9", subject: "n1" });
  });
  it("labels media as its own stage and names the note it belongs to", () => {
    expect(
      describeTransfer({ direction: "up", name: "media/n7/clip.mov", doneItems: 0, totalItems: 81, stage: "media" }),
    ).toEqual({ count: "Media · 1 of 81", subject: "n7" });
  });
});
