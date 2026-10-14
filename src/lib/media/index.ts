// The media module: the reference model, id minting, byte<->base64, and ref<->URL rewrite.
// Storage plumbing only — no editor/UI here (that's later phases). Feature code imports
// from here; the Store adapters implement the actual byte persistence.

export { newMediaId } from "./id";
export {
  type MediaRef,
  type ParsedMediaPath,
  MEDIA_DIR,
  mediaRef,
  isMediaPath,
  parseMediaPath,
  extractMediaRefs,
} from "./ref";
export { bytesToBase64, base64ToBytes } from "./base64";
export {
  resolveMediaUrl,
  refForUrl,
  urlForRef,
  registerMediaUrl,
  _resetMediaUrlRegistry,
} from "./url";
export {
  type MediaBackupState,
  type MediaBackupSummary,
  getMediaBackupState,
  setMediaBackupState,
  setMediaBackupEnabled,
  isMediaBackupEnabled,
  primeMediaBackupStates,
  subscribeMediaBackup,
  subscribeMediaBackupAll,
  mediaBackupSummary,
  _resetMediaBackup,
} from "./backupStatus";
