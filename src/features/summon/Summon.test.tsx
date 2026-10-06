import { describe, it, expect, beforeEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { NoteMeta } from "../../lib/types";
import { useSummon } from "../../hooks/useSummon";
import { Summon } from "./Summon";

const NOW = Date.now();
const notes: NoteMeta[] = [
  { id: "a", title: "Summon bar", createdAt: NOW, updatedAt: NOW, tags: ["#walk", "#planning"], categories: ["Execution"] },
  { id: "b", title: "Morning", createdAt: NOW, updatedAt: NOW, tags: ["#mood"], categories: ["Notes & Lessons"] },
];
const CATS = ["Notes & Lessons", "In my mind", "Execution"];

function Harness() {
  const summon = useSummon(notes, CATS);
  const ref = useRef<HTMLInputElement>(null);
  return <Summon summon={summon} inputRef={ref} />;
}

const type = (value: string) => {
  const input = screen.getByPlaceholderText(/summon/i) as HTMLInputElement;
  input.focus();
  fireEvent.change(input, { target: { value, selectionStart: value.length } });
  return input;
};

describe("Summon surface", () => {
  beforeEach(() => localStorage.clear());

  it("suggests a date filter and stacks it as a chip on Enter", async () => {
    render(<Harness />);
    const input = type("last month");
    // suggestion row appears
    expect(await screen.findByText("Created · last month")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    // a chip with the same label is stacked; input cleared
    await waitFor(() => expect(input.value).toBe(""));
    // the chip (a button) now exists
    const chips = screen.getAllByTitle(/click to edit/i);
    expect(chips.some((c) => c.textContent?.includes("last month"))).toBe(true);
  });

  it("whispers existing tags when typing #", async () => {
    render(<Harness />);
    type("#");
    expect(await screen.findByText("#walk")).toBeInTheDocument();
    expect(screen.getByText("#planning")).toBeInTheDocument();
  });

  it("category: Tab selects it as a filter", async () => {
    render(<Harness />);
    const input = type("exec");
    expect(await screen.findByText("Execution")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Tab" });
    await waitFor(() => expect(input.value).toBe(""));
    expect(screen.getByTitle(/click to edit/i)).toHaveTextContent("Execution");
  });

  it("clear-all wipes the chips", async () => {
    render(<Harness />);
    const input = type("pinned");
    expect(await screen.findByText("Pinned")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByTitle(/click to edit/i);
    fireEvent.click(screen.getByLabelText(/clear all filters/i));
    await waitFor(() => expect(screen.queryByTitle(/click to edit/i)).toBeNull());
  });

  it("shift-fuses two chips into an OR group (boolean summary updates)", async () => {
    render(<Harness />);
    const input = type("pinned");
    await screen.findByText("Pinned");
    fireEvent.keyDown(input, { key: "Enter" });
    type("last week");
    await screen.findByText("Created · last week");
    fireEvent.keyDown(input, { key: "Enter" });

    // two chips now
    await waitFor(() => expect(screen.getAllByTitle(/click to edit/i).length).toBe(2));
    const chips = screen.getAllByTitle(/click to edit/i);
    // shift-click selects (plain click edits)
    fireEvent.click(chips[0], { shiftKey: true });
    fireEvent.click(chips[1], { shiftKey: true });
    // combine control appears → choose OR
    fireEvent.click(await screen.findByRole("button", { name: /^or$/i }));
    // a group forms with a single relation selector (the AND/OR badge)
    await screen.findByTitle("Toggle AND / OR");
  });

  it("left-click opens the edit popover and swaps a date range", async () => {
    render(<Harness />);
    const input = type("last month");
    await screen.findByText("Created · last month");
    fireEvent.keyDown(input, { key: "Enter" });
    const chip = await screen.findByTitle(/click to edit/i);
    fireEvent.click(chip); // plain click = edit
    // popover lists date phrases; pick a different one
    const option = await screen.findByText("this week");
    fireEvent.click(option);
    await waitFor(() => expect(screen.getByTitle(/click to edit/i)).toHaveTextContent("Created · this week"));
  });

  it("full-text search lazily builds the index and counts body matches", async () => {
    // Seed a note body in storage so the lazy index build (store.bodies) finds it.
    localStorage.setItem(
      "pensieve:note:a",
      JSON.stringify({
        id: "a",
        title: "Summon bar",
        markdown: "# Summon bar\n\nThe pensieve metaphor is the whole product.",
        createdAt: NOW,
        addedAt: NOW,
        updatedAt: NOW,
        categories: ["Execution"],
        tags: ["#walk"],
        links: [],
        pinned: false,
      }),
    );
    render(<Harness />);
    type("pensieve");
    // count reflects the single body match once the index has built (2 notes total)
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
  });

  it("date editor offers a custom-range calendar that sets the chip", async () => {
    render(<Harness />);
    const input = type("last month");
    await screen.findByText("Created · last month");
    fireEvent.keyDown(input, { key: "Enter" });
    const chip = await screen.findByTitle(/click to edit/i);
    fireEvent.click(chip);
    // expand the custom-range calendar
    fireEvent.click(await screen.findByText(/custom range/i));
    // pick a start and end day within the shown month
    fireEvent.click(await screen.findByRole("button", { name: "10" }));
    fireEvent.click(await screen.findByRole("button", { name: "20" }));
    // the chip now shows a custom range (…10 – 20)
    await waitFor(() => expect(screen.getByTitle(/click to edit/i)).toHaveTextContent(/10\s*–\s*20/));
  });

  it("calendar drill-down navigates year → month → day", async () => {
    render(<Harness />);
    const input = type("last month");
    await screen.findByText("Created · last month");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(await screen.findByTitle(/click to edit/i));
    fireEvent.click(await screen.findByText(/custom range/i));
    // header label (contains a year) → months grid
    fireEvent.click(await screen.findByRole("button", { name: /\d{4}/ }));
    expect(await screen.findByRole("button", { name: "Mar" })).toBeInTheDocument();
    // year label → years grid → pick 2026 → months → March → back to days
    fireEvent.click(screen.getByRole("button", { name: /^\d{4}$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "2026" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mar" }));
    expect(await screen.findByRole("button", { name: /Mar 2026/ })).toBeInTheDocument();
  });

  it("right-click pops (removes) a chip", async () => {
    render(<Harness />);
    const input = type("pinned");
    await screen.findByText("Pinned");
    fireEvent.keyDown(input, { key: "Enter" });
    const chip = await screen.findByTitle(/click to edit/i);
    fireEvent.contextMenu(chip);
    await waitFor(() => expect(screen.queryByTitle(/click to edit/i)).toBeNull(), { timeout: 1500 });
  });

  void within;
});
