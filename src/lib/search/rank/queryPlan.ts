// A typed query, read once per keystroke into what the ranker needs:
//  - `phrase`: EVERY token, space-joined with a leading space (" what do i want tod") — the
//    shape of `normalize()` output, so "phrase in field" is one `includes`, and the last
//    token naturally matches as a prefix (the word still being typed).
//  - `terms`: the tokens that may make a note match — no stop words, no one-letter tokens.
// No terms → the text constrains nothing ("I", "what do" never match alone).

import { tokenize } from "../tokenize";
import { STOP_WORDS } from "./stopwords";

export interface QueryPlan {
  phrase: string;
  terms: string[];
}

export function isMatchable(token: string): boolean {
  return token.length > 1 && !STOP_WORDS.has(token);
}

export function planQuery(text: string): QueryPlan {
  const tokens = tokenize(text);
  return {
    phrase: tokens.length ? " " + tokens.join(" ") : "",
    terms: [...new Set(tokens.filter(isMatchable))],
  };
}

/** A field as space-delimited tokens (" morning walk "), the form phrase/term checks run on. */
export function normalize(text: string): string {
  return normalizeTokens(tokenize(text));
}

/** `normalize` for callers that already tokenized (the index — one pass per body). */
export function normalizeTokens(tokens: readonly string[]): string {
  return tokens.length ? " " + tokens.join(" ") + " " : "";
}
