// A form memory opened on the phone: the rating renders as tappable numbers, checklist boxes
// toggle on tap, a charm shows as a quiet line — and the body serializes back unchanged
// except for exactly what was tapped.
import { describe, expect, it, vi } from "vitest";
import { renderNoteBody, serializeNoteBody } from "./mediaDom";
import { splitTitleAndBody } from "../../lib/sync/noteFormat";
import { DAILY_REVIEW } from "../../../../src/lib/forms/dailyReview.fixture";
import { parseForm } from "../../../../src/lib/forms";

const { title, body } = splitTitleAndBody(DAILY_REVIEW);

function open() {
  const el = document.createElement("div");
  el.className = "note-body";
  document.body.appendChild(el);
  const ctx = { onChange: vi.fn() };
  renderNoteBody(el, title, body, ctx);
  return { el, ctx };
}

describe("form blocks on the phone memory page", () => {
  it("renders untouched → serializes back byte-for-byte", () => {
    const { el } = open();
    expect(el.querySelectorAll(".ph-form-scale button")).toHaveLength(5);
    expect(el.querySelector(".ph-charm")?.textContent).toContain("Compress");
    const out = serializeNoteBody(el);
    expect(out.title).toBe(title);
    expect(out.content).toBe(body.trim());
  });

  it("tapping a rating and a checkbox changes exactly those, and saves", () => {
    const { el, ctx } = open();
    (el.querySelectorAll(".ph-form-scale button")[2] as HTMLElement).click();
    (el.querySelector(".ph-check-mark") as HTMLElement).click();
    expect(ctx.onChange).toHaveBeenCalledTimes(2);
    const f = parseForm(`${title}\n\n${serializeNoteBody(el).content}`).fields;
    expect(f[0].scale?.value).toBe(3);
    expect(f[1].items?.map((i) => i.checked)).toEqual([true, false, false, false]);
    expect(el.querySelector(".ph-form-anchor")?.textContent).toMatch(/^I enjoyed the day/);
    // tap again → cleared
    (el.querySelectorAll(".ph-form-scale button")[2] as HTMLElement).click();
    expect(parseForm(`${title}\n\n${serializeNoteBody(el).content}`).fields[0].scale?.value).toBeUndefined();
  });
});
