// noteFormat.ts — Note <-> raw `.md` round-trip for real OneDrive sync.
//
// The desktop vault stores one raw `.md` per note: optional YAML frontmatter
// (categories/tags/links/icon — src/lib/md/frontmatter.ts) plus a Markdown body
// whose first prose line IS the title (src/lib/text.ts titleFromMarkdown). The
// Wand keeps title (`t`) and body (`c`) as separate fields for its UI, and has no
// editor for categories/tags/links or icon colour/vibrancy/shine — those desktop
// fields are carried through verbatim in `Note.foreign` (see types.ts) so a note
// pulled down and never touched by the owner round-trips byte-for-byte.
//
// Re-implemented here rather than imported from src/lib — the phone app is
// deliberately decoupled from the desktop `src/` tree (see lib/media/noteMedia.ts).
// The formats mirrored below (frontmatter shape, icon encoding, category hues) are
// small and stable, same rationale as the existing media/gallery duplication.

import type { ForeignMeta, Note } from "../../types";
import { CAT_HUE, type FlaskShape } from "../wand/flaskSvg";

// ---- frontmatter (mirrors src/lib/md/frontmatter.ts) ----

const FENCE = /^---\n([\s\S]*?)\n---\n?\n?/;

export interface Frontmatter {
  categories: string[];
  tags: string[];
  links: string[];
  icon?: { shape: string; color: string | number; vibrancy?: number; shine?: number };
}

function parseList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Mirrors src/lib/flasks/icon.ts parseIcon: `shape/color[/vibrancy/shine]`. */
function parseIconValue(raw: string): Frontmatter["icon"] | undefined {
  const parts = raw.trim().split("/").map((s) => s.trim());
  const [shape, colorRaw, v, s] = parts;
  if (!shape || !colorRaw) return undefined;
  const hueMatch = /^h(\d{1,3})$/.exec(colorRaw);
  const color: string | number = hueMatch ? Number(hueMatch[1]) : colorRaw;
  const icon: NonNullable<Frontmatter["icon"]> = { shape, color };
  const vn = Number(v);
  const sn = Number(s);
  if (v !== undefined && Number.isFinite(vn)) icon.vibrancy = Math.min(1, Math.max(0, vn / 100));
  if (s !== undefined && Number.isFinite(sn)) icon.shine = Math.min(1, Math.max(0, sn / 100));
  return icon;
}

/** Mirrors src/lib/flasks/icon.ts encodeIcon. */
function encodeIconValue(icon: NonNullable<Frontmatter["icon"]>): string {
  const colorStr = typeof icon.color === "number" ? `h${((Math.round(icon.color) % 360) + 360) % 360}` : icon.color;
  const base = `${icon.shape}/${colorStr}`;
  const isDefaultTone = (icon.vibrancy ?? 0.5) === 0.5 && (icon.shine ?? 0.5) === 0.5;
  if (isDefaultTone) return base;
  const pct = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100);
  return `${base}/${pct(icon.vibrancy ?? 0.5)}/${pct(icon.shine ?? 0.5)}`;
}

