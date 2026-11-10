// Reel.test.tsx — locks in the fix for a real bug report: a Raw Memory batch's card
// was rendered as a separate flex:none strip ABOVE .reel (fixed in place, never
// scrolling with the feed). It must render as a .slot INSIDE the same .reel-track as
// every note card, or useReelFisheye's generic ".slot child" magnification won't see
// it either.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createRef } from "react";
import { Reel } from "./Reel";
import type { Note } from "../../types";
import type { RawMemory } from "../../lib/media/rawMemoryStore";

afterEach(cleanup);

const note = (id: string): Note => ({
  id,
  t: "Title",
  c: "Body",
  cat: "default",
  shape: "round",
  fill: 0.5,
  d: "Today",
  created: "Today",
  createdAt: 1,
  updatedAt: 1,
});

const batch = (id: string): RawMemory => ({ id, status: "synced", createdAt: 1, pages: ["media/x/a.jpg"] });

describe("Reel — Raw Memory batches scroll with everything else", () => {
  it("renders a raw batch's card as a .slot inside the SAME .reel-track as note cards, not a sibling outside .reel", () => {
    const reelRef = createRef<HTMLDivElement>();
    const trackRef = createRef<HTMLDivElement>();
    const { container } = render(
      <Reel
        view={[note("n1")]}
        rawBatches={[batch("r1")]}
        queryText=""
        onOpen={() => {}}
        onOpenRaw={() => {}}
        reelRef={reelRef}
        trackRef={trackRef}
      />,
    );

    const reel = container.querySelector(".reel");
    const track = container.querySelector(".reel-track");
    expect(reel).not.toBeNull();
    expect(track).not.toBeNull();

    // Both the raw card's slot AND the note card's slot live inside .reel-track —
    // there is no sibling "strip" element outside .reel at all.
    const slotsInTrack = track!.querySelectorAll(".slot");
    expect(slotsInTrack).toHaveLength(2);
    expect(track!.querySelector('[data-id="raw-r1"]')).not.toBeNull();
    expect(track!.querySelector('[data-id="n1"]')).not.toBeNull();

    // No "ph-journal-home-strip" (the old fixed-outside-the-scroller element) exists.
    expect(container.querySelector(".ph-journal-home-strip")).toBeNull();
  });

  it("renders nothing extra when there are no raw batches", () => {
    const reelRef = createRef<HTMLDivElement>();
    const trackRef = createRef<HTMLDivElement>();
    const { container } = render(
      <Reel view={[note("n1")]} queryText="" onOpen={() => {}} reelRef={reelRef} trackRef={trackRef} />,
    );
    expect(container.querySelectorAll(".slot")).toHaveLength(1);
  });
});
