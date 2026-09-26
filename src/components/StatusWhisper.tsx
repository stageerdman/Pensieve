import { useEffect, useState } from "react";
import type { SaveStatus } from "../hooks/useNotes";

// A whisper, not a shout (design.md). Shows "Saving…"/"Saved" bottom-right, then
// fades to near-invisible so the user stops thinking about saving.

export function StatusWhisper({ status }: { status: SaveStatus }) {
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (status === "saved") {
      setFaded(false);
      const t = setTimeout(() => setFaded(true), 2000);
      return () => clearTimeout(t);
    }
    setFaded(false);
  }, [status]);

  if (status === "idle") return null;

  return (
    <div
      className={
        "pointer-events-none fixed bottom-3 right-4 text-xs text-text-muted transition-opacity duration-700 " +
        (faded ? "opacity-20" : "opacity-70")
      }
    >
      {status === "saving" ? "Saving…" : "Saved"}
    </div>
  );
}
