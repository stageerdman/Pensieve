import { describe, expect, it } from "vitest";
import { repairWav } from "./wavRepair";
import { buildWavHeader } from "./pcmWav";

const pcm = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 251);
const wav = (data: Uint8Array, declaredSize = data.length, rate = 16000) => {
  const out = new Uint8Array(44 + data.length);
  out.set(new Uint8Array(buildWavHeader(declaredSize, rate)), 0);
  out.set(data, 44);
  return out;
};
const dataSizeOf = (b: Uint8Array) => new DataView(b.buffer).getUint32(40, true);
const rateOf = (b: Uint8Array) => new DataView(b.buffer).getUint32(24, true);

describe("repairWav", () => {
  it("leaves a healthy recording untouched", () => {
    const input = wav(pcm(3200));
    const r = repairWav(input, 16000)!;
    expect(r.changed).toBe(false);
    expect(r.bytes).toEqual(input);
  });

  it("keeps every byte when the header claims more audio than the file has (cut-off end)", () => {
    const r = repairWav(wav(pcm(3200), 999_999), 16000)!;
    expect(r.changed).toBe(true);
    expect(dataSizeOf(r.bytes)).toBe(3200);
    expect(r.bytes.length).toBe(44 + 3200);
  });

  it("keeps the audio past a stale, too-small header size", () => {
    const r = repairWav(wav(pcm(3200), 1000), 16000)!;
    expect(dataSizeOf(r.bytes)).toBe(3200);
  });

  it("drops a ragged half-sample at the end so the file is sample-aligned", () => {
    const r = repairWav(wav(pcm(3201)), 16000)!;
    expect(dataSizeOf(r.bytes)).toBe(3200);
  });

  it("wraps bare PCM (no header at all) in a WAV at the fallback rate", () => {
    const r = repairWav(pcm(320), 16000)!;
    expect(String.fromCharCode(...r.bytes.subarray(0, 4))).toBe("RIFF");
    expect(rateOf(r.bytes)).toBe(16000);
    expect(r.bytes.subarray(44)).toEqual(pcm(320));
  });

  it("replaces an unbelievable sample rate with the fallback", () => {
    expect(rateOf(repairWav(wav(pcm(320), 320, 0), 16000)!.bytes)).toBe(16000);
  });

  it("gives up on a file with no audio in it", () => {
    expect(repairWav(wav(new Uint8Array(0)), 16000)).toBeNull();
    expect(repairWav(new Uint8Array(0), 16000)).toBeNull();
  });

  it("never re-wraps another container (an m4a stays as it is)", () => {
    const m4a = new Uint8Array(64);
    m4a.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    expect(repairWav(m4a, 16000)).toBeNull();
  });
});
