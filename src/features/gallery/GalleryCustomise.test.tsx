import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GalleryCustomise } from "./GalleryCustomise";
import { DEFAULT_GALLERY_STATE } from "../../lib/gallery/view";

function open(overrides = {}) {
  const props = {
    state: DEFAULT_GALLERY_STATE,
    onToggleField: vi.fn(),
    onSetSnippetLines: vi.fn(),
    onSetWorkingSetPersist: vi.fn(),
    ...overrides,
  };
  render(<GalleryCustomise {...props} />);
  fireEvent.click(screen.getByLabelText("Edit view"));
  return props;
}

describe("GalleryCustomise", () => {
  it("toggles a display field", () => {
    const props = open();
    fireEvent.click(screen.getByText("Tags"));
    expect(props.onToggleField).toHaveBeenCalledWith("tags");
  });

  it("shows the snippet-lines control only when the snippet field is on", () => {
    open();
    expect(screen.getByText(/snippet lines/i)).toBeInTheDocument();
  });

  it("hides the snippet-lines control when the snippet field is off", () => {
    open({
      state: {
        ...DEFAULT_GALLERY_STATE,
        fields: { ...DEFAULT_GALLERY_STATE.fields, snippet: false },
      },
    });
    expect(screen.queryByText(/snippet lines/i)).toBeNull();
  });

  it("sets the snippet line count", () => {
    const props = open();
    fireEvent.click(screen.getByText("3"));
    expect(props.onSetSnippetLines).toHaveBeenCalledWith(3);
  });

  it("toggles working-set persistence", () => {
    const props = open();
    fireEvent.click(screen.getByText(/keep between sessions/i));
    expect(props.onSetWorkingSetPersist).toHaveBeenCalledWith(false);
  });
});
