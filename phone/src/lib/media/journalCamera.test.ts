import { describe, it, expect, vi, afterEach } from "vitest";
import { isCameraAvailable, JournalCamera } from "./journalCamera";

describe("isCameraAvailable", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  });

  it("false when the browser has no mediaDevices.getUserMedia", () => {
    expect(isCameraAvailable()).toBe(false);
  });

  it("true when getUserMedia exists", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
    expect(isCameraAvailable()).toBe(true);
  });
});

describe("JournalCamera.start", () => {
  it("throws a clear error when no camera is available, rather than a raw getUserMedia rejection", async () => {
    const cam = new JournalCamera();
    await expect(cam.start(document.createElement("video"))).rejects.toThrow("No camera available");
  });
});

describe("JournalCamera.stop", () => {
  it("is a safe no-op when start() was never called", () => {
    const cam = new JournalCamera();
    expect(() => cam.stop()).not.toThrow();
  });

  it("stops every track on the held stream", () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    const fakeStream = { getTracks: () => [{ stop: stop1 }, { stop: stop2 }] } as unknown as MediaStream;
    const cam = new JournalCamera();
    // @ts-expect-error — reaching into the private field to simulate an already-open session
    cam.stream = fakeStream;
    cam.stop();
    expect(stop1).toHaveBeenCalled();
    expect(stop2).toHaveBeenCalled();
  });
});
