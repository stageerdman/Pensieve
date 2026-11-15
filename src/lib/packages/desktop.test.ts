import { describe, expect, it } from "vitest";
import type { RawMemory } from "../types";
import { listPackagesToResolve, listUnprocessedRawBatches } from "../raw/queue";
import { listUntranscribedAudio } from "../transcripts/queue";
import { mergeNewPackageItems } from "../../components/transcription/queueOps";
import { memoryFromPackage, packageRestorePoint, transcriptLanguage } from "./resolve";
import { recordMediaRefs, withPatronus } from ".";

const BODY = "Daily\n\n**Q?**\n\n```pensieve:audio\nmedia/p1/a.wav\n```";
const pkg: RawMemory = {
  id: "p1", status: "synced", createdAt: 100, pages: [], kind: "form", title: "Daily — Fri", fromForm: "f1",
  markdown: withPatronus(BODY, { spell: "sync", instruction: "Fill it in." }), media: ["media/p1/a.wav"],
};
const journal: RawMemory = { id: "j1", status: "synced", createdAt: 1, pages: ["media/j1/p.jpg"] };

describe("packages on the desktop", () => {
  it("journal rows and package rows are told apart", async () => {
    const store = { listRawMemories: async () => [pkg, journal, { ...pkg, id: "p2", status: "capturing" as const }] };
    expect(await listUnprocessedRawBatches(store)).toEqual([{ id: "j1", pageCount: 1 }]);
    expect(await listPackagesToResolve(store)).toEqual([{ id: "p1", title: "Daily — Fri" }]);
    // a run the app quit mid-way is picked up again
    expect(await listPackagesToResolve({ listRawMemories: async () => [{ ...pkg, status: "processing" }] })).toHaveLength(1);
  });

  it("the plain auto-transcriber leaves a package's recording to Patronus", async () => {
    const store = {
      listMedia: async () => ["media/p1/a.wav", "media/n1/b.wav"],
      loadTranscript: async () => null,
      listRawMemories: async () => [pkg],
    };
    expect((await listUntranscribedAudio(() => "", store)).map((i) => i.ref)).toEqual(["media/n1/b.wav"]);
  });

  it("one queue row per package, de-duped", () => {
    const once = mergeNewPackageItems([], [{ id: "p1", title: "Daily" }]);
    expect(once).toMatchObject([{ ref: "p1", type: "package", title: "Daily", order: 1 }]);
    expect(mergeNewPackageItems(once, [{ id: "p1", title: "Daily" }])).toBe(once);
  });

  it("resolves into a memory with the SAME id, its capture time, fromForm; restore point = what the phone sent", () => {
    const m = memoryFromPackage(pkg, BODY + "\n\nfilled", 999);
    expect(m).toMatchObject({ id: "p1", createdAt: 100, addedAt: 999, extra: { fromForm: "f1" } });
    expect(packageRestorePoint(pkg, 999)).toEqual({ ts: 998, wordDelta: 0, markdown: BODY, label: "before-ai" });
  });

  it("sync downloads pages AND package media; transcript language is read from its model", () => {
    expect(recordMediaRefs(pkg)).toEqual(["media/p1/a.wav"]);
    expect(recordMediaRefs(journal)).toEqual(["media/j1/p.jpg"]);
    const t = (model: string) => ({ version: 1, media: "", meta: { model }, segments: [] });
    expect(transcriptLanguage(t("mikr/whisper-large-v3-czech-cv13"))).toBe("czech");
    expect(transcriptLanguage(t("mlx-community/parakeet-tdt-0.6b-v3"))).toBe("english");
    expect(transcriptLanguage(t(""))).toBeUndefined();
  });
});
