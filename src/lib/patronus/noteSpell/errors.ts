// errors.ts — two kinds of trouble, handled differently by the queue job:
//   NoteSpellFailure — the SPELL failed (Patronus gave nothing usable, asked for something it
//                      may not do, never finished, the AI call errored or timed out). Written
//                      into the block once: `state: failed` + a one-line `error:`.
//   anything else    — a MAC problem (Claude not installed / logged out, the transcriber
//                      broke, media not here yet). Nothing is written; the block stays
//                      pending and the Process row shows the error.

export class NoteSpellFailure extends Error {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = "NoteSpellFailure";
  }
}

const MAC_PROBLEM = /spawn failed|is `claude` installed|not logged in|log ?in|authenticat|MCP tools|temp dir/i;

/** An AI-call rejection → a spell failure, unless it's the Mac's own setup that's broken. */
export function classifyAskError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (MAC_PROBLEM.test(msg)) return e instanceof Error ? e : new Error(msg);
  return new NoteSpellFailure(`Patronus couldn't answer: ${msg.split("\n")[0].slice(0, 160)}`, { cause: e });
}
