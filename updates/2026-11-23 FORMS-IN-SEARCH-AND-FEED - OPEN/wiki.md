# FORMS-IN-SEARCH-AND-FEED — wiki

## Decisions
- **The Form suggestion is a completion, not a claim.** Claims (flags, exact categories)
  remove their words from the live text; "form" is an ordinary word people search for, so it
  stays in the ranked text query until the owner picks the chip. Picking it splices just that
  word out. Ranking is untouched.
- **Its own filter kind (`{ kind: "form" }`), not a flag.** Flags are sidecar booleans with
  claim semantics; a form is frontmatter (`form: true`). One more `case` in evaluate/label.
- **Labels are a union, not a copy.** A memory started from a form keeps anything it already
  had and gains the form's categories and tags — never loses data.
