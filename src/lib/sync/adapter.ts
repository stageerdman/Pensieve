// OneDrive remote adapter — the vault's cloud mirror as plain Graph operations.
//
// Model (see the update doc): one flat folder `REMOTE_ROOT` on the drive holds one
// `.md` file per note, named `<noteId>.md` (the local .md basename). The `.md` is
// the source of truth — frontmatter carries the user metadata; system fields are
// derived on pull. No sidecars are synced in v1.
//
// Every function takes a GraphClient so the adapter is portable and testable. All
// item paths are path-addressed under the root and URL-encoded.

import type { GraphClient } from "./graph";
import { REMOTE_ROOT } from "./config";
import { ConflictError, type RemoteItem, type SyncAccount, type SyncQuota } from "./types";
import { log } from "../logger";

/** The signed-in account (Graph /me). Personal accounts expose the address as
 *  `userPrincipalName`; `mail` is often null, so fall back to it. */
export async function getAccount(graph: GraphClient): Promise<SyncAccount> {
  const me = await graph.json<{ displayName?: string; mail?: string; userPrincipalName?: string }>(
    "/me?$select=displayName,mail,userPrincipalName",
  );
  return { email: me.mail || me.userPrincipalName || "", displayName: me.displayName };
}

/** Drive storage totals (Graph /me/drive quota), in bytes. */
export async function getQuota(graph: GraphClient): Promise<SyncQuota> {
  const drive = await graph.json<{ quota?: { total?: number; used?: number } }>("/me/drive?$select=quota");
  return { usedBytes: drive.quota?.used ?? 0, totalBytes: drive.quota?.total ?? 0 };
}

/** A note id → its remote file name. */
export const remoteName = (noteId: string): string => `${noteId}.md`;
/** A remote file name → the note id (null if it isn't one of our note files, or
 *  there's no name — a /delta tombstone can arrive with only an id + deleted facet). */
export function noteIdFromName(name: string | null | undefined): string | null {
  return typeof name === "string" && name.endsWith(".md") ? name.slice(0, -3) : null;
}

const enc = (s: string) => encodeURIComponent(s);
const rootPath = () => `/me/drive/root:/${enc(REMOTE_ROOT)}`;
const filePath = (name: string) => `/me/drive/root:/${enc(REMOTE_ROOT)}/${enc(name)}`;

interface ChildrenResponse {
  value: RemoteItem[];
  "@odata.nextLink"?: string;
}

