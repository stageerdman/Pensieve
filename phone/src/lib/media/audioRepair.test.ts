import { describe, expect, it, vi } from "vitest";
import { repairStoredAudio, type RepairStore } from "./audioRepair";
import { buildWavHeader } from "./pcmWav";

function storeWith(bytes: Uint8Array | null, writeOk = true) {
  const written: Blob[] = [];
  const store: RepairStore = {
    read: vi.fn(async () => bytes),
    write: vi.fn(async (_ref: string, blob: Blob) => (written.push(blob), writeOk)),
  };
  return { store, written };
}

const brokenWav = () => {
  const b = new Uint8Array(44 + 3200);
  b.set(new Uint8Array(buildWavHeader(999_999, 16000)), 0); // header claims far more than exists
  return b;
};

describe("repairStoredAudio", () => {
  it("rewrites a damaged recording in place as a playable WAV", async () => {
    const { store, written } = storeWith(brokenWav());
    expect(await repairStoredAudio("media/n/a.wav", store)).toBe("repaired");
    expect(written[0].type).toBe("audio/wav");
    expect(written[0].size).toBe(44 + 3200);
  });

  it("leaves a sound file alone", async () => {
    const good = brokenWav();
    good.set(new Uint8Array(buildWavHeader(3200, 16000)), 0);
    const { store, written } = storeWith(good);
    expect(await repairStoredAudio("r", store)).toBe("unchanged");
    expect(written).toHaveLength(0);
  });

  it("never overwrites a file it can't recover", async () => {
    const { store, written } = storeWith(new Uint8Array(0));
    expect(await repairStoredAudio("r", store)).toBe("unrecoverable");
    expect(written).toHaveLength(0);
    expect(await repairStoredAudio("r", storeWith(null).store)).toBe("missing");
  });

  it("fails loudly when the repaired copy can't be written", async () => {
    await expect(repairStoredAudio("media/n/a.wav", storeWith(brokenWav(), false).store)).rejects.toThrow(/media\/n\/a\.wav/);
  });
});
