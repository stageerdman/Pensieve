import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchSheet } from "./SearchSheet";
import { resultSnippet, resultWhen } from "./SearchResultRow";
import type { Note } from "../../types";

const note = (p: Partial<Note> & { id: string }): Note => ({
  t: p.id,
  c: "",
  cat: "--cat-blue",
  shape: "vial",
  fill: 0.4,
  d: "Nov 12",
  created: "12 Nov",
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

describe("SearchSheet (phone result list)", () => {
  it("nothing typed → no rows and no 'nothing answered' message", () => {
    render(<SearchSheet list={[]} asked={false} queryText="" onOpen={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/nothing answered/i)).toBeNull();
  });

  it("asked with no matches → the empty message", () => {
    render(<SearchSheet list={[]} asked queryText="zzz" onOpen={() => {}} />);
    expect(screen.getByText("Nothing answered the summons.")).toBeInTheDocument();
  });

  it("keeps the search's order, best match LAST (nearest the thumb), and opens on tap", () => {
    const onOpen = vi.fn();
    const best = note({ id: "best", t: "Garden plan" });
    const next = note({ id: "next", t: "Other", c: "about the garden gate" });
    render(<SearchSheet list={[best, next]} asked queryText="garden" onOpen={onOpen} />);
    const rows = screen.getAllByRole("button");
    expect(rows.map((r) => r.dataset.id)).toEqual(["next", "best"]);
    fireEvent.click(rows[1]);
    expect(onOpen).toHaveBeenCalledWith(best);
    expect(screen.getByRole("region", { name: "Search results, 2" })).toBeInTheDocument();
  });

  it("lights every matched word in title and snippet", () => {
    render(<SearchSheet list={[note({ id: "a", t: "Garden", c: "the garden gate" })]} asked queryText="garden" onOpen={() => {}} />);
    expect([...document.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Garden", "garden"]);
  });
});

describe("result row helpers", () => {
  it("snippet centres on the match, falls back to the body start", () => {
    const long = "word ".repeat(40) + "garden " + "tail ".repeat(40);
    const s = resultSnippet(note({ id: "a", c: long }), "garden")!;
    expect(s.text.slice(s.marks[0][0], s.marks[0][1])).toBe("garden");
    expect(s.text.startsWith("…")).toBe(true);
    expect(resultSnippet(note({ id: "b", c: "plain body" }), "garden")).toEqual({ text: "plain body", marks: [] });
    expect(resultSnippet(note({ id: "c", c: "" }), "garden")).toBeNull();
  });

  it("when = Type · date, or the date alone", () => {
    expect(resultWhen(note({ id: "a" }))).toBe("12 Nov");
    expect(
      resultWhen(
        note({ id: "b", foreign: { categories: ["Journal"], tags: [], links: [], pinned: false, iconColor: "blue" } }),
      ),
    ).toBe("Journal · 12 Nov");
  });
});
