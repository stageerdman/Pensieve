import { describe, it, expect } from "vitest";
import { RecordingClock, fmtElapsed } from "./voiceCapture";

describe("RecordingClock — pure pause/resume elapsed-time accounting", () => {
  it("counts straight-through elapsed time with no pause", () => {
    const c = new RecordingClock();
    c.start(0);
    expect(c.elapsedSec(5000)).toBe(5);
  });

  it("excludes paused spans from elapsed time", () => {
    const c = new RecordingClock();
    c.start(0);
    expect(c.elapsedSec(2000)).toBe(2);
    c.pause(2000);
    expect(c.paused).toBe(true);
    // time passes while paused — elapsed must not grow
    expect(c.elapsedSec(10000)).toBe(2);
    c.resume(10000);
    expect(c.paused).toBe(false);
    expect(c.elapsedSec(13000)).toBe(5);
  });

  it("a pause with no matching resume still reports a stable elapsed time ('saved just in case')", () => {
    const c = new RecordingClock();
    c.start(0);
    c.pause(4000);
    expect(c.elapsedSec(999999)).toBe(4);
  });

  it("double-pause / double-resume are no-ops", () => {
    const c = new RecordingClock();
    c.start(0);
    c.pause(1000);
    c.pause(5000); // second pause call shouldn't move the pause anchor
    c.resume(6000);
    expect(c.elapsedSec(6000)).toBe(1);
    c.resume(9000); // resume with nothing paused — no-op
    expect(c.elapsedSec(6000)).toBe(1);
  });
});

describe("fmtElapsed", () => {
  it("renders mm:ss under an hour", () => {
    expect(fmtElapsed(0)).toBe("0:00");
    expect(fmtElapsed(5)).toBe("0:05");
    expect(fmtElapsed(65)).toBe("1:05");
    expect(fmtElapsed(599)).toBe("9:59");
  });

  it("renders h:mm:ss past an hour (multi-hour takes)", () => {
    expect(fmtElapsed(3600)).toBe("1:00:00");
    expect(fmtElapsed(3725)).toBe("1:02:05");
    expect(fmtElapsed(7384)).toBe("2:03:04");
  });
});
