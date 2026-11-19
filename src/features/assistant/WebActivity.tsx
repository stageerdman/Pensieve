import { useState } from "react";
import { Globe, ChevronDown } from "../../components/icons";
import type { WebCall, WebSource } from "../../lib/ai/askAgent";
import { openUrl } from "../../lib/sync/native";

// What a reply did on the web (PATRONUS-WEB-TOOLS spec, tool-picker-spec.md):
//   while streaming → "Searching the web: <query>" — progress, and proof of exactly
//                     which words left the machine;
//   after          → one quiet, collapsed line "Searched the web · N sources"; opening
//                     it lists every query/URL sent, then the sources as chips that
//                     look unlike note chips (pill + globe + site) and open in the browser.
export function WebActivity({
  calls,
  streaming,
}: {
  calls: WebCall[];
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (calls.length === 0) return null;

  if (streaming) {
    const last = calls[calls.length - 1];
    return (
      <div
        role="status"
        className="mb-1.5 flex items-center gap-1.5 text-xs text-text-muted"
      >
        <Globe size={12} className="shrink-0 animate-pulse text-accent" />
        <span className="truncate">
          {last.kind === "search" ? "Searching the web: " : "Reading "}
          <span className="italic text-text">
            {last.kind === "search" ? last.detail : siteOf(last.detail)}
          </span>
        </span>
      </div>
    );
  }

  const sources = uniqueSources(calls);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-sm text-xs text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Globe size={12} />
        Searched the web
        {sources.length > 0 &&
          ` · ${sources.length} source${sources.length === 1 ? "" : "s"}`}
        <ChevronDown
          size={12}
          className={"transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
            {calls.map((c, i) => (
              <li key={i} className="truncate">
                {c.kind === "search" ? "Searched " : "Read "}
                <span className="italic text-text">{c.detail}</span>
              </li>
            ))}
          </ul>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <SourceChip key={s.url} source={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceChip({ source }: { source: WebSource }) {
  const site = siteOf(source.url);
  const title = source.title?.trim() || site;
  return (
    <button
      type="button"
      onClick={() => void openUrl(source.url).catch(() => {})}
      title={`Open ${source.url} in the browser`}
      className="flex max-w-full items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-xs text-text transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Globe size={11} className="shrink-0 text-text-muted" />
      <span className="max-w-[160px] truncate">{title}</span>
      {title !== site && (
        <span className="shrink-0 text-text-muted">· {site}</span>
      )}
    </button>
  );
}

/** "https://www.example.com/a/b" → "example.com". Falls back to the raw text. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Every source across the reply's calls, each URL once, in the order found. */
export function uniqueSources(calls: WebCall[]): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const c of calls)
    for (const s of c.sources)
      if (!seen.has(s.url)) {
        seen.add(s.url);
        out.push(s);
      }
  return out;
}