/** Split raw `.md` file text into frontmatter fields + the Markdown body. */
export function parseFrontmatter(raw: string): { fields: Frontmatter; body: string } {
  const m = raw.match(FENCE);
  if (!m) return { fields: { categories: [], tags: [], links: [] }, body: raw };

  const fields: Frontmatter = { categories: [], tags: [], links: [] };
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "categories") fields.categories = parseList(value);
    else if (key === "tags") fields.tags = parseList(value);
    else if (key === "links") fields.links = parseList(value);
    else if (key === "icon") {
      const icon = parseIconValue(value.replace(/^["']|["']$/g, ""));
      if (icon) fields.icon = icon;
    }
  }
  return { fields, body: raw.slice(m[0].length) };
}

/** Compose frontmatter + body into raw `.md` file text. No metadata → body unchanged. */
export function composeFrontmatter(fields: Frontmatter, body: string): string {
  const hasMeta = fields.categories.length > 0 || fields.tags.length > 0 || fields.links.length > 0 || !!fields.icon;
  if (!hasMeta) return body;
  const lines: string[] = ["---"];
  if (fields.categories.length) lines.push(`categories: [${fields.categories.join(", ")}]`);
  lines.push(`tags: [${fields.tags.join(", ")}]`);
  lines.push(`links: [${fields.links.join(", ")}]`);
  if (fields.icon) lines.push(`icon: ${encodeIconValue(fields.icon)}`);
  lines.push("---", "");
  return lines.join("\n") + "\n" + body;
}

// ---- title <-> body (mirrors src/lib/text.ts titleFromMarkdown's line-walk) ----

function isFenceLine(line: string): boolean {
  return /^(```|~~~)/.test(line);
}

/** Split a desktop-style body (title as its first prose line) into the Wand's
 *  separate title + body fields. Mirrors titleFromMarkdown's skip rules (fences,
 *  blank lines, lone image lines) so the two apps agree on which line IS the title. */
export function splitTitleAndBody(md: string): { title: string; body: string } {
  const lines = md.split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/​/g, "").trim();
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) continue;
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(line)) continue; // a lone image is not a title
    // Strip heading AND list marks — a note whose first line is a bullet/numbered/checklist
    // item still gets a clean title, not "* Co tím myslíte?" with the marker baked in; the
    // whole raw line (marker included) is still removed from `rest` below either way.
    const title = line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();
    if (!title) continue;
    const rest = lines.slice(0, i).concat(lines.slice(i + 1));
    // Drop one leading blank line left behind by the removed title, if any.
    if (rest[0] === "") rest.shift();
    return { title, body: rest.join("\n") };
  }
  return { title: "", body: md };
}

/** Inverse of splitTitleAndBody: join the Wand's title + body back into one
 *  desktop-compatible body (title as a plain first line — titleFromMarkdown
 *  accepts a plain line just as readily as a heading). */
export function joinTitleAndBody(title: string, body: string): string {
  const t = title.trim();
  const b = body ?? "";
  if (!t) return b;
  return b.trim() ? `${t}\n\n${b}` : t;
}

// ---- category/icon <-> the Wand's flask cat+shape (lossy render only; the exact
// desktop encoding always round-trips through Note.foreign, untouched) ----

/** Desktop src/lib/categories/palette.ts KEY_HUE, duplicated (small, stable table). */
const DESKTOP_KEY_HUE: Record<string, number> = {
  gray: 220,
  brown: 25,
  orange: 24,
  yellow: 44,
  green: 145,
  blue: 212,
  purple: 270,
  pink: 330,
  red: 0,
};

/** Phone token -> hue, from flaskSvg's CAT_HUE triples ("h s% l%" -> just h). */
const PHONE_CAT_HUE: Record<string, number> = Object.fromEntries(
  Object.entries(CAT_HUE).map(([token, triple]) => [token, Number(triple.split(" ")[0])]),
);

function circularDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Nearest phone `--cat-*` token for an arbitrary hue — used to RENDER any desktop
 *  icon colour (including ones with no phone equivalent, like gray/brown) on the Wand. */
export function nearestPhoneCat(hue: number): string {
  let best = "vial";
  let bestDist = Infinity;
  for (const [token, h] of Object.entries(PHONE_CAT_HUE)) {
    const d = circularDist(hue, h);
    if (d < bestDist) {
      bestDist = d;
      best = token;
    }
  }
  return best;
}

/** A desktop icon colour (palette key or raw hue) -> its hue, for nearestPhoneCat. */
export function desktopColorHue(color: string | number): number {
  return typeof color === "number" ? ((Math.round(color) % 360) + 360) % 360 : DESKTOP_KEY_HUE[color] ?? 220;
}

/** Phone token -> a desktop-valid icon colour. All 7 shared names ARE desktop
 *  CategoryColor keys; "--cat-gold" has no desktop key, so it rides as a raw hue
 *  (lossless — desktop accepts any 0..359 hue). */
export function phoneCatToDesktopColor(cat: string): string | number {
  const name = cat.replace(/^--cat-/, "");
  if (name === "gold") return PHONE_CAT_HUE[cat] ?? 43;
  return name;
}

const DESKTOP_TO_PHONE_SHAPE: Record<string, FlaskShape> = {
  "round-bottom": "round",
  "potion-bottle": "potion",
  erlenmeyer: "erlenmeyer",
  vial: "vial",
  teardrop: "teardrop",
  beaker: "beaker",
};
const PHONE_TO_DESKTOP_SHAPE: Record<FlaskShape, string> = {
  round: "round-bottom",
  potion: "potion-bottle",
  erlenmeyer: "erlenmeyer",
  vial: "vial",
  teardrop: "teardrop",
  beaker: "beaker",
};

export function desktopShapeToPhone(shape: string): FlaskShape {
  return DESKTOP_TO_PHONE_SHAPE[shape] ?? "vial";
}
export function phoneShapeToDesktop(shape: FlaskShape): string {
  return PHONE_TO_DESKTOP_SHAPE[shape] ?? "vial";
}

// ---- recency labels (mirrors the vocabulary lib/wand/accioQuery.ts's dayBucket
// expects: "Just now"/"<n>m ago"/"Today"/"Yesterday"/a weekday/an older short date) ----

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** A static display label for an epoch, snapshotted at write time — same convention
 *  as the rest of the app (it doesn't live-tick; it's refreshed on the next edit/sync). */
export function labelFromEpoch(epoch: number, now = Date.now()): string {
  const diff = now - epoch;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  const today = startOfDay(now);
  const day = startOfDay(epoch);
  if (day === today) return "Today";
  if (day === today - 86_400_000) return "Yesterday";
  if (today - day < 7 * 86_400_000) return WEEKDAYS[new Date(epoch).getDay()];
  const d = new Date(epoch);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ---- Note <-> remote `.md` ----

export interface RemoteNoteTimes {
  createdAt?: number;
  updatedAt?: number;
}

/** Build the raw `.md` text (frontmatter + body) for a note, as the sync engine
 *  pushes/compares it. Desktop-only metadata rides through from `note.foreign`
 *  untouched; the Wand-editable title/body/icon are re-derived from the live fields. */
export function noteToRemoteContent(note: Note): string {
  const body = joinTitleAndBody(note.t, note.c);
  const f = note.foreign;
  const fields: Frontmatter = {
    categories: f?.categories ?? [],
    tags: f?.tags ?? [],
    links: f?.links ?? [],
    icon: {
      shape: phoneShapeToDesktop(note.shape),
      color: f?.iconColor ?? phoneCatToDesktopColor(note.cat),
      vibrancy: f?.iconVibrancy,
      shine: f?.iconShine,
    },
  };
  return composeFrontmatter(fields, body);
}

/** Parse raw `.md` text (as pulled from OneDrive) into a Note, merging onto `existing`
 *  (if the id was already known locally) so phone-only bookkeeping — `isNew`/`fresh`,
 *  and `foreign.pinned` which has no frontmatter home — survives a re-pull. */
export function noteFromRemoteContent(id: string, content: string, times: RemoteNoteTimes, existing?: Note): Note {
  const { fields, body } = parseFrontmatter(content);
  const { title, body: rest } = splitTitleAndBody(body);
  const createdAt = times.createdAt ?? existing?.createdAt ?? Date.now();
  const updatedAt = times.updatedAt ?? Date.now();
  const icon = fields.icon;
  const cat = icon ? nearestPhoneCat(desktopColorHue(icon.color)) : (existing?.cat ?? "--cat-blue");
  const shape = icon ? desktopShapeToPhone(icon.shape) : (existing?.shape ?? "vial");
  const foreign: ForeignMeta = {
    categories: fields.categories,
    tags: fields.tags,
    links: fields.links,
    pinned: existing?.foreign?.pinned ?? false,
    iconColor: icon?.color ?? existing?.foreign?.iconColor ?? cat.replace(/^--cat-/, ""),
    iconVibrancy: icon?.vibrancy,
    iconShine: icon?.shine,
  };
  return {
    id,
    t: title,
    c: rest,
    cat,
    shape,
    fill: Math.min(1, Math.max(0.18, rest.length / 220)),
    d: labelFromEpoch(updatedAt),
    created: existing?.created ?? labelFromEpoch(createdAt),
    createdAt,
    updatedAt,
    foreign,
  };
}
