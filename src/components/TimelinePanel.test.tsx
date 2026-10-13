import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TimelinePanel } from "./TimelinePanel";
import type { TimelineEntry } from "../lib/types";

// NotePreview renders through BlockNote (needs DOM APIs jsdom lacks), so mock it to a
// marker — same approach App.test uses for the Editor. We're testing the panel's
// version/restore behaviour, not the markdown renderer (covered elsewhere).
vi.mock("../features/gallery/NotePreview", () => ({
  NotePreview: ({ markdown }: { markdown: string }) => (
    <div data-testid="preview">{markdown}</div>
  ),
}));

const NOTE = "n1";
function seedTimeline(entries: TimelineEntry[]) {
  localStorage.setItem("pensieve:timeline:" + NOTE, JSON.stringify(entries));
}

const base = { noteTitle: "T", theme: "light" as const, reloadKey: 0, onClose: () => {} };

describe("TimelinePanel — versioning", () => {
  beforeEach(() => localStorage.clear());

  const entries: TimelineEntry[] = [
    { ts: 100, wordDelta: 5, created: true, markdown: "v1 body" },
    { ts: 200, wordDelta: 3, markdown: "v2 body" },
    { ts: 300, wordDelta: 2, markdown: "v3 body" }, // newest → Current
  ];

  it("expands an older moment to its snapshot and offers Restore", async () => {
    seedTimeline(entries);
    render(<TimelinePanel noteId={NOTE} onRestore={() => {}} {...base} />);

    const row = await screen.findByText("+5 words");
    fireEvent.click(row.closest("button")!);

    expect(screen.getByTestId("preview")).toHaveTextContent("v1 body");
    expect(screen.getByText("Restore this version")).toBeInTheDocument();
    expect(screen.getByText("Newer versions will be deleted")).toBeInTheDocument();
  });

  it("marks the newest moment Current and gives it no Restore", async () => {
    seedTimeline(entries);
    render(<TimelinePanel noteId={NOTE} onRestore={() => {}} {...base} />);

    expect(await screen.findByText("Current")).toBeInTheDocument();
    fireEvent.click(screen.getByText("+2 words").closest("button")!);

    // Current expands to show content for reference, but offers no restore.
    expect(screen.getByTestId("preview")).toHaveTextContent("v3 body");
    expect(screen.queryByText("Restore this version")).not.toBeInTheDocument();
  });

  it("requires a second click to confirm, naming how many newer versions drop", async () => {
    seedTimeline(entries);
    const onRestore = vi.fn();
    render(<TimelinePanel noteId={NOTE} onRestore={onRestore} {...base} />);

    fireEvent.click((await screen.findByText("+5 words")).closest("button")!); // expand v1
    fireEvent.click(screen.getByText("Restore this version")); // arm

    // v1 has two newer versions (v2, v3).
    const confirm = screen.getByText("Restore — deletes 2 newer");
    expect(confirm).toBeInTheDocument();
    expect(onRestore).not.toHaveBeenCalled(); // arming alone does not restore

    fireEvent.click(confirm); // commit
    expect(onRestore).toHaveBeenCalledWith(100);
  });

  it("does not expand legacy entries that have no snapshot", async () => {
    seedTimeline([{ ts: 100, wordDelta: 5 }]); // no markdown
    render(<TimelinePanel noteId={NOTE} onRestore={() => {}} {...base} />);

    const row = await screen.findByText("+5 words");
    fireEvent.click(row.closest("button")!);
    await waitFor(() => {
      expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
    });
  });
});
