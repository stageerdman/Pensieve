import { describe, it, expect } from "vitest";
import { MODELS, DEFAULT_MODEL, modelChoices, coerceModel } from "./models";

describe("transcription model catalog", () => {
  it("the default is Czech Whisper and is marked as such", () => {
    expect(DEFAULT_MODEL).toBe("czech-whisper");
    expect(MODELS["czech-whisper"].isDefault).toBe(true);
    expect(MODELS.parakeet.isDefault).toBe(false);
  });

  it("exposes the real backend ids", () => {
    expect(MODELS["czech-whisper"].backendId).toBe("mikr/whisper-large-v3-czech-cv13");
    expect(MODELS.parakeet.backendId).toBe("mlx-community/parakeet-tdt-0.6b-v3");
  });

  it("uses the owner's choice wording + short chips", () => {
    expect(MODELS["czech-whisper"].choiceLabel).toBe("Czech Mix (Slow)");
    expect(MODELS["czech-whisper"].chipLabel).toBe("Czech");
    expect(MODELS.parakeet.choiceLabel).toBe("English (Fast)");
    expect(MODELS.parakeet.chipLabel).toBe("English");
  });

  it("lists choices default-first (path of least resistance)", () => {
    const ids = modelChoices().map((m) => m.id);
    expect(ids).toEqual(["czech-whisper", "parakeet"]);
  });

  it("coerces unknown/empty ids to the default, preserves known ones", () => {
    expect(coerceModel("parakeet")).toBe("parakeet");
    expect(coerceModel("czech-whisper")).toBe("czech-whisper");
    expect(coerceModel("nonsense")).toBe(DEFAULT_MODEL);
    expect(coerceModel(null)).toBe(DEFAULT_MODEL);
    expect(coerceModel(undefined)).toBe(DEFAULT_MODEL);
  });
});
