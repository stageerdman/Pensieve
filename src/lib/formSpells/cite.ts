// cite.ts — a spell's parsed reply → the Answers the form-fill writer applies
// (lib/forms applyAnswers), with every point carrying DATE CHIPS: the existing note-link
// inline `{@id|label}` (lib/md/extended.ts), labelled with the cited memory's day
// ("Fri 13 Nov", the same label a form memory's title carries). Clicking a chip opens that
// memory. The date comes from the memory itself, never from the model.
//
// Pure.

import { dayLabel, type Answers } from "../forms";
import type { SpellAnswers } from "./prompt";

export interface CitedMemory {
  id: string;
  createdAt: number;
}

export function dateChip(m: CitedMemory): string {
  return `{@${m.id}|${dayLabel(new Date(m.createdAt))}}`;
}

/** Points become `* statement {@id|Mon 9 Nov} {@id|Wed 11 Nov}` bullet lines (chips oldest
 *  first). A point with no source that resolved to a real memory is dropped: an answer
 *  without a citation is exactly what the chips exist to prevent. */
export function toAnswers(parsed: SpellAnswers, cited: Map<string, CitedMemory>): { answers: Answers; dropped: number } {
  const answers: Answers = {};
  let dropped = 0;
  for (const [id, a] of Object.entries(parsed)) {
    const lines: string[] = [];
    for (const p of a.points ?? []) {
      const chips = p.sources
        .map((s) => cited.get(s))
        .filter((m): m is CitedMemory => !!m)
        .sort((x, y) => x.createdAt - y.createdAt)
        .map(dateChip);
      if (!chips.length) {
        dropped++;
        continue;
      }
      lines.push(`* ${p.text} ${chips.join(" ")}`);
    }
    const entry: Answers[string] = {};
    if (lines.length) entry.text = lines.join("\n");
    if (a.scale !== undefined) entry.scale = a.scale;
    if (a.check?.length) entry.check = a.check;
    if (Object.keys(entry).length) answers[id] = entry;
  }
  return { answers, dropped };
}
