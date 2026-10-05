import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "./App";

function seed(id: string, title: string) {
  const now = Date.now();
  localStorage.setItem(
    "pensieve:note:" + id,
    JSON.stringify({
      id,
      title,
      markdown: `# ${title}\n\nbody`,
      createdAt: now,
      addedAt: now,
      updatedAt: now,
      categories: [],
      tags: [],
      links: [],
      pinned: false,
    }),
  );
}

// Smoke test: the whole component tree composes, the empty state shows, and ⌘N
// opens the editor surface. The BlockNote editor relies on layout/DOM APIs jsdom
// doesn't provide, so we mock it to a marker here; its Markdown round-trip is
// covered by lib/md/extended*.test.ts and verified by running the real app.
vi.mock("./components/Editor", () => ({
  Editor: () => <div data-testid="editor" />,
}));

describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("renders the gallery empty state and creates a note on ⌘N", async () => {
    render(<App />);
    expect(await screen.findByText(/no memories yet/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId("editor")).toBeInTheDocument();
    });
  });

  it("⌘-clicks a gallery flask into a background tab and closes it with X", async () => {
    seed("a", "Alpha note");
    seed("b", "Beta note");
    render(<App />);

    // Home is always present; no tabs yet.
    expect(await screen.findByLabelText("Home — your work")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();

    // ⌘-click a gallery flask opens it in a background tab.
    const betaRow = await screen.findByText("Beta note");
    fireEvent.click(betaRow, { metaKey: true });

    const tab = await screen.findByRole("tab");
    expect(tab).toHaveTextContent("Beta note");

    // X closes the tab.
    fireEvent.click(within(tab).getByLabelText("Close tab"));
    await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
  });
});
