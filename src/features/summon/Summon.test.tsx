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
    const chips = screen.getAllByTitle(/click to select/i);
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
    expect(screen.getByTitle(/click to select/i)).toHaveTextContent("Execution");
  });

  it("clear-all wipes the chips", async () => {
    render(<Harness />);
    const input = type("pinned");
    expect(await screen.findByText("Pinned")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByTitle(/click to select/i);
    fireEvent.click(screen.getByLabelText(/clear all filters/i));
    await waitFor(() => expect(screen.queryByTitle(/click to select/i)).toBeNull());
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
    await waitFor(() => expect(screen.getAllByTitle(/click to select/i).length).toBe(2));
    const chips = screen.getAllByTitle(/click to select/i);
    fireEvent.click(chips[0]);
    fireEvent.click(chips[1]);
    // combine control appears → choose OR
    fireEvent.click(await screen.findByRole("button", { name: /^or$/i }));
    // boolean summary line shows an OR group
    await waitFor(() => expect(screen.getByText(/\bOR\b/)).toBeInTheDocument());
  });

  it("right-click pops (removes) a chip", async () => {
    render(<Harness />);
    const input = type("pinned");
    await screen.findByText("Pinned");
    fireEvent.keyDown(input, { key: "Enter" });
    const chip = await screen.findByTitle(/click to select/i);
    fireEvent.contextMenu(chip);
    await waitFor(() => expect(screen.queryByTitle(/click to select/i)).toBeNull(), { timeout: 1500 });
  });

  void within;
});
