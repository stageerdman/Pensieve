import { useCallback, useState } from "react";
import { X } from "../../components/icons";
import { useWindowFileDrop } from "../../lib/useWindowFileDrop";
import type { KnowledgeFile } from "../../lib/ai/agents";
import {
  basenameOf,
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
// (native dialog or a window drop) through indexing each one. Files are indexed one at a
// time, not in parallel, so `indexing` always describes exactly one real in-progress
// file. One file failing (e.g. an unsupported type) doesn't abort the rest of the batch.
function useKnowledgeUpload(agentId: string, onAdded: (file: KnowledgeFile) => void) {
  const [indexing, setIndexing] = useState<IndexingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingestOne = useCallback(
    async (path: string) => {
      const fileName = basenameOf(path);
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
        onAdded(await ingestKnowledgeFile(agentId, path, jobId));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        unlisten();
      }
    },
    [agentId, onAdded],
  );

  // Filters to this feature's own supported extensions — a window-wide drop used by
  // more than one drop target (e.g. a future photo drop zone) needs an irrelevant
  // dropped file silently ignored here, not surfaced as an "unsupported" error.
  const addFiles = useCallback(
    async (paths: string[]) => {
      const relevant = paths.filter(isKnowledgeFilePath);
      if (relevant.length === 0) return;
      setError(null);
      for (const path of relevant) {
        await ingestOne(path);
      }
      setIndexing(null);
    },
    [ingestOne],
  );

  const pickAndAddFiles = useCallback(async () => {
    addFiles(await pickKnowledgeFiles());
  }, [addFiles]);

  return { indexing, error, addFiles, pickAndAddFiles };
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
  const { indexing, error, addFiles, pickAndAddFiles } = useKnowledgeUpload(agentId, onAddFile);
  const isDragActive = useWindowFileDrop(true, addFiles);
  const totalChunks = files.reduce((sum, file) => sum + file.chunkCount, 0);

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
