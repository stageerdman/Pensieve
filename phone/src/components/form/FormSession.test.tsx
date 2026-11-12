import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormSession } from "./FormSession";
import { startSession } from "../../lib/forms/session";
import { splitTitleAndBody } from "../../lib/sync/noteFormat";
import { DAILY_REVIEW } from "../../../../src/lib/forms/dailyReview.fixture";
import type { Note } from "../../types";

const { title, body } = splitTitleAndBody(DAILY_REVIEW);
const form: Note = { id: "form-1", t: title, c: body, cat: "--cat-blue", shape: "vial", fill: 0.5, d: "", created: "", createdAt: 0, updatedAt: 0 };

describe("FormSession", () => {
  it("renders every question + the review, and reports answers", () => {
    const s = startSession(form, "s1", new Date(2026, 10, 12));
    const onAnswer = vi.fn();
    render(<FormSession session={s} answers={{}} onAnswer={onAnswer} media={[]} recording={false} onSpell={vi.fn()} onOpenMenu={vi.fn()} />);
    expect(screen.getAllByRole("heading")).toHaveLength(10);
    fireEvent.click(screen.getByRole("radio", { name: /^4:/ }));
    expect(onAnswer).toHaveBeenCalledWith(s.fields[0].id, { scale: 4 });
    fireEvent.click(screen.getByRole("checkbox", { name: /Hour of Power/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(s.fields[1].id, { checks: ["Hour of Power"] });
  });
});
