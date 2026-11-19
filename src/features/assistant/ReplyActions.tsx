import type { ChatMessage } from "./useAssistant";

// The quiet actions under a reply (PATRONUS-WEB-TOOLS spec, tool-picker-spec.md).
// - Failed reply: "Retry" (always shown), plus "Retry with web search" when it was sent
//   without the web — the CLI's empty-reply-after-web-off error asks for exactly this.
// - Latest finished reply sent without the web: "Search the web", revealed on hover or
//   keyboard focus. It resends that same question with the web for that one message;
//   the chat's own setting is left off. Hidden by default so a private reflection isn't
//   nudged toward the internet under every answer.
export function ReplyActions({
  message: m,
  isLatest,
  webToolId,
  onRetry,
}: {
  message: ChatMessage;
  isLatest: boolean;
  webToolId?: string;
  onRetry: (text: string, options?: { tools?: string[] }) => void;
}) {
  if (m.role !== "assistant" || m.streaming || !m.prompt) return null;
  const prompt = m.prompt;
  const sentTools = m.tools ?? [];
  const canAddWeb = !!webToolId && !sentTools.includes(webToolId);
  const withWeb = () => onRetry(prompt, { tools: [...sentTools, webToolId!] });

  if (m.error) {
    return (
      <div className="flex gap-3">
        <button type="button" onClick={() => onRetry(prompt)} className={LINK}>
          Retry
        </button>
        {canAddWeb && (
          <button type="button" onClick={withWeb} className={LINK}>
            Retry with web search
          </button>
        )}
      </div>
    );
  }

  if (!isLatest || !canAddWeb) return null;
  return (
    <button
      type="button"
      onClick={withWeb}
      className={
        LINK +
        " opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      }
    >
      Search the web
    </button>
  );
}

const LINK =
  "mt-1 rounded-sm text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
