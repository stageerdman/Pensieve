import { useCallback, useMemo, useState } from "react";
import type { NoteMeta } from "../lib/types";
import type { Filter, FilterLeaf, FilterNode, Relation } from "../lib/search/types";
import { parseQuery, type Suggestion } from "../lib/search/grammar";
import { runSearch, type SearchResult } from "../lib/search/search";
import { appendLeaf, group, moveLeaf, removeNode, setRelation, ungroup } from "../lib/search/tree";
import { useSearchIndex } from "./useSearchIndex";
import { log } from "../lib/logger";

let _uid = 0;
const uid = (p: string) => `${p}-${(_uid++).toString(36)}`;

/** Remove a [start,end) span from the input and tidy whitespace. */
function splice(input: string, span: [number, number]): string {
  const out = input.slice(0, span[0]) + " " + input.slice(span[1]);
  return out.replace(/\s+/g, " ").trimStart();
}

export interface SummonApi {
  input: string;
  setInput: (value: string, caret: number) => void;
  caret: number;
  items: FilterNode[];
  suggestions: Suggestion[];
  whisper: ReturnType<typeof parseQuery>["whisper"];
  liveText: string; // the leftover free text actually being searched
  results: NoteMeta[]; // filtered notes (gallery groups/sorts them)
  match: Map<string, SearchResult>;
  total: number;
  active: boolean; // any chip or live text in play
  // actions
  confirm: (s: Suggestion) => void;
  pickTag: (tag: string) => void;
  addFilter: (filter: Filter) => void;
  remove: (id: string) => void;
  fuse: (ids: string[], relation: Relation) => void;
  explode: (groupId: string) => void;
  relate: (groupId: string, relation: Relation) => void;
  move: (leafId: string, target: string | null, index: number) => void;
  clearAll: () => void;
}

/** The Summon brain: owns the input text, the committed filter tree, the parse, and the
 *  derived search outcome. Components stay dumb and call these actions. */
export function useSummon(notes: NoteMeta[], categoryNames: string[]): SummonApi {
  const { index, version } = useSearchIndex(notes);
  const [input, setInputRaw] = useState("");
  const [caret, setCaret] = useState(0);
  const [items, setItems] = useState<FilterNode[]>([]);

  // Resolve date phrases against a per-call "now"; stable enough for a session.
  const now = useMemo(() => Date.now(), []);
  const tagsInUse = useMemo(
    () => Array.from(new Set(notes.flatMap((n) => n.tags ?? []))).sort(),
    [notes],
  );
  const ctx = useMemo(() => ({ tags: tagsInUse, categories: categoryNames }), [tagsInUse, categoryNames]);

  const parse = useMemo(() => parseQuery(input, ctx, now, caret), [input, ctx, now, caret]);
  const query = useMemo(() => ({ text: parse.text, items }), [parse.text, items]);

  // version is a dep so a background index update re-runs the search.
  const outcome = useMemo(
    () => runSearch(notes, query, index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, query, index, version],
  );

  const setInput = useCallback((value: string, c: number) => {
    setInputRaw(value);
    setCaret(c);
  }, []);

  const addFilter = useCallback((filter: Filter) => {
    const leaf: FilterLeaf = { type: "leaf", id: uid("f"), filter };
    setItems((prev) => appendLeaf(prev, leaf));
  }, []);

  const confirm = useCallback(
    (s: Suggestion) => {
      addFilter(s.filter);
      // Splice the source text out (incremental), else clear the whole input.
      setInputRaw((cur) => (s.source ? splice(cur, s.source) : ""));
      setCaret(0);
      log.debug("summon", "filter.add", { hint: s.hint });
    },
    [addFilter],
  );

  const pickTag = useCallback(
    (tag: string) => {
      addFilter({ kind: "tag", tags: [tag.replace(/^#/, "")] });
      setInputRaw((cur) => {
        const w = parse.whisper;
        return w ? splice(cur, [w.start, w.end]) : "";
      });
      setCaret(0);
    },
    [addFilter, parse.whisper],
  );

  const remove = useCallback((id: string) => setItems((prev) => removeNode(prev, id)), []);
  const fuse = useCallback(
    (ids: string[], relation: Relation) =>
      setItems((prev) => group(prev, ids, relation, uid("g"))),
    [],
  );
  const explode = useCallback((groupId: string) => setItems((prev) => ungroup(prev, groupId)), []);
  const relate = useCallback(
    (groupId: string, relation: Relation) => setItems((prev) => setRelation(prev, groupId, relation)),
    [],
  );
  const move = useCallback(
    (leafId: string, target: string | null, index: number) =>
      setItems((prev) => moveLeaf(prev, leafId, target, index)),
    [],
  );
  const clearAll = useCallback(() => {
    setItems([]);
    setInputRaw("");
    setCaret(0);
    log.debug("summon", "clear.all", {});
  }, []);

  const active = items.length > 0 || parse.text.trim().length > 0;

  return {
    input,
    setInput,
    caret,
    items,
    suggestions: parse.suggestions,
    whisper: parse.whisper,
    liveText: parse.text,
    results: outcome.notes,
    match: outcome.match,
    total: notes.length,
    active,
    confirm,
    pickTag,
    addFilter,
    remove,
    fuse,
    explode,
    relate,
    move,
    clearAll,
  };
}
