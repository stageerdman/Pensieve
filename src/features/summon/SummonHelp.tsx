// The "/" cheat-sheet: when the summon input starts with "/", show what you can type.
// Each example fills the bar (minus the slash) so discovery turns straight into use.

interface HelpItem {
  example: string;
  what: string;
}

const HELP: HelpItem[] = [
  { example: "last month", what: "filter by date — also this week, last 30 days, today or yesterday, this year" },
  { example: "#", what: "filter by tag — whispers your existing tags as you type #" },
  { example: "Notes", what: "filter by category — Tab to add it, Enter to search the word" },
  { example: "pinned", what: "only pinned thoughts" },
  { example: "#Weekly Review created last month", what: "combine — stacks a tag chip and a date chip" },
  { example: "tag contains one of #A, #B", what: "any-of — one chip matching several tags" },
  { example: "just type anything", what: "full-text search inside your notes (shown with a highlighted snippet)" },
];

export function SummonHelp({ onPick }: { onPick: (example: string) => void }) {
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl">
      <p className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-text-muted/70">
        Summon — what you can do
      </p>
      {HELP.map((h) => (
        <button
          key={h.example}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(h.example);
          }}
          className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-accent/10"
        >
          <span className="shrink-0 font-mono text-[12px] text-text">{h.example}</span>
          <span className="text-[12px] text-text-muted">{h.what}</span>
        </button>
      ))}
    </div>
  );
}
