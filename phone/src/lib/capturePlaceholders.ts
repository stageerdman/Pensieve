// capturePlaceholders.ts — the title + body a Snap/Record/Film capture mints a memory with,
// before the owner has named it. Shared so sync can tell "still the placeholder" from a
// real phone-side edit (see sync/supersedes.ts).

export const CAPTURE_PLACEHOLDER = {
  image: { title: "New Image", body: "added image" },
  voice: { title: "New Recording", body: "added recording" },
  video: { title: "New Video", body: "added video" },
} as const;

export const CAPTURE_PLACEHOLDER_LINES: ReadonlySet<string> = new Set(
  Object.values(CAPTURE_PLACEHOLDER).flatMap((p) => [p.title, p.body]),
);
