import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TimelinePanel } from "./TimelinePanel";
import type { TimelineEntry } from "../lib/types";

const NOTE = "n1";
function seedTimeline(entries: TimelineEntry[]) {
  localStorage.setItem("pensieve:timeline:" + NOTE, JSON.stringify(entries));
}

const base = { noteTitle: "T", reloadKey: 0, onClose: () => {} };

const entries: TimelineEntry[] = [
  { ts: 100, wordDelta: 5, created: true, markdown: "v1 body" },
  { ts: 200, wordDelta: 3, markdown: "v2 body" },
  { ts: 300, wordDelta: 2, markdown: "v3 body" }, // newest
];

describe("TimelinePanel — version navigation", () => {
  beforeEach(() => localStorage.clear());

  it("clicking a historic moment asks the parent to show that version (not the panel)", async () => {
    seedTimeline(entries);
    const onPreview = vi.fn();
    render(
      <TimelinePanel
        noteId={NOTE}
        previewTs={null}
        onPreview={onPreview}
        onRestore={() => {}}
        {...base}
      />,
    );

    fireEvent.click((await screen.findByText("+5 words")).closest("button")!);
    expect(onPreview).toHaveBeenCalledWith(entries[0]);
    // Nothing renders inline in the panel — the main page shows it.
    expect(screen.queryByText("v1 body")).not.toBeInTheDocument();
  });

  it("clicking the newest moment returns to the live note (preview → null)", async () => {
    seedTimeline(entries);
    const onPreview = vi.fn();
    render(
      <TimelinePanel
        noteId={NOTE}
        previewTs={200}
        onPreview={onPreview}
        onRestore={() => {}}
        {...base}
      />,
    );
    fireEvent.click((await screen.findByText("+2 words")).closest("button")!);
    expect(onPreview).toHaveBeenCalledWith(null);
  });

  it("offers Restore only on the highlighted historic record, never on the newest", async () => {
    seedTimeline(entries);
    // Viewing v1 (historic) → Restore shows.
    const { rerender } = render(
      <TimelinePanel
        noteId={NOTE}
        previewTs={100}
        onPreview={() => {}}
        onRestore={() => {}}
        {...base}
      />,
    );
    expect(await screen.findByText("Restore")).toBeInTheDocument();

    // Viewing live (newest highlighted) → no Restore anywhere.
    rerender(
      <TimelinePanel
        noteId={NOTE}
        previewTs={null}
        onPreview={() => {}}
        onRestore={() => {}}
        {...base}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText("Restore")).not.toBeInTheDocument();
    });
  });

  it("legacy entries without a snapshot are not selectable", async () => {
    seedTimeline([{ ts: 100, wordDelta: 5 }]); // no markdown
    const onPreview = vi.fn();
    render(
      <TimelinePanel
        noteId={NOTE}
        previewTs={null}
        onPreview={onPreview}
        onRestore={() => {}}
        {...base}
      />,
    );
    const btn = (await screen.findByText("+5 words")).closest("button")!;
    expect(btn).toBeDisabled();
  });
});
