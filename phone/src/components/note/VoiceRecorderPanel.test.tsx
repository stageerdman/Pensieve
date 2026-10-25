import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VoiceRecorderPanel } from "./VoiceRecorderPanel";
import type { VoiceCaptureDeps } from "../../lib/media/voiceCapture";

// jsdom has no getUserMedia/MediaRecorder — this exercises the panel's error path (a mic that
// can't start must render a dismissible message, never crash or hang on "Starting…").
describe("VoiceRecorderPanel — no mic available (jsdom)", () => {
  it("falls back to an error state and calls onClose when dismissed", async () => {
    const deps: VoiceCaptureDeps = {
      getNote: () => undefined,
      persistAndRender: () => {},
    };
    const onClose = vi.fn();
    render(<VoiceRecorderPanel noteId="n1" placeholderBody="added recording" deps={deps} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText(/Microphone/i)).toBeTruthy());
    screen.getByText("Close").click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
