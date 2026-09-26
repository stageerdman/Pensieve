// Editor configuration — the Notion-like formatting set, backed 1:1 by Markdown.
// StarterKit gives headings, lists, quote, code block, bold/italic/code/strike,
// horizontal rule and history (with markdown input rules). We add links, to-dos,
// and a placeholder. The Markdown extension serializes the doc to/from plain .md.

import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import type { Extensions } from "@tiptap/react";

export function editorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading" ? "Title" : "Start writing…",
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
