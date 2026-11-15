import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PackageDetailScreen } from "./PackageDetailScreen";
import { RawMemoryCard } from "../reel/RawMemoryCard";
import { conditionalSpells } from "../../lib/spells/registry";
import type { RawMemory } from "../../lib/media/rawMemoryStore";

const pkg: RawMemory = {
  id: "p1", status: "synced", createdAt: 1, pages: [], kind: "form", title: "Daily Review — Fri 13 Nov", fromForm: "f",
  markdown: "Daily Review — Fri 13 Nov\n\n**Was I a king?**\n\nMostly.\n\n```pensieve:patronus\nspell: sync\nTranscribe the recording and fill in the form from it.\n```",
};

describe("a sealed form package on the phone", () => {
  it("the reel card shows the form's name and a plain status (never 'package')", () => {
    render(<RawMemoryCard batch={pkg} onOpen={() => {}} />);
    expect(screen.getByText("Daily Review — Fri 13 Nov")).toBeTruthy();
    expect(screen.getByText("Waiting for the desktop")).toBeTruthy();
    render(<RawMemoryCard batch={{ ...pkg, id: "p2", status: "processing" }} onOpen={() => {}} />);
    expect(screen.getByText("Patronus is working…")).toBeTruthy();
  });

  it("the preview is read-only and ends with the Patronus block + its spell", () => {
    const { container } = render(<PackageDetailScreen batch={pkg} onBack={() => {}} onOpenMenu={() => {}} />);
    const body = container.querySelector(".ph-package-body") as HTMLElement;
    expect(body.getAttribute("contenteditable")).toBe("false");
    expect(body.textContent).toContain("Was I a king?");
    expect(body.textContent).toContain("Mostly.");
    const patronus = body.querySelector(".ph-patronus")!;
    expect(patronus.textContent).toContain("Patronus");
    expect(patronus.textContent).toContain("Transcribe the recording and fill in the form from it.");
    expect(patronus.getAttribute("data-state")).toBe("waiting");
    expect(body.textContent).not.toContain("```");
  });

  it("its only spell is Delete", () => {
    expect(conditionalSpells("package").map((s) => s.id)).toEqual(["raw-delete"]);
  });
});

describe("Patronus fence on the phone", () => {
  it("round-trips byte-for-byte (a form's own spell survives a phone edit of the form)", async () => {
    const { parseNoteContent, serializeBlocks } = await import("../../lib/media/noteMedia");
    const body = "**Q?**\n\n```pensieve:patronus\nspell: sync\nOnly the King question.\nIn English.\n```";
    const blocks = parseNoteContent(body);
    expect(blocks.some((b) => b.kind === "patronus")).toBe(true);
    expect(serializeBlocks(blocks)).toBe(body);
  });
});
