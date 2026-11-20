// supersedes.ts — PURE: does the remote copy of a memory already hold everything the
// phone's copy has? Then a "both changed" note is not a real conflict and the remote's
// copy can simply be taken.
//
// Why this exists: the phone has no conflict-resolution UI, so a both-changed note stays
// stuck forever — never pulled, never pushed. It happened for real (2026-11-20): a recording
// made on the phone, renamed + transcribed on the Mac; merely opening it on the phone bumped
// its updatedAt, and the phone kept "New Recording" from then on.
//
// "Adds nothing" means: every body line of the phone's copy is in the remote's (an untouched
// capture placeholder like "New Recording" doesn't count), and every category/tag/link/extra
// field it has is in the remote's too. The flask icon is cosmetic and ignored — the remote's
// wins. Cost of a wrong "yes": a line deleted on the phone comes back; nothing is lost.

import { CAPTURE_PLACEHOLDER_LINES } from "../capturePlaceholders";
import { parseFrontmatter, type Frontmatter } from "./noteFormat";

function contentLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/​/g, "").trim().replace(/^#{1,6}\s+/, ""))
    .filter(Boolean);
}

function metaCovered(local: Frontmatter, remote: Frontmatter): boolean {
  const within = (mine: string[], theirs: string[]) => mine.every((x) => theirs.includes(x));
  return (
    within(local.categories, remote.categories) &&
    within(local.tags, remote.tags) &&
    within(local.links, remote.links) &&
    Object.entries(local.extra ?? {}).every(([k, v]) => remote.extra?.[k] === v)
  );
}

export function remoteSupersedesLocal(local: string, remote: string): boolean {
  const l = parseFrontmatter(local);
  const r = parseFrontmatter(remote);
  if (!metaCovered(l.fields, r.fields)) return false;
  const remoteLines = new Set(contentLines(r.body));
  return contentLines(l.body).every((line) => remoteLines.has(line) || CAPTURE_PLACEHOLDER_LINES.has(line));
}
