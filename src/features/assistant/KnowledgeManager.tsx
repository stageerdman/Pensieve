import { useCallback, useState, type DragEvent } from "react";
import { X } from "../../components/icons";
import type { KnowledgeFile } from "../../lib/ai/agents";
import {
  basenameOf,
  ingestKnowledgeBytes,
  ingestKnowledgeFile,
  isKnowledgeFilePath,
  onKnowledgeIngestProgress,
  pickKnowledgeFiles,
} from "../../lib/ai/knowledgeFiles";

// The Agents editor's "give this agent knowledge files" piece (AGENT-RAG) — a Tailwind
// version of masters-wheel's KnowledgeManager (that one pairs with CSS-module files per
// its own component convention; Pensieve's AgentsEditor.tsx is plain Tailwind, so this
// matches that instead). Same states: empty drop-zone, drag-active, one-file-at-a-time
// indexing progress, file list with remove, and an error line that doesn't abort the
// rest of a batch.
//
// Drag-and-drop here is plain DOM dragover/drop on the zone itself, NOT masters-wheel's
// Tauri onDragDropEvent — tauri.conf.json sets dragDropEnabled:false on this app's main
// window (MEDIA-IMAGES, so the editor's own image/audio/video drop handling can see real
// DOM events; see useGlobalDropGuard.ts), which makes that native event never fire here
// at all. A dropped file also arrives as a plain browser File with no real filesystem
// path, so it goes through ingestKnowledgeBytes (base64 over invoke), not
// ingestKnowledgeFile (which needs a real path — only the native "pick files" dialog has
// one). Every dragover handler below MUST call preventDefault() itself: with Tauri's
// native handling off, that's the only thing standing between a drop and WKWebView
// navigating the whole window away to the dropped file's raw content (useGlobalDropGuard
// is the last-resort backstop for this exact failure, not the first line of defense).

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKindLabel(extension: string): string {
  const normalized = extension.toLowerCase();
  if (normalized === "pdf") return "PDF";
  if (normalized === "md" || normalized === "markdown") return "Markdown";
  if (normalized === "txt") return "Text";
  return "File";
}

type IndexingStatus = { fileName: string; processed: number; total: number };

// Owns the whole "add knowledge files" flow, from however the files were selected
// (native dialog or a real drop onto this component) through indexing each one. Files
// are indexed one at a time, not in parallel, so `indexing` always describes exactly
// one real in-progress file. One file failing (e.g. an unsupported type) doesn't abort
// the rest of the batch.
function useKnowledgeUpload(agentId: string, onAdded: (file: KnowledgeFile) => void) {
  const [indexing, setIndexing] = useState<IndexingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withProgress = useCallback(
    async (fileName: string, run: (jobId: string) => Promise<KnowledgeFile>) => {
      const jobId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      setIndexing({ fileName, processed: 0, total: 0 });

      const unlisten = await onKnowledgeIngestProgress((progress) => {
        if (progress.jobId !== jobId) return;
        setIndexing({ fileName, processed: progress.processed, total: progress.total });
      });

      try {
        onAdded(await run(jobId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        unlisten();
      }
    },
    [onAdded],
  );

  // Files picked via the native dialog — real filesystem paths.
  const addPaths = useCallback(
    async (paths: string[]) => {
      const relevant = paths.filter(isKnowledgeFilePath);
      if (relevant.length === 0) return;
      setError(null);
      for (const path of relevant) {
        await withProgress(basenameOf(path), (jobId) => ingestKnowledgeFile(agentId, path, jobId));
      }
      setIndexing(null);
    },
    [agentId, withProgress],
  );

  // Files dropped onto the zone — plain browser File blobs, no real path.
  const addDroppedFiles = useCallback(
    async (files: File[]) => {
      const relevant = files.filter((f) => isKnowledgeFilePath(f.name));
      if (relevant.length === 0) return;
      setError(null);
      for (const file of relevant) {
        await withProgress(file.name, (jobId) => ingestKnowledgeBytes(agentId, file, jobId));
      }
      setIndexing(null);
    },
    [agentId, withProgress],
  );

  const pickAndAddFiles = useCallback(async () => {
    addPaths(await pickKnowledgeFiles());
  }, [addPaths]);

  return { indexing, error, addDroppedFiles, pickAndAddFiles };
}

function indexingLabel(indexing: IndexingStatus): string {
  if (indexing.total === 0) return `Reading ${indexing.fileName}…`;
  return `Indexing ${indexing.fileName}… ${indexing.processed}/${indexing.total} chunks`;
}

export function KnowledgeManager({
  agentId,
  files,
  onAddFile,
  onRemoveFile,
}: {
  agentId: string;
  files: KnowledgeFile[];
  onAddFile: (file: KnowledgeFile) => void;
  onRemoveFile: (id: string) => void;
}) {
  const { indexing, error, addDroppedFiles, pickAndAddFiles } = useKnowledgeUpload(agentId, onAddFile);
  const [isDragActive, setIsDragActive] = useState(false);
  const totalChunks = files.reduce((sum, file) => sum + file.chunkCount, 0);

  // preventDefault() on dragover is what tells the browser "this drop has a handler" —
  // skip it and the drop event never fires at all here, and the file falls through to
  // WKWebView's own default handling instead (see the file-level comment above).
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);
  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      void addDroppedFiles(Array.from(e.dataTransfer.files));
    },
    [addDroppedFiles],
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">Knowledge</span>
      {files.length > 0 && (
        <span className="text-xs text-text-muted">
          {totalChunks.toLocaleString()} chunk{totalChunks === 1 ? "" : "s"} indexed — the
          agent answers from this directly, it isn&apos;t just stuffed into context
        </span>
      )}

      {files.length === 0 ? (
        <button
          type="button"
          onClick={pickAndAddFiles}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          disabled={indexing !== null}
          className={
            "flex min-h-[72px] w-full flex-col items-center justify-center rounded-md border border-dashed px-3 py-4 text-center text-sm transition-colors disabled:opacity-60 " +
            (isDragActive
              ? "border-accent bg-accent/5 text-accent"
              : "border-border text-text-muted hover:bg-surface-raised/60")
          }
        >
          {indexing ? indexingLabel(indexing) : "Drag files here, or click to add knowledge (.txt, .md, .pdf)"}
        </button>
      ) : (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={
            "flex flex-col gap-1 rounded-md border px-1 py-1 " +
            (isDragActive ? "border-accent bg-accent/5" : "border-border")
          }
        >
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-raised text-[10px] font-medium text-text-muted"
              >
                {fileKindLabel(file.type).slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1 truncate text-text" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-text-muted">
                {formatFileSize(file.size)} · {file.chunkCount.toLocaleString()} chunk
                {file.chunkCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(file.id)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded p-0.5 text-text-muted hover:bg-surface-raised hover:text-danger"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={pickAndAddFiles}
            disabled={indexing !== null}
            className="rounded-md px-2 py-1.5 text-left text-xs text-text-muted hover:bg-surface-raised/60 disabled:opacity-60"
          >
            {indexing ? indexingLabel(indexing) : "+ Add file (or drag one in)"}
          </button>
        </div>
      )}

      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
