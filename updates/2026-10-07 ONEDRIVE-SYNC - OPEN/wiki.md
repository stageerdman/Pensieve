# ONEDRIVE-SYNC — wiki (durable findings)

## Reused infrastructure
- **Azure app**: `onedrive-manager`'s registration (originally RecBar's). Tenant
  `consumers` (personal accounts). Scopes `openid profile offline_access User.Read
  Files.ReadWrite`. Secrets in `/Users/stage/dev/onedrive-manager/.env`.
- **Stored accounts** live in `onedrive-manager/data/onedrive-manager.db`
  (`accounts` table), refresh tokens **AES-256-GCM** encrypted as `iv:tag:ct`
  (all base64), key = `TOKEN_ENCRYPTION_KEY` (64 hex). Decrypt helper mirrored in
  the spike.
- Pensieve will use the **Stage Erdman** account (`s.microsoft@erdman.xyz`,
  id `974255cf67084b26`).

## Open question being tested in the spike
- **Secret-less PKCE (public client) for personal accounts?** `onedrive-manager`'s
  CLAUDE.md records `AADSTS70002` on the secret-less path and a fallback to a
  confidential Web app + secret. Hypothesis: that was because the redirect was
  registered under the **Web** platform; an **SPA** platform redirect enables
  auth-code+PKCE with no secret (+ CORS for browser). Must confirm before the PWA
  can be a pure client-side app with no backend.

## Findings — Phase 0 spike (2026-10-07, real Stage Erdman OneDrive) ✅
Ran `spike/spike.mjs`. All sync primitives proven against the live drive:

1. **Token refresh** — `refresh_token` → `access_token` works (1h expiry). The
   **secret-less** refresh returns `AADSTS70002: must include a 'client_secret'`
   — confirming the known issue. This is because the Azure app's redirect is
   registered under the **Web** platform. ⇒ For the PWA we MUST add an **SPA**
   platform redirect (enables auth-code+PKCE+CORS, no secret). The spike can't
   exercise the SPA auth-code path headlessly (needs an interactive browser login
   against a registered SPA redirect) — **that is the one remaining thing to
   confirm, and it's a portal change + a browser login, not a code problem.**
   Desktop (Tauri) is unaffected: it can keep using a confidential flow or its own
   native redirect.
2. **Folder create** — `POST /me/drive/root/children` with `folder:{}` → 201.
3. **Upload `.md`** — `PUT /root:/{folder}/{name}:/content` → 201, parent path
   resolved fine. Returns `id`, `eTag`, `cTag`.
4. **Read back** — content is **byte-exact** with what we wrote.
5. **Conditional write (correct tag)** — `PUT …/content` with `If-Match: <cTag>`
   → 200, and the **cTag increments** (`…,1` → `…,2`).
6. **Conditional write (stale tag)** — same `If-Match` after the file moved on →
   **412 Precondition Failed**. This is the whole single-writer guarantee: a
   device that didn't re-sync **cannot silently overwrite**. Conflict is detected,
   not lost.
7. **Delta cursor** — `/root:/{folder}:/delta` drains to a `@odata.deltaLink`;
   after adding one new note, querying that link returns **only** the changed
   items (the new file + its parent folder), nothing else. True incremental sync.

### Practical notes for the real adapter
- **Use `cTag` (content tag) for `If-Match` on content writes** — it changes on
  content change specifically; it worked cleanly for 200-then-412. (`eTag` also
  changes on metadata-only changes.)
- Delta lists the **parent folder** alongside changed children (its child-list
  changed) — the adapter should treat folder entries as structural, not notes.
- Reuse `onedrive-manager`'s `graphFetch` retry/429 pattern verbatim.
- Spike artifacts left in `/Pensieve-Spike/` on the drive so the owner can see
  them; safe to delete anytime (isolated from real data).

**Verdict:** the simple single-writer + eTag-guard + delta model is fully
supported by Graph for personal OneDrive. Phase 1 (Tauri auth) is unblocked. The
PWA's secret-less auth needs the SPA-redirect confirmation first.
