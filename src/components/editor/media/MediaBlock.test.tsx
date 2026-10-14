import { describe, it, expect, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MediaBlock } from "./MediaBlock";

// The visual base's state rendering (wiki "States matrix — absence = healthy"). The
// broken state is the load-bearing one: it must keep the rect, name the missing file,
// and offer Locate — never collapse to nothing (which would lose the ref).

describe("MediaBlock states", () => {
  it("broken/missing: keeps the frame, shows the filename, and offers Locate", () => {
    const onLocate = vi.fn();
    render(<MediaBlock alt="" width={0.75} state="broken" filename="abc-123.png" onLocate={onLocate} />);
    expect(screen.getByText("Image missing")).toBeTruthy();
    expect(screen.getByText("abc-123.png")).toBeTruthy();
    const locate = screen.getByText("Locate…");
    fireEvent.click(locate);
    expect(onLocate).toHaveBeenCalledOnce();
    // There is no <img> in the broken state, but the block is still present (never collapsed).
    expect(document.querySelector(".pensieve-media")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    cleanup();
  });

  it("loaded: renders the image with its url + caption as alt", () => {
    render(<MediaBlock url="blob:abc" alt="a cat" width={0.5} state="loaded" />);
    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:abc");
    expect(img.getAttribute("alt")).toBe("a cat");
    expect((document.querySelector(".pensieve-media") as HTMLElement).style.width).toBe("50%");
    cleanup();
  });

  it("a11y: an uncaptioned image falls back to a non-empty alt (never decorative alt='')", () => {
    render(<MediaBlock url="blob:abc" alt="" width={0.75} state="loaded" />);
    // alt="" would mark a content image decorative to a screen reader — never that.
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("Image");
    cleanup();
  });

  it("saving: shows the image instantly plus a progress hairline (no spinner)", () => {
    render(<MediaBlock url="blob:local" alt="" width={0.75} state="saving" />);
    expect(document.querySelector("img")).toBeTruthy();
    expect(document.querySelector(".pensieve-media-progress")).toBeTruthy();
    cleanup();
  });

  it("selected adds the ring class; focused adds the glow", () => {
    const { rerender } = render(<MediaBlock url="blob:x" alt="" width={1} state="loaded" selected />);
    expect(document.querySelector(".pensieve-media.is-selected")).toBeTruthy();
    rerender(<MediaBlock url="blob:x" alt="" width={1} state="loaded" focused />);
    expect(document.querySelector(".pensieve-media.is-focused")).toBeTruthy();
    cleanup();
  });
});
