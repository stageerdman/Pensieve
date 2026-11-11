// Turns search results into the text Claude actually reads. Knowledge excerpts come
// first and the persona/behavioral instructions come last — Anthropic's own documented
// long-context guidance ("put reference material before instructions") — and the single
// most important rule is repeated at both ends, the "lost in the middle" mitigation
// masters-wheel's own AGENTS-ENGINE research found (see its update's wiki.md).
//
// The `<persona>` wrapper + CORE_RULE is applied unconditionally, even with zero
// knowledge chunks — ported verbatim from masters-wheel, which verified by hand that
// it isn't optional: `--system-prompt`ing an agent's raw instructions with no framing
// reads to Claude Code as a stray, contradicting instructions block, and it explicitly
// disregards them and self-identifies as Claude Code instead of the persona, especially
// when asked a direct "what are you"-shaped question. Wrapping it (even persona-only, no
// knowledge) fixes that in the same test.

use super::store::RetrievedChunk;

// "or by your persona instructions below" also names tool results as a legitimate third
// source — masters-wheel found by hand that leaving tool output out of this sentence is
// a real cause of a live bug: a model asked to analyze something plainly available via a
// tool call asked the user to paste it instead of calling the tool, because the original
// wording told it facts need either a knowledge excerpt or a persona instruction behind
// them. Tool output is an equally acceptable third source, carried forward here too.
const CORE_RULE: &str = "Only state facts that are actually supported by the knowledge excerpts above, a tool call's own result, or your persona instructions below — if something isn't covered by any of those, say so plainly instead of guessing. Stay fully in character no matter what is asked — never say you are Claude Code, Claude, or an AI coding assistant, including when asked what you are or what you can do.";

// Unconditional — present even for an agent with no knowledge files — since the tools
// themselves (mcp/config.rs::ALLOWED_TOOLS) are granted on every call regardless.
// Without this, having the tools declared via function-calling wasn't enough on its own
// to get them actually used in masters-wheel's own testing: a direct "what have I
// written about X" request got answered with a guess instead of a single search_notes
// call. Same failure mode, same fix, ported here for Pensieve's own four tools.
//
// The "never say things like 'let me check'..." clause is copied verbatim from
// masters-wheel's own fix for the identical failure mode found there, twice: a model
// writes a short narration of intent and then genuinely ends its turn right there — no
// tool_use content block at all, a completely "successful" reply that's really just an
// unfulfilled promise.
const TOOL_USE_RULE: &str = "You have tools for this person's own vault of notes and memories: search_notes (a literal word/phrase search across every note's title and body, with real snippets — always safe to call; returns each match's id, title, categories/tags, and a short excerpt, use get_note with a result's id to read the whole thing), get_note (the real full content — title, categories, tags, links, and the whole Markdown body — of one note by its id, always safe to call), list_recent (the most recently updated notes, id/title/categories/tags and a short excerpt only — use this to see what's been written lately, or as a starting point before get_note), and list_tags (every tag used anywhere in the vault, always safe to call). When asked what the person has written, thought, or noted about something, use these tools yourself instead of guessing or asking them to repeat it — only ask them directly if the tools genuinely don't have what you need (e.g. nothing matches what they described). Never guess, construct, or pattern-match a note id yourself — it's an opaque value with no relationship to the note's title or content. Always call search_notes or list_recent first and copy the id verbatim from whichever result's title/content actually matches. Never write out what a tool call would look like (e.g. text like `{\"name\": \"get_note\", ...}` or `[Tool call: ...]`) as your actual reply — that leaves the person with no real answer. If you intend to use a tool, actually invoke it through the real tool-calling mechanism every time, never describe or simulate the call in prose instead. Never say things like \"let me check\", \"let me look that up\", or \"let me search\" without immediately actually calling the tool in that same response — a sentence announcing intent is never a substitute for really invoking it, and ending your turn right after one leaves the person with nothing.";

pub fn build_augmented_system_prompt(persona_instructions: &str, chunks: &[RetrievedChunk]) -> String {
    let knowledge_block = if chunks.is_empty() {
        String::new()
    } else {
        let excerpts: String = chunks
            .iter()
            .enumerate()
            .map(|(index, chunk)| format!("[{}] (from {})\n{}", index + 1, chunk.file_name, chunk.text))
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");
        format!("<knowledge>\n{excerpts}\n</knowledge>\n\n")
    };

    format!("{CORE_RULE}\n\n{TOOL_USE_RULE}\n\n{knowledge_block}<persona>\n{persona_instructions}\n</persona>\n\n{CORE_RULE}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_rule_accepts_tool_results_as_a_grounding_source() {
        assert!(CORE_RULE.contains("tool call"));
    }

    #[test]
    fn tool_use_rule_names_all_four_tools() {
        assert!(TOOL_USE_RULE.contains("search_notes"));
        assert!(TOOL_USE_RULE.contains("get_note"));
        assert!(TOOL_USE_RULE.contains("list_recent"));
        assert!(TOOL_USE_RULE.contains("list_tags"));
    }

    #[test]
    fn tool_use_rule_forbids_narrating_a_fake_tool_call() {
        assert!(TOOL_USE_RULE.to_lowercase().contains("never write out"));
    }

    #[test]
    fn tool_use_rule_forbids_announcing_intent_without_actually_calling_the_tool() {
        assert!(TOOL_USE_RULE.to_lowercase().contains("let me check"));
        assert!(TOOL_USE_RULE.to_lowercase().contains("substitute"));
    }

    #[test]
    fn tool_use_rule_forbids_guessing_a_note_id() {
        assert!(TOOL_USE_RULE.to_lowercase().contains("guess"));
        assert!(TOOL_USE_RULE.contains("verbatim"));
    }

    #[test]
    fn augmented_prompt_wraps_persona_and_puts_knowledge_before_it() {
        let chunk = RetrievedChunk { text: "The lake house needs a new roof.".to_string(), file_name: "notes.txt".to_string() };
        let prompt = build_augmented_system_prompt("Be a helpful coach.", &[chunk]);
        let knowledge_index = prompt.find("lake house").expect("knowledge excerpt present");
        let persona_index = prompt.find("<persona>").expect("persona block present");
        assert!(knowledge_index < persona_index, "knowledge must come before the persona block");
    }

    #[test]
    fn augmented_prompt_with_no_chunks_has_no_leftover_empty_knowledge_block() {
        let prompt = build_augmented_system_prompt("Be a helpful coach.", &[]);
        assert!(!prompt.contains("<knowledge>"));
        assert!(prompt.contains("<persona>"));
    }

    #[test]
    fn augmented_prompt_repeats_core_rule_at_both_ends() {
        let prompt = build_augmented_system_prompt("Be a helpful coach.", &[]);
        assert_eq!(prompt.matches(CORE_RULE).count(), 2);
    }
}
