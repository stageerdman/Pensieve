import { describe, it, expect } from "vitest";
import {
  depth,
  normalize,
  removeNode,
  canGroup,
  group,
  ungroup,
  setRelation,
  moveLeaf,
  describe as describeTree,
} from "./tree";
import type { FilterLeaf, FilterNode } from "./types";

let n = 0;
const leaf = (label: string): FilterLeaf => ({
  type: "leaf",
  id: `l${++n}`,
  filter: { kind: "tag", tags: [label] },
});
const labelOf = (l: FilterLeaf) => (l.filter.kind === "tag" ? "#" + l.filter.tags[0] : "?");

describe("depth", () => {
  it("leaf 0, flat group 1, nested group 2", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    expect(depth(a)).toBe(0);
    const g1: FilterNode = { type: "group", id: "g1", relation: "or", children: [a, b] };
    expect(depth(g1)).toBe(1);
    const g2: FilterNode = { type: "group", id: "g2", relation: "and", children: [g1, c] };
    expect(depth(g2)).toBe(2);
  });
});

describe("normalize — no group of one", () => {
  it("promotes a lone child and drops empty groups", () => {
    const a = leaf("a");
    const lonely: FilterNode = { type: "group", id: "g", relation: "or", children: [a] };
    expect(normalize([lonely])).toEqual([a]);
    const empty: FilterNode = { type: "group", id: "g2", relation: "and", children: [] };
    expect(normalize([empty])).toEqual([]);
  });

  it("cascades bottom-up", () => {
    const a = leaf("a");
    const inner: FilterNode = { type: "group", id: "gi", relation: "or", children: [a] };
    const outer: FilterNode = { type: "group", id: "go", relation: "and", children: [inner] };
    expect(normalize([outer])).toEqual([a]);
  });
});

describe("group / canGroup", () => {
  it("fuses two top-level chips at the first position", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const items = [a, b, c];
    expect(canGroup(items, [a.id, c.id])).toBe(true);
    const g = group(items, [a.id, c.id], "or", "G1");
    expect(g.map((x) => x.id)).toEqual(["G1", b.id]);
    expect(g[0]).toMatchObject({ type: "group", relation: "or", children: [a, c] });
  });

  it("allows nesting to depth 2 (chip + flat group)", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const flat = group([a, b, c], [a.id, b.id], "or", "G1"); // [G1(a,b), c]
    expect(canGroup(flat, ["G1", c.id])).toBe(true);
    const nested = group(flat, ["G1", c.id], "and", "G2");
    expect(nested).toHaveLength(1);
    expect(depth(nested[0])).toBe(2);
  });

  it("refuses to nest deeper than depth 2", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c"), d = leaf("d");
    const flat = group([a, b, c, d], [a.id, b.id], "or", "G1");
    const nested = group(flat, ["G1", c.id], "and", "G2"); // [G2(G1(a,b), c), d]
    expect(canGroup(nested, ["G2", d.id])).toBe(false);
    expect(group(nested, ["G2", d.id], "or", "G3")).toEqual(nested); // no-op
  });

  it("refuses <2 ids or non-top-level ids", () => {
    const a = leaf("a"), b = leaf("b");
    const flat = group([a, b], [a.id, b.id], "or", "G1"); // [G1(a,b)]
    expect(canGroup(flat, [a.id])).toBe(false); // a is nested now, not top-level
  });
});

describe("ungroup", () => {
  it("explodes a group in place", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const g = group([a, b, c], [a.id, b.id], "or", "G1"); // [G1(a,b), c]
    expect(ungroup(g, "G1").map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("setRelation", () => {
  it("flips a group's relation, incl. nested", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const flat = group([a, b, c], [a.id, b.id], "or", "G1");
    const nested = group(flat, ["G1", c.id], "and", "G2");
    const flipped = setRelation(nested, "G1", "and");
    const inner = (flipped[0] as any).children.find((x: any) => x.id === "G1");
    expect(inner.relation).toBe("and");
  });
});

describe("removeNode — bubble pop + dissolve", () => {
  it("removing a chip from a pair dissolves the group", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const g = group([a, b, c], [a.id, b.id], "or", "G1"); // [G1(a,b), c]
    const after = removeNode(g, a.id); // G1 now has only b -> dissolve
    expect(after.map((x) => x.id)).toEqual([b.id, c.id]);
  });

  it("removing from a trio keeps the group", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c"), d = leaf("d");
    const g = group([a, b, c, d], [a.id, b.id, c.id], "or", "G1"); // [G1(a,b,c), d]
    const after = removeNode(g, a.id);
    expect((after[0] as any).children.map((x: any) => x.id)).toEqual([b.id, c.id]);
  });
});

describe("moveLeaf — drag in/out", () => {
  it("moves a top-level chip into a group", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const g = group([a, b, c], [a.id, b.id], "or", "G1"); // [G1(a,b), c]
    const after = moveLeaf(g, c.id, "G1", 2); // drop c into G1
    expect(after).toHaveLength(1);
    expect((after[0] as any).children.map((x: any) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it("moves a chip out of a group to top level; pair dissolves", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const g = group([a, b, c], [a.id, b.id], "or", "G1"); // [G1(a,b), c]
    const after = moveLeaf(g, a.id, null, 0); // a to top; G1 left with only b -> dissolve
    expect(after.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe("describe", () => {
  it("renders a boolean summary", () => {
    const a = leaf("a"), b = leaf("b"), c = leaf("c");
    const flat = group([a, b, c], [a.id, b.id], "or", "G1");
    expect(describeTree(flat, labelOf)).toBe("(#a OR #b) AND #c");
  });
});
