// seed.ts — stand-in vault data (the prototype's DATA, source ~619-638).
//
// Pure data so the reel has content with no auth / no real vault — exactly as the
// prototype ran. `createSeed()` returns a FRESH array each call (ids assigned, and
// `created` seeded from the live `.d` label) so each app instance owns its own
// mutable copy.

import type { Note } from "./types";

type SeedRecord = Omit<Note, "id" | "created">;

const RAW: SeedRecord[] = [
  { t: "The bridge idea for the sync layer", c: "If each flask carries its own cTag, I never have to diff the whole vault — just ask Graph what moved since the last delta token. Lightweight by design.", cat: "--cat-blue", shape: "round", fill: 0.8, d: "2m ago" },
  { t: "Why mornings feel heavier lately", c: "Noticed I open the day reacting instead of choosing. One line before coffee — what matters today — seems to reset it.", cat: "--cat-purple", shape: "erlenmeyer", fill: 0.6, d: "Today" },
  { t: "Dad's story about the lighthouse", c: "He said the keeper never watched the sea — he watched the lamp. The job was to keep the light, not to fear the dark.", cat: "--cat-gold", shape: "potion", fill: 0.95, d: "Yesterday" },
  { t: "Run — 6k, felt effortless", c: "Negative split without trying. Sleep was 7h40. The two are the same sentence.", cat: "--cat-green", shape: "vial", fill: 0.4, d: "Yesterday" },
  { t: "A name for the coach mode", c: "Not 'assistant'. Something that reads the whole pensieve and tells me what I keep circling back to. 'The Mirror'?", cat: "--cat-pink", shape: "teardrop", fill: 0.5, d: "Mon" },
  { t: "Groceries + the olive oil place", c: "The small tin from the Tuesday market, lemons, the sourdough starter needs feeding Thursday.", cat: "--cat-orange", shape: "beaker", fill: 0.3, d: "Mon" },
  { t: "Half-dream: the glass library", c: "Rooms made of vials, each glowing a different colour. I could pour a memory from one shelf into another and it would change colour.", cat: "--cat-purple", shape: "potion", fill: 0.7, d: "Sun" },
  { t: "Quote I don't want to lose", c: "'We are what we repeatedly do.' Stick it where the morning line lives.", cat: "--cat-yellow", shape: "vial", fill: 0.45, d: "Sun" },
  { t: "The phone app is capture, not control", c: "Open, thumb, done. Everything at the bottom. The desktop can be the cathedral; the phone is the doorway.", cat: "--cat-blue", shape: "round", fill: 0.85, d: "Sat" },
  { t: "Idea: flasks should breathe", c: "A barely-there scale pulse on the focused flask. Alive, not animated. 4s cycle, ease.", cat: "--cat-green", shape: "erlenmeyer", fill: 0.55, d: "Sat" },
  { t: "Call Mara back about the trip", c: "She floated the last week of June. Check if the cabin by the water is still open before replying.", cat: "--cat-red", shape: "teardrop", fill: 0.35, d: "Fri" },
  { t: "What 'extremely fast' really means", c: "Not benchmarks. It means the gap between having a thought and it being safe is near zero. Design for that gap.", cat: "--cat-blue", shape: "beaker", fill: 0.6, d: "Fri" },
];

/** A fresh, mutable copy of the seed vault with ids assigned and `created` seeded
 *  from the live label (source ~638: `DATA.forEach(d => { d.id = ++uid; d.created = d.d; })`). */
export function createSeed(): Note[] {
  return RAW.map((r, i) => ({ ...r, id: i + 1, created: r.d }));
}
