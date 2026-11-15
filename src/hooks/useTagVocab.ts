import { useCallback, useEffect, useState } from "react";
import { loadTagVocab, saveTagVocab } from "../lib/tags/store";
import { canonicalTag, cleanTag, type TagDef } from "../lib/tags/vocab";

// Owns the tag vocabulary (threads + their one-line meaning, <vault>/tags.json).
// A tag the owner types that isn't known yet joins the vocabulary — creating a tag
// is creating a thread. `reload` re-reads the file after something outside the UI
// (the desktop AI's add_tag tool) may have appended to it.

export interface TagVocabApi {
  defs: TagDef[];
  /** Make sure `name` is in the vocabulary (no-op if a case-variant exists). */
  ensure: (name: string) => void;
  reload: () => void;
}

export function useTagVocab(): TagVocabApi {
  const [defs, setDefs] = useState<TagDef[]>([]);

  const reload = useCallback(() => {
    void loadTagVocab().then(setDefs);
  }, []);
  useEffect(reload, [reload]);

  const ensure = useCallback((raw: string) => {
    const name = cleanTag(raw);
    if (!name) return;
    setDefs((cur) => {
      if (canonicalTag(name, cur.map((d) => d.name))) return cur;
      const next = [...cur, { name }];
      void saveTagVocab(next);
      return next;
    });
  }, []);

  return { defs, ensure, reload };
}
