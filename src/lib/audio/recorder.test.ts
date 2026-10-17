import { describe, it, expect } from "vitest";
import { RecordingClock } from "./recorder";
import { paintWaveform, type WaveformColors } from "./waveformPaint";
import { audioExtForFile } from "../../components/editor/media/insertAudio";

// The recorder engine's Web-API glue (getUserMedia/MediaRecorder/AnalyserNode) isn't present
// in jsdom, so we test the parts that ARE pure: the elapsed/pause clock, the recorded-blob
// extension mapping, and the shared waveform painter's bar math.

describe("RecordingClock — elapsed with pause accounting", () => {
  it("counts wall time while recording", () => {
    const c = new RecordingClock();
    c.start(1000);
    expect(c.elapsedSec(1000)).toBe(0);
    expect(c.elapsedSec(3500)).toBeCloseTo(2.5, 5);
    expect(c.paused).toBe(false);
  });

  it("freezes while paused and excludes the paused span after resume", () => {
    const c = new RecordingClock();
    c.start(0);
    c.pause(2000); // 2s recorded, then paused
    expect(c.paused).toBe(true);
    expect(c.elapsedSec(5000)).toBeCloseTo(2, 5); // frozen at 2s during the pause
    c.resume(5000); // 3s paused span excluded
    expect(c.elapsedSec(6000)).toBeCloseTo(3, 5); // 2s before + 1s after
    expect(c.paused).toBe(false);
  });

  it("double pause / resume-without-pause are no-ops", () => {
    const c = new RecordingClock();
    c.start(0);
    c.pause(1000);
    c.pause(2000); // ignored — already paused at 1000
    expect(c.elapsedSec(9000)).toBeCloseTo(1, 5);
    c.resume(4000);
    c.resume(5000); // ignored — not paused
    expect(c.elapsedSec(5000)).toBeCloseTo(1 + 1, 5); // 1s recorded + 1s since resume(4000)
  });
});

describe("audioExtForFile — recorded blob MIME mapping", () => {
  it("strips the ;codecs parameter MediaRecorder adds", () => {
    expect(audioExtForFile(new Blob([], { type: "audio/webm;codecs=opus" }))).toBe("webm");
    expect(audioExtForFile(new Blob([], { type: "audio/mp4" }))).toBe("m4a");
  });
  it("prefers a file's own extension over its mime", () => {
    expect(audioExtForFile(new File([], "memo.WAV", { type: "audio/webm" }))).toBe("wav");
  });
  it("falls back to mp3 for an unknown type", () => {
    expect(audioExtForFile(new Blob([], { type: "application/octet-stream" }))).toBe("mp3");
  });
});

describe("paintWaveform — bar math (stub ctx)", () => {
  const colors: WaveformColors = { played: "p", head: "h", unplayed: "u" };

  function stubCtx() {
    const fills: string[] = [];
    let cur = "";
    const ctx = {
      set fillStyle(v: string) { cur = v; },
      get fillStyle() { return cur; },
      beginPath() {},
      rect() { fills.push(cur); },
      roundRect() { fills.push(cur); },
      fill() {},
    } as unknown as CanvasRenderingContext2D;
    return { ctx, fills };
  }

  it("draws one bar per pitch across the width", () => {
    const { ctx, fills } = stubCtx();
    // width 100, barW 2 + gap 1 → pitch 3 → floor(100/3) = 33 bars
    paintWaveform(ctx, { width: 100, height: 40, peaks: [1, 0.5, 0.2], playedFrac: 0, colors });
    expect(fills.length).toBe(33);
  });

  it("colours bars left of the playhead 'played' and right 'unplayed'", () => {
    const { ctx, fills } = stubCtx();
    paintWaveform(ctx, { width: 300, height: 40, peaks: [0.5], playedFrac: 0.5, colors });
    const played = fills.filter((f) => f === "p").length;
    const unplayed = fills.filter((f) => f === "u").length;
    expect(played).toBeGreaterThan(0);
    expect(unplayed).toBeGreaterThan(0);
    expect(fills).toContain("h"); // exactly the playhead bar
  });

  it("recording passes playedFrac 1 → every bar is 'played' accent", () => {
    const { ctx, fills } = stubCtx();
    paintWaveform(ctx, { width: 120, height: 40, peaks: [0.3, 0.9], playedFrac: 1, colors });
    expect(fills.every((f) => f === "p")).toBe(true);
  });
});
