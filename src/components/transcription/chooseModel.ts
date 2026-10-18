// A tiny imperative model chooser for the manual "Create / Regenerate transcript" action.
// The owner's rule: automatic transcription is silent (Czech), but a MANUAL transcribe asks
// one quick question — English (fast / Parakeet) or Czech (best quality / default). Promise
// resolves with the chosen model, or null if dismissed. Plain DOM + token CSS vars so it
// reads correctly in either theme and needs no React tree.
import type { TranscriptionModel } from "../../lib/transcripts/models";

export function chooseTranscriptionModel(): Promise<TranscriptionModel | null> {
  return new Promise((resolve) => {
    const css = (s: string) => s; // readability only
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Choose transcription language");
    overlay.style.cssText = css(
      "position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:hsl(var(--surface)/0.55);backdrop-filter:blur(2px);",
    );

    const card = document.createElement("div");
    card.style.cssText = css(
      "min-width:280px;max-width:340px;border:1px solid hsl(var(--border));background:hsl(var(--surface-raised));border-radius:12px;padding:16px;box-shadow:0 20px 50px -20px hsl(0 0% 0%/0.5);font-family:var(--font-sans);",
    );
    const title = document.createElement("p");
    title.textContent = "Transcribe this recording";
    title.style.cssText = css("margin:0 0 2px;font-size:14px;font-weight:600;color:hsl(var(--text));");
    const sub = document.createElement("p");
    sub.textContent = "Which language model should read it?";
    sub.style.cssText = css("margin:0 0 14px;font-size:12px;color:hsl(var(--text-muted));");
    card.append(title, sub);

    const makeBtn = (label: string, hint: string, primary: boolean, onClick: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = css(
        `display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:14px;text-align:left;border:1px solid ${
          primary ? "hsl(var(--accent))" : "hsl(var(--border))"
        };background:${primary ? "hsl(var(--accent))" : "hsl(var(--surface))"};color:${
          primary ? "hsl(var(--surface))" : "hsl(var(--text))"
        };`,
      );
      const l = document.createElement("span");
      l.textContent = label;
      l.style.fontWeight = "600";
      const h = document.createElement("span");
      h.textContent = hint;
      h.style.cssText = css(`font-size:11px;opacity:0.8;color:${primary ? "hsl(var(--surface))" : "hsl(var(--text-muted))"};`);
      b.append(l, h);
      b.onclick = onClick;
      return b;
    };

    let done = false;
    const close = (val: TranscriptionModel | null) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      else if (e.key === "Enter") { e.preventDefault(); close("czech-whisper"); }
    };

    const czech = makeBtn("Czech", "best quality · default", true, () => close("czech-whisper"));
    const english = makeBtn("English", "fast", false, () => close("parakeet"));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = css("margin-top:12px;width:100%;border:none;background:transparent;color:hsl(var(--text-muted));font-size:12px;cursor:pointer;");
    cancel.onclick = () => close(null);

    card.append(czech, english, cancel);
    overlay.append(card);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    czech.focus();
  });
}
