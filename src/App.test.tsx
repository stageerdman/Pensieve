import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

// Smoke test: the whole component tree composes, the empty state shows, and ⌘N
// opens the editor surface. The BlockNote editor relies on layout/DOM APIs jsdom
// doesn't provide, so we mock it to a marker here; its Markdown round-trip is
// covered by lib/md/extended*.test.ts and verified by running the real app.
vi.mock("./components/Editor", () => ({
  Editor: () => <div data-testid="editor" />,
}));

describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("renders the empty state and creates a note on ⌘N", async () => {
    render(<App />);
    expect(await screen.findByText(/start writing/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId("editor")).toBeInTheDocument();
    });
  });
});
