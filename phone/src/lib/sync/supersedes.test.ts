import { describe, expect, it } from "vitest";
import { remoteSupersedesLocal } from "./supersedes";

const audio = (id: string) => "```pensieve:audio\nmedia/n/" + id + ".wav\n```";

// The real memory (2026-11-20): phone copy vs the Mac's renamed + categorised copy.
const phoneCopy = `---\ntags: []\nlinks: []\nicon: teardrop/yellow\n---\n\nNew Recording\n\n${audio("a")}\n\n${audio("b")}`;
const macCopy = `---\ncategories: [Journal]\ntags: [@Ria Podcast]\nlinks: []\nicon: teardrop/yellow\n---\n\n# Sales Mindset w/ Ria (mini podcast)\n\n${audio("a")}\n\n${audio("b")}`;

describe("remoteSupersedesLocal", () => {
  it("a placeholder-titled phone copy is superseded by the computer's renamed, tagged copy", () => {
    expect(remoteSupersedesLocal(phoneCopy, macCopy)).toBe(true);
  });

  it("a phone copy with a line the remote lacks is a real conflict", () => {
    expect(remoteSupersedesLocal(phoneCopy + "\n\nA thought typed on the phone", macCopy)).toBe(false);
  });

  it("a phone-renamed title is a real conflict", () => {
    expect(remoteSupersedesLocal(phoneCopy.replace("New Recording", "My own name"), macCopy)).toBe(false);
  });

  it("a tag added on the phone only is a real conflict", () => {
    expect(remoteSupersedesLocal(phoneCopy.replace("tags: []", "tags: [mine]"), macCopy)).toBe(false);
  });
});
