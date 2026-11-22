import { describe, expect, it } from "vitest";
import type { Note } from "../../types";
import { refreshOpenNote } from "./openNote";

const note = (id: string, t: string, c: string) => ({ id, t, c }) as Note;

describe("the open memory after a sync", () => {
  it("follows the vault's new object and redraws when the sync pulled a different copy", () => {
    const open = note("a", "Walk", "spell: pending");
    const pulled = note("a", "Walk", "spell: done");
    expect(refreshOpenNote(open, [pulled], { title: "Walk", content: "spell: pending" })).toEqual({ kind: "redraw", note: pulled });
  });

  it("only follows when nothing changed on the page's side (so later typing is saved)", () => {
    const open = note("a", "Walk", "x");
    const reloaded = note("a", "Walk", "x");
    expect(refreshOpenNote(open, [reloaded], { title: "Walk", content: "x" })).toEqual({ kind: "follow", note: reloaded });
  });

  it("keeps words typed during the sync on screen instead of wiping them", () => {
    const open = note("a", "Walk", "x");
    const pulled = note("a", "Walk", "from the computer");
    expect(refreshOpenNote(open, [pulled], { title: "Walk", content: "x and more" })).toEqual({ kind: "follow", note: pulled });
  });

  it("does nothing for a memory not in the vault (brand new, or removed) or the same object", () => {
    const open = note("a", "", "");
    expect(refreshOpenNote(open, [note("b", "", "")], { title: "", content: "" })).toEqual({ kind: "none" });
    expect(refreshOpenNote(open, [open], { title: "", content: "" })).toEqual({ kind: "none" });
  });
});
