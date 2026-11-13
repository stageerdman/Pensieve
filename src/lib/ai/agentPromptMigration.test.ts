import { describe, it, expect } from "vitest";
import { migratePrompt } from "./agentStore";
import { BASE_PERSONA, SEED_AGENTS } from "./agents";

describe("agent prompt migration (tagging enabled)", () => {
  it("rewrites the old 'writing tools aren't enabled' sentences from earlier seeds", () => {
    const old =
      "X can read that vault through the tools you've been given (note-writing tools exist but aren't enabled yet). Y " +
      "You can see categories and tags across the vault — note-creating and note-editing tools exist but aren't enabled for you yet; if asked to make an edit, say so plainly instead of pretending you did it.";
    const next = migratePrompt(old);
    expect(next).toContain("add tags to notes when the person asks you to");
    expect(next).toContain("a tag is a THREAD");
    expect(next).not.toContain("aren't enabled for you yet");
  });

  it("leaves owner-written prompts alone and the current seeds already migrated", () => {
    expect(migratePrompt("Be a stoic.")).toBe("Be a stoic.");
    for (const a of SEED_AGENTS) expect(migratePrompt(a.systemPrompt)).toBe(a.systemPrompt);
    expect(BASE_PERSONA).toContain("add tags to notes");
  });
});
