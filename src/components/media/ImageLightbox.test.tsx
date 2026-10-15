import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ImageLightbox } from "./ImageLightbox";
import { lightbox } from "./lightboxController";

// The shared lightbox: open/close, focus trap + restore, multi-image navigation (so
// Phase 3's gallery is de-risked with a 3-item list exercised here), the reduced-motion
// path, and that the arrows/counter hide for a single image (the degenerate case).

const RECT = (over: Partial<DOMRect> = {}): DOMRect =>
  ({ left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}), ...over }) as DOMRect;

afterEach(() => {
  cleanup(); // unmount first (unsubscribes) so the stray close() updates nothing
  lightbox.close();
  vi.unstubAllGlobals();
});

describe("ImageLightbox", () => {
  it("opens from the controller and closes via the close button", async () => {
    render(<ImageLightbox />);
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => lightbox.open({ items: [{ url: "blob:one", caption: "a cat" }], index: 0 }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const img = dialog.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:one");
    expect(img.getAttribute("alt")).toBe("a cat");
    // The caption renders below the frame.
    expect(screen.getByText("a cat")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on Esc and on a backdrop click", async () => {
    render(<ImageLightbox />);

    act(() => lightbox.open({ items: [{ url: "blob:x" }], index: 0 }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    act(() => lightbox.open({ items: [{ url: "blob:x" }], index: 0 }));
    const dialog = await screen.findByRole("dialog");
    // Clicking the layer itself (the empty backdrop) dismisses; the image does not.
    fireEvent.click(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("traps focus into the dialog and restores it to the origin on close", async () => {
    render(
      <>
        <button data-testid="origin">open me</button>
        <ImageLightbox />
      </>,
    );
    const origin = screen.getByTestId("origin") as HTMLButtonElement;
    origin.focus();
    expect(document.activeElement).toBe(origin);

    act(() => lightbox.open({ items: [{ url: "blob:x" }], index: 0, originElement: origin }));
    await screen.findByRole("dialog");
    // Focus moved into the dialog (the close button).
    expect(document.activeElement).toBe(screen.getByLabelText("Close"));

    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // …and returned to the element it was opened from.
    expect(document.activeElement).toBe(origin);
  });

  it("navigates a 3-item list with arrows, chevrons, Home/End; shows the counter", async () => {
    render(<ImageLightbox />);
    const items = [
      { url: "blob:0", caption: "zero" },
      { url: "blob:1", caption: "one" },
      { url: "blob:2", caption: "two" },
    ];
    act(() => lightbox.open({ items, index: 0 }));
    await screen.findByRole("dialog");

    const img = () => screen.getByRole("dialog").querySelector("img")!;
    expect(img().getAttribute("src")).toBe("blob:0");
    expect(screen.getByText("1 / 3")).toBeTruthy();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(img().getAttribute("src")).toBe("blob:1");
    expect(screen.getByText("2 / 3")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next image"));
    expect(img().getAttribute("src")).toBe("blob:2");

    // Clamps at the end (no wrap).
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(img().getAttribute("src")).toBe("blob:2");

    fireEvent.keyDown(document, { key: "Home" });
    expect(img().getAttribute("src")).toBe("blob:0");

    fireEvent.keyDown(document, { key: "End" });
    expect(img().getAttribute("src")).toBe("blob:2");

    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(img().getAttribute("src")).toBe("blob:1");
  });

  it("hides the arrows and counter for a single image", async () => {
    render(<ImageLightbox />);
    act(() => lightbox.open({ items: [{ url: "blob:solo" }], index: 0 }));
    await screen.findByRole("dialog");

    expect(screen.queryByLabelText("Next image")).toBeNull();
    expect(screen.queryByLabelText("Previous image")).toBeNull();
    expect(screen.queryByText(/\/\s*1/)).toBeNull();
    // Arrow keys are inert with one image.
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toBe("blob:solo");
  });

  it("reduced-motion path: opens without the FLIP travel transform and cuts closed", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: /reduce/.test(q),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }));

    render(<ImageLightbox />);
    act(() =>
      lightbox.open({ items: [{ url: "blob:x", caption: "c" }], index: 0, originRect: RECT() }),
    );
    const dialog = await screen.findByRole("dialog");
    const frame = dialog.querySelector(".lightbox-frame") as HTMLElement;
    // No shared-element travel: the frame carries no inline transform under reduced motion.
    expect(frame.style.transform).toBe("");
    // And the entrance cross-fade class is not used when an originRect was supplied.
    expect(frame.classList.contains("portal-enter")).toBe(false);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("uses the portal cross-fade when no originRect is given", async () => {
    render(<ImageLightbox />);
    act(() => lightbox.open({ items: [{ url: "blob:x" }], index: 0 }));
    const dialog = await screen.findByRole("dialog");
    const frame = dialog.querySelector(".lightbox-frame") as HTMLElement;
    expect(frame.classList.contains("portal-enter")).toBe(true);
  });
});
