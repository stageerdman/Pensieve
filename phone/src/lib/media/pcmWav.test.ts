import { describe, it, expect } from "vitest";
import { buildWavHeader, buildWavBlob, floatTo16BitPCM, resampleTo, createResampleState, TARGET_SAMPLE_RATE } from "./pcmWav";

describe("floatTo16BitPCM", () => {
  it("maps the full [-1, 1] range into signed 16-bit", () => {
    const out = floatTo16BitPCM(Float32Array.from([-1, 0, 1, 0.5, -0.5]));
    expect(Array.from(out)).toEqual([-32768, 0, 32767, 16383, -16384]);
  });

  it("clamps out-of-range input instead of wrapping", () => {
    const out = floatTo16BitPCM(Float32Array.from([2, -2]));
    expect(Array.from(out)).toEqual([32767, -32768]);
  });
});

describe("resampleTo", () => {
  it("is a no-op copy when input rate already matches target", () => {
    const input = Float32Array.from([0.1, 0.2, 0.3]);
    const st = createResampleState();
    const out = resampleTo(input, TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE, st);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it("halves the sample count at a 2:1 ratio", () => {
    // 8 input samples at 2x target rate -> ~4 output samples.
    const input = Float32Array.from([0, 1, 0, 1, 0, 1, 0, 1]);
    const st = createResampleState();
    const out = resampleTo(input, 32000, 16000, st);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it("carries phase continuously across buffer boundaries (total output tracks total input)", () => {
    const st = createResampleState();
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const input = new Float32Array(4800).fill(0.1); // 100ms @ 48kHz per call
      total += resampleTo(input, 48000, 16000, st).length;
    }
    // 10 * 100ms @ 16kHz = 16000 samples total, give or take one sample of rounding per call.
    expect(total).toBeGreaterThanOrEqual(15990);
    expect(total).toBeLessThanOrEqual(16010);
  });

  it("produces no output on an empty buffer and doesn't crash downstream state", () => {
    const st = createResampleState();
    const out = resampleTo(new Float32Array(0), 48000, 16000, st);
    expect(out.length).toBe(0);
  });
});

describe("buildWavHeader", () => {
  it("writes a canonical 44-byte PCM mono 16-bit header", () => {
    const header = buildWavHeader(1000, 16000);
    const view = new DataView(header);
    expect(header.byteLength).toBe(44);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 1000);
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(1000); // data size
  });
});

describe("buildWavBlob", () => {
  it("concatenates every chunk behind one header, sized to their total bytes", () => {
    const chunks = [new Blob([new Uint8Array(10)]), new Blob([new Uint8Array(20)]), new Blob([new Uint8Array(5)])];
    const wav = buildWavBlob(chunks, 16000);
    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(44 + 35); // header + total PCM bytes, not re-read, just summed
  });

  it("produces a header-only (silent) WAV for zero chunks", () => {
    const wav = buildWavBlob([], 16000);
    expect(wav.size).toBe(44);
  });
});
