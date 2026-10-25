// adapter.ts — OneDrive remote adapter: the vault's cloud mirror as plain Graph
// operations. Mirrors src/lib/sync/adapter.ts (model: one flat folder under
// REMOTE_ROOT, one `.md` per note, named `<noteId>.md`).
//
// Skips the desktop's large-media resumable-session functions on purpose: those
// exist only because the native chunked transfer needs a small-JSON session handle
// to drive bytes on the Rust side. The phone has no such native layer (Phase 1's
// vault never implements uploadMediaStream/downloadMediaStream), so engine.ts here
// always takes the plain whole-buffer upload/download path — see PWA-CAPTURE v2's
// non-goals (phone media backup is capped at Graph's ~4MB simple-upload ceiling).

import type { GraphClient } from "./graph";
import { REMOTE_ROOT } from "./config";
import { ConflictError } from "./errors";
import type { RemoteItem, SyncAccount, SyncQuota } from "./types";
import { isMediaPath } from "../media/noteMedia";

export async function getAccount(graph: GraphClient): Promise<SyncAccount> {
  const me = await graph.json<{ displayName?: string; mail?: string; userPrincipalName?: string }>(
    "/me?$select=displayName,mail,userPrincipalName",
  );
  return { email: me.mail || me.userPrincipalName || "", displayName: me.displayName };
}

export async function getQuota(graph: GraphClient): Promise<SyncQuota> {
  const drive = await graph.json<{ quota?: { total?: number; used?: number } }>("/me/drive?$select=quota");
  return { usedBytes: drive.quota?.used ?? 0, totalBytes: drive.quota?.total ?? 0 };
}

export const remoteName = (noteId: string): string => `${noteId}.md`;
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

export async function remoteRootExists(graph: GraphClient): Promise<boolean> {
  const res = await graph.fetch(`${rootPath()}`);
  if (res.ok) return true;
  if (res.status === 404) return false;
  const text = await res.text().catch(() => "");
  throw new Error(`root check failed (${res.status}): ${text.slice(0, 200)}`);
}

export async function createRoot(graph: GraphClient): Promise<void> {
  const create = await graph.fetch(`/me/drive/root/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: REMOTE_ROOT, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (!create.ok && create.status !== 409) {
    const text = await create.text().catch(() => "");
    throw new Error(`createRoot failed (${create.status}): ${text.slice(0, 200)}`);
  }
}

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

export async function downloadNote(graph: GraphClient, name: string): Promise<{ content: string; item: RemoteItem } | null> {
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

export async function uploadNote(graph: GraphClient, noteId: string, content: string, ifMatch?: string): Promise<RemoteItem> {
  const headers: Record<string, string> = { "Content-Type": "text/markdown" };
  if (ifMatch) headers["If-Match"] = ifMatch;
  const res = await graph.fetch(`${filePath(remoteName(noteId))}:/content`, { method: "PUT", headers, body: content });
  if (res.status === 412) throw new ConflictError(noteId);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`uploadNote failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as RemoteItem;
}

export async function deleteNote(graph: GraphClient, noteId: string, ifMatch?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (ifMatch) headers["If-Match"] = ifMatch;
  const res = await graph.fetch(`${filePath(remoteName(noteId))}`, { method: "DELETE", headers });
  if (res.status === 412) throw new ConflictError(noteId);
  if (res.ok || res.status === 404) return;
  const text = await res.text().catch(() => "");
  throw new Error(`deleteNote failed (${res.status}): ${text.slice(0, 200)}`);
}

// ── Media binaries (plain content PUT/GET only — no resumable sessions; see header) ──

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  aac: "audio/aac",
};

function mediaExt(ref: string): string {
  const dot = ref.lastIndexOf(".");
  return dot >= 0 ? ref.slice(dot + 1) : "";
}

export function mediaContentType(ref: string): string {
  return MEDIA_CONTENT_TYPES[mediaExt(ref).toLowerCase()] ?? "application/octet-stream";
}

function mediaItemPath(ref: string): string {
  const segs = ref.split("/").map(enc).join("/");
  return `/me/drive/root:/${enc(REMOTE_ROOT)}/${segs}`;
}

/** A /delta or children item → its vault-relative media ref, or null if it isn't
 *  one of our media binaries (recognised from the parent path + name). */
export function mediaRefFromItem(item: RemoteItem): string | null {
  if (item.folder || !item.name) return null;
  const path = item.parentReference?.path;
  if (!path) return null;
  const marker = `/${REMOTE_ROOT}/`;
  const idx = path.indexOf(marker);
  if (idx === -1) return null;
  const rel = path.slice(idx + marker.length);
  const ref = `${rel}/${item.name}`;
  return isMediaPath(ref) ? ref : null;
}

export async function uploadMedia(graph: GraphClient, ref: string, bytes: Uint8Array): Promise<RemoteItem> {
  const res = await graph.fetch(`${mediaItemPath(ref)}:/content`, {
    method: "PUT",
    headers: { "Content-Type": mediaContentType(ref) },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`uploadMedia failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as RemoteItem;
}

export async function downloadMedia(graph: GraphClient, ref: string): Promise<Uint8Array | null> {
  const res = await graph.fetch(`${mediaItemPath(ref)}:/content`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`downloadMedia failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
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
    if (page["@odata.deltaLink"]) return { items, deltaLink: page["@odata.deltaLink"] };
    throw new Error("delta: response had neither nextLink nor deltaLink");
  }
  throw new Error("delta: exceeded pagination guard");
}
