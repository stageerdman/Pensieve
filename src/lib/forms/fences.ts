// fences.ts — the two forms block codecs, stored as `pensieve:*` code fences in the .md
// (same convention as pensieve:audio / pensieve:gallery — see src/lib/md/).
//
//   ```pensieve:scale            ```pensieve:charm
//   value: 4                     name: Compress
//   1: I could delete it         Read my Daily Reviews from the past week and …
//   2: Background noise          (the rest of the fence is the prompt, verbatim)
//   …                            ```
//   ```
//
// Pure + dependency-free (shared with the phone PWA).

export const SCALE_LANG = "pensieve:scale";
export const CHARM_LANG = "pensieve:charm";

export interface Scale {
  /** anchors[i] is the meaning of point i+1 ("" when a point has no anchor text). */
  anchors: string[];
  /** The picked point, 1..anchors.length; undefined = not rated yet. */
  value?: number;
}

export interface Charm {
  name: string;
  prompt: string;
}

export function parseScale(body: string): Scale {
  const anchors: string[] = [];
  let value: number | undefined;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const v = /^value:\s*(\d+)\s*$/i.exec(line);
    if (v) {
      value = Number(v[1]);
      continue;
    }
    const a = /^(\d+)\s*[:.)-]\s*(.*)$/.exec(line);
    if (a) anchors[Number(a[1]) - 1] = a[2].trim();
  }
  for (let i = 0; i < anchors.length; i++) anchors[i] ??= "";
  if (value !== undefined && (value < 1 || value > anchors.length)) value = undefined;
  return value === undefined ? { anchors } : { anchors, value };
}

export function encodeScale(s: Scale): string {
  const lines: string[] = [];
  if (s.value !== undefined) lines.push(`value: ${s.value}`);
  s.anchors.forEach((a, i) => lines.push(a ? `${i + 1}: ${a}` : `${i + 1}:`));
  return lines.join("\n");
}

export function parseCharm(body: string): Charm {
  const lines = body.split("\n");
  const m = /^name:\s*(.*)$/i.exec((lines[0] ?? "").trim());
  if (!m) return { name: "", prompt: body.trim() };
  return { name: m[1].trim(), prompt: lines.slice(1).join("\n").trim() };
}

export function encodeCharm(c: Charm): string {
  return c.prompt ? `name: ${c.name}\n${c.prompt}` : `name: ${c.name}`;
}

/** Wrap a codec body in its fence. */
export function fence(lang: string, body: string): string {
  return "```" + lang + "\n" + body + "\n```";
}
