// PhoneApp.test.tsx — a jsdom smoke boot of the whole Wand. Drives the REAL DOM (taps
// .card / .wact, types into the summon bar) and asserts on structure/classes — the
// verification technique from the phone update's wiki. Not a feel test (the owner does
// the on-device pass); this proves the port MOUNTS and the subsystems are wired.

import "./test/phoneSetup";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhoneApp } from "./PhoneApp";

afterEach(cleanup);

// let the wheel's boot rAF (a macrotask) fire inside act
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 25));
  });
}

async function boot() {
  const utils = render(<PhoneApp />);
  await flush();
  return utils;
}

describe("PhoneApp — The Wand boots", () => {
  it("renders the reel with the seed cards + the header count", async () => {
    const { container } = await boot();
    const slots = container.querySelectorAll(".reel .slot");
    expect(slots.length).toBe(12);
    expect(container.querySelector(".header .count")?.textContent).toBe("12 memories");
  });

  it("renders the four wheel seats", async () => {
    const { container } = await boot();
    const seats = Array.from(container.querySelectorAll<HTMLElement>(".wact")).map((el) => el.dataset.key);
    expect(seats.sort()).toEqual(["accio", "adjust", "sync", "wand"]);
  });

  it("opens the full-screen note when a card is tapped", async () => {
    const { container } = await boot();
    const card = container.querySelector<HTMLElement>(".reel .card");
    expect(card).toBeTruthy();
    await act(async () => {
      fireEvent.click(card!);
    });
    const note = container.querySelector(".note");
    expect(note?.classList.contains("open")).toBe(true);
    // the editor received the tapped note's title as the auto-H1
    expect(container.querySelector(".note-body h1")?.textContent).toBeTruthy();
  });

  it("Accio opens the summon bar, and typing narrows + highlights the reel", async () => {
    const { container } = await boot();
    const accioBtn = container.querySelector<HTMLElement>('.wact[data-key="accio"]');
    expect(accioBtn).toBeTruthy();
    await act(async () => {
      fireEvent.pointerDown(accioBtn!, { clientX: 0, clientY: 0, pointerType: "touch" });
      fireEvent.pointerUp(accioBtn!, { clientX: 0, clientY: 0, pointerType: "touch" });
    });
    const root = container.querySelector(".app-root");
    expect(root?.classList.contains("searching")).toBe(true);

    const input = container.querySelector<HTMLInputElement>(".summon input");
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input!, { target: { value: "lighthouse" } });
    });
    // ONE filtered source feeds both the reel and the sheet
    const slots = container.querySelectorAll(".reel .slot");
    expect(slots.length).toBe(1);
    expect(container.querySelector(".reel mark")?.textContent?.toLowerCase()).toBe("lighthouse");
    expect(container.querySelector(".search-results .sr")).toBeTruthy();
    expect(root?.classList.contains("filtering")).toBe(true);
  });

  it("runs a sync cast when the Sync seat is tapped", async () => {
    const { container } = await boot();
    const syncBtn = container.querySelector<HTMLElement>('.wact[data-key="sync"]');
    expect(syncBtn).toBeTruthy();
    await act(async () => {
      fireEvent.pointerDown(syncBtn!, { clientX: 0, clientY: 0, pointerType: "touch" });
      fireEvent.pointerUp(syncBtn!, { clientX: 0, clientY: 0, pointerType: "touch" });
    });
    // the cast overlay is showing and the Sync seat reflects the syncing state
    expect(container.querySelector(".spell")?.classList.contains("show")).toBe(true);
    expect(container.querySelector('.wact[data-key="sync"]')?.getAttribute("data-state")).toBe("syncing");
  });
});
