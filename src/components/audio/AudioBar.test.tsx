import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AudioBar } from "./AudioBar";

describe("AudioBar", () => {
  it("the docked side-view player has no ⋯ menu (its actions were wired to nothing)", () => {
    render(<AudioBar src="blob:x" playerKey="k1" dock transcriptState="present" />);
    expect(screen.queryByLabelText("More")).toBeNull();
  });
  it("the in-memory player keeps its ⋯ menu", () => {
    render(<AudioBar src="blob:y" playerKey="k2" transcriptState="present" onRegenerateTranscript={() => {}} />);
    expect(screen.getByLabelText("More")).toBeTruthy();
  });
});