/** Ensure the remote root folder exists; create it if missing. Idempotent. */
export async function ensureRoot(graph: GraphClient): Promise<void> {
  const res = await graph.fetch(`${rootPath()}`);
  if (res.ok) return;
  if (res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`ensureRoot failed (${res.status}): ${text.slice(0, 200)}`);
  }
  // Create under the drive root. conflictBehavior "fail" is fine — a race that
  // created it concurrently just means it now exists, which is what we wanted.
  const create = await graph.fetch(`/me/drive/root/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: REMOTE_ROOT, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (!create.ok && create.status !== 409) {
    const text = await create.text().catch(() => "");
    throw new Error(`ensureRoot create failed (${create.status}): ${text.slice(0, 200)}`);
  }
  log.info("sync", "adapter.root.created", { root: REMOTE_ROOT });
}

/** List the note `.md` files in the remote root (folders and non-notes excluded). */
export async function listNotes(graph: GraphClient): Promise<RemoteItem[]> {
  const out: RemoteItem[] = [];
  let path: string | null = `${rootPath()}:/children?$select=id,name,eTag,cTag,size,lastModifiedDateTime,folder`;
  let absolute = false;
  while (path) {
    const page: ChildrenResponse = await graph.json<ChildrenResponse>(path, { absolute });
    for (const item of page.value) {
      if (item.folder) continue;
      if (noteIdFromName(item.name)) out.push(item);
    }
    path = page["@odata.nextLink"] ?? null;
    absolute = true;
  }
  return out;
}

/** Read a note's content + current metadata (tags). Null if it doesn't exist. */
export async function downloadNote(
  graph: GraphClient,
  name: string,
): Promise<{ content: string; item: RemoteItem } | null> {
  const metaRes = await graph.fetch(`${filePath(name)}?$select=id,name,eTag,cTag,size,lastModifiedDateTime`);
  if (metaRes.status === 404) return null;
  if (!metaRes.ok) {
    const text = await metaRes.text().catch(() => "");
    throw new Error(`downloadNote meta failed (${metaRes.status}): ${text.slice(0, 200)}`);
  }
  const item = (await metaRes.json()) as RemoteItem;
  const contentRes = await graph.fetch(`${filePath(name)}:/content`);
  if (!contentRes.ok) {
    const text = await contentRes.text().catch(() => "");
    throw new Error(`downloadNote content failed (${contentRes.status}): ${text.slice(0, 200)}`);
  }
  const content = await contentRes.text();
  return { content, item };
}

/** Upload (create or replace) a note's content. When `ifMatch` (a cTag) is given,
 *  the write is conditional: a stale tag → 412 → ConflictError, so a device that
 *  didn't re-sync can never silently clobber. Returns the new remote item. */
export async function uploadNote(
  graph: GraphClient,
  noteId: string,
  content: string,
  ifMatch?: string,
): Promise<RemoteItem> {
  const headers: Record<string, string> = { "Content-Type": "text/markdown" };
  if (ifMatch) headers["If-Match"] = ifMatch;

  const res = await graph.fetch(`${filePath(remoteName(noteId))}:/content`, {
    method: "PUT",
    headers,
    body: content,
  });

  if (res.status === 412) throw new ConflictError(noteId);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`uploadNote failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const item = (await res.json()) as RemoteItem;
  log.debug("sync", "adapter.upload", { noteId, cTag: item.cTag, conditional: !!ifMatch });
  return item;
}

/** Delete a note's remote file. Absent (404) is treated as success. A stale
 *  `ifMatch` → 412 → ConflictError (someone else changed it; don't delete blindly). */
export async function deleteNote(graph: GraphClient, noteId: string, ifMatch?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (ifMatch) headers["If-Match"] = ifMatch;
  const res = await graph.fetch(`${filePath(remoteName(noteId))}`, { method: "DELETE", headers });
  if (res.status === 412) throw new ConflictError(noteId);
  if (res.ok || res.status === 404) {
    log.debug("sync", "adapter.delete", { noteId });
    return;
  }
  const text = await res.text().catch(() => "");
  throw new Error(`deleteNote failed (${res.status}): ${text.slice(0, 200)}`);
}

export interface DeltaResult {
  items: RemoteItem[];
  deltaLink: string;
}

interface DeltaPage {
  value: RemoteItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

/** Drain the /delta feed from a saved link (or a fresh baseline when null) and
 *  return the changed items plus the next deltaLink to persist. Paginates through
 *  @odata.nextLink until Graph hands back the @odata.deltaLink cursor. */
export async function delta(graph: GraphClient, link: string | null): Promise<DeltaResult> {
  let url: string = link ?? `${rootPath()}:/delta`;
  let absolute = link !== null;
  const items: RemoteItem[] = [];

  for (let guard = 0; guard < 1000; guard++) {
    const page: DeltaPage = await graph.json<DeltaPage>(url, { absolute });
    items.push(...(page.value ?? []));
    if (page["@odata.nextLink"]) {
      url = page["@odata.nextLink"];
      absolute = true;
      continue;
    }
    if (page["@odata.deltaLink"]) {
      return { items, deltaLink: page["@odata.deltaLink"] };
    }
    // No next and no delta link — shouldn't happen, but don't loop forever.
    throw new Error("delta: response had neither nextLink nor deltaLink");
  }
  throw new Error("delta: exceeded pagination guard");
}
