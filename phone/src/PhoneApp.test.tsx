// PhoneApp.test.tsx — a jsdom smoke boot of the whole phone app. Drives the REAL DOM
// (taps .card, opens the Spell Menu, casts spells, types into the summon bar) and asserts
// on structure/classes — the verification technique from the phone update's wiki. Not a
// feel test (the owner does the on-device pass); this proves the app MOUNTS and the
// Dock + Spell Menu + Accio + Sync subsystems are wired.

import "./test/phoneSetup";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneApp } from "./PhoneApp";
import { GENERAL_SPELLS } from "./lib/spells/registry";
import { persistVault } from "./vaultStore";
import { createSeed } from "./seed";

// The real app's vault starts empty (PWA-CAPTURE v2 — no seed fallback in production).
// This suite still drives the Wand against the old 13-card fixture content (titles like
// "lighthouse" it searches for), so seed it explicitly here rather than relying on a
// production fallback that no longer exists.
beforeEach(() => {
  persistVault(createSeed());
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

/** Simulate an already-connected OneDrive, with `fetch` failing fast (offline) so
 *  the real engine's network calls resolve immediately rather than hitting the
 *  real Graph API from a test. The Sync window flow only cares that a cast
 *  happened here, not whether it succeeded. */
function connectOneDriveForTest() {
  localStorage.setItem("pensieve.phone.refreshToken", "test-refresh-token");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline (test)"));
}

// let boot rAFs / conjure macrotasks fire inside act
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

/** tap a spell node by its index (casting is on the button's onClick — keyboard/VO reachable). */
function tapNode(container: HTMLElement, index: number) {
  const btn = container.querySelector<HTMLElement>(`.spell-node[data-index="${index}"] .spell-btn`);
  if (!btn) throw new Error(`no spell node ${index}`);
  fireEvent.click(btn);
}

describe("PhoneApp — boot + the Dock", () => {
  it("renders the reel with the seed cards + the header count", async () => {
    const { container } = await boot();
    expect(container.querySelectorAll(".reel .slot").length).toBe(13);
    expect(container.querySelector(".header .count")?.textContent).toBe("13 memories");
  });

  it("renders the dock: the gold menu button + the resident Accio bar", async () => {
    const { container } = await boot();
    expect(container.querySelector(".dock .spell-fab")).toBeTruthy();
    expect(container.querySelector(".dock .accio-bar")).toBeTruthy();
    // resident bar at rest shows the placeholder, no held query
    expect(container.querySelector(".accio-ph")?.textContent).toBe("Accio a memory…");
  });

  it("opens the Memory page when a card is tapped", async () => {
    const { container } = await boot();
    const card = container.querySelector<HTMLElement>(".reel .card");
    expect(card).toBeTruthy();
    // the Memory page is mounted on tap, then slides open a frame later (it is NOT
    // parked in the home DOM), so flush the rAF before asserting .open
    await act(async () => {
      fireEvent.click(card!);
    });
    await flush();
    const note = container.querySelector(".note");
    expect(note?.classList.contains("open")).toBe(true);
    expect(container.querySelector(".note-body h1")?.textContent).toBeTruthy();
  });
});

describe("PhoneApp — Accio (resident → summon)", () => {
  it("focusing the resident bar opens the summon bar; typing narrows + highlights the reel", async () => {
    const { container } = await boot();
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".accio-bar")!);
    });
    const root = container.querySelector(".app-root");
    expect(root?.classList.contains("searching")).toBe(true);

    const input = container.querySelector<HTMLInputElement>(".summon input");
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input!, { target: { value: "lighthouse" } });
    });
    // ONE filtered source feeds both the reel and the sheet
    expect(container.querySelectorAll(".reel .slot").length).toBe(1);
    expect(container.querySelector(".reel mark")?.textContent?.toLowerCase()).toBe("lighthouse");
    expect(container.querySelector(".search-results .sr")).toBeTruthy();
    expect(root?.classList.contains("filtering")).toBe(true);
  });
});

describe("PhoneApp — the Spell Menu", () => {
  it("blooms the general ring (gold) from the menu button — home has no local suggestions", async () => {
    const { container } = await boot();
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".spell-fab")!);
    });
    await flush();
    const ring = container.querySelector(".spell-ring");
    expect(ring).toBeTruthy();
    expect(ring?.classList.contains("hue-gold")).toBe(true);
    // just the three real daily spells: Write, Accio, Sync
    expect(GENERAL_SPELLS.map((s) => s.id)).toEqual(["write", "accio", "sync"]);
    expect(container.querySelectorAll(".spell-node").length).toBe(3);
    // no "see local" toggle on home — there's nothing page-local to suggest
    expect(container.querySelector(".spell-center-label")).toBeNull();
  });

  it("opens a window for Sync and casts the backup from it", async () => {
    connectOneDriveForTest();
    const { container } = await boot();
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".spell-fab")!);
    });
    await flush();
    // index 2 = Sync (opensWindow)
    expect(GENERAL_SPELLS[2].id).toBe("sync");
    await act(async () => {
      tapNode(container as HTMLElement, 2);
    });
    expect(container.querySelector(".spell-window")).toBeTruthy();

    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".sw-primary")!);
    });
    // the gold cast overlay is showing; the menu closed behind it
    expect(container.querySelector(".spell.show")).toBeTruthy();
    expect(container.querySelector(".spell-overlay")).toBeNull();
    // drain the cast's own hide timer within this test's lifetime, rather than
    // leaving it to fire after teardown (the real engine call behind it is async).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
  });

  it("restores from the cloud via the Sync window's quiet confirm", async () => {
    connectOneDriveForTest();
    const { container } = await boot();
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".spell-fab")!);
    });
    await flush();
    await act(async () => {
      tapNode(container as HTMLElement, 2); // Sync
    });
    // The restore line is quiet text, not the primary button; the first tap only ARMS
    // it in place ("Are you sure?") — nothing destructive yet.
    const restore = container.querySelector<HTMLElement>(".sw-restore")!;
    expect(restore).toBeTruthy();
    await act(async () => {
      fireEvent.click(restore);
    });
    expect(container.querySelector<HTMLElement>(".sw-restore")!.textContent).toContain("Are you sure?");
    // A second tap pulls down: the cast overlay shows and the menu closes behind it.
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".sw-restore")!);
    });
    expect(container.querySelector(".spell.show")).toBeTruthy();
    expect(container.querySelector(".spell-overlay")).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
  });
});
