// media.ts — the media a note spell may see and unlink. "Remove" only takes the reference out
// of the memory's text: the bytes stay on the Mac, OneDrive and the phone (nothing in Pensieve
// auto-deletes media), so a Timeline restore brings it back whole. Pure.

import { extractMediaRefs, parseMediaPath } from "../../media/ref";
import { isAudioRef } from "../../transcripts/audioRef";

export type MediaKind = "audio" | "video" | "image";

const VIDEO_EXTS = new Set(["mp4", "mov", "m4v"]);

export function mediaKind(ref: string): MediaKind {
  if (isAudioRef(ref)) return "audio";
  return VIDEO_EXTS.has(parseMediaPath(ref)?.ext.toLowerCase() ?? "") ? "video" : "image";
}

export const mediaIn = (markdown: string): { ref: string; kind: MediaKind }[] =>
  extractMediaRefs(markdown).map((ref) => ({ ref, kind: mediaKind(ref) }));

const FENCE_OPEN = /^\s*(```|~~~)/;

/** `markdown` with every mention of `ref` taken out: a fence that holds only that media goes
 *  whole; inside a fence with several (a gallery) just its line goes; an inline `![..](ref)`
 *  goes. Blank-line runs it leaves collapse. */
export function unlinkMedia(markdown: string, ref: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) {
      const line = lines[i].replace(new RegExp(`!\\[[^\\]]*\\]\\(${escape(ref)}[^)]*\\)`, "g"), "");
      if (line.trim() || !lines[i].trim()) out.push(line);
      continue;
    }
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== open[1]) j++;
    const inner = lines.slice(i + 1, j);
    const kept = inner.filter((l) => !l.includes(ref));
    const onlyThis = kept.length !== inner.length && !kept.some((l) => extractMediaRefs(l).length);
    if (!onlyThis) out.push(lines[i], ...kept, ...(j < lines.length ? [lines[j]] : []));
    i = j;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
