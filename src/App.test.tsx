import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

// Smoke test: the whole component tree composes and renders, the empty state
// shows, and ⌘N opens an editable surface.
describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("renders the empty state and creates a note on ⌘N", async () => {
    render(<App />);
    expect(await screen.findByText(/start writing/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    await waitFor(() => {
      expect(document.querySelector(".prose-editor")).toBeTruthy();
    });
  });
});
