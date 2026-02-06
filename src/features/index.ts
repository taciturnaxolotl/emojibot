// This is where you should export all the features. Every folder in the starter kit follows this spec.

// Deprecated: old auto-upload flow (replaced by uploadModal + uploadHandler)
// export { default as uploader } from "./uploader";

export { default as deleteModal } from "./deleteModal";
export { default as deleteHandler } from "./deleteHandler";
export { default as retryModal } from "./retryModal";
export { default as retryHandler } from "./retryHandler";

// New modal-based upload flow with background removal support
export { default as uploadModal } from "./uploadModal";
export { default as uploadHandler } from "./uploadHandler";
