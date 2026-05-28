// @a-company/atelier-mcp — Bridge protocol (LLM↔human live-mutation envelopes)
//
// Shared envelope types for the WebSocket bridge that connects an external
// MCP client (e.g. Claude Desktop running with `atelier-mcp`) to the
// browser-side AtelierStudio running inside `atelier studio`.
//
// The mutation loop is:
//
//   LLM tool call ──► MCP server ──► DocumentStore.set(source:"llm")
//                                          │
//                                          ▼
//                              DocumentStore.onChange fires
//                                          │
//                                          ▼
//                       WS bridge broadcasts `llm:mutation`
//                                          │
//                                          ▼
//                       Browser studio.applyMutation(op)
//                                          │
//                                          ▼
//                  Canvas re-renders + toast attribution
//                  (Cmd-Z still works — history snapshot)
//
//   Human edit ──► browser AtelierStudio
//                                          │
//                                          ▼
//                   onDocumentChange ──► `doc:patch` envelope
//                                          │
//                                          ▼
//                  WS bridge writes DocumentStore.set(source:"human")
//                                          │
//                                          ▼
//                       onChange filter SKIPS broadcast
//                       (otherwise the browser would echo itself)
//
// v1 ships whole-document replacement so the envelope stays trivial.
// JSON-patch op shape is v1.1 once we measure the byte cost on real docs.

import type { AtelierDocument } from "@a-company/atelier-types";

/**
 * Who triggered a mutation. Mirrors `DocumentStore.MutationSource` so the
 * tag travels end-to-end without translation between the server-side
 * store and the browser-side Studio.
 */
export type MutationSource = "human" | "llm" | "system";

/** Wire-format protocol version. Bump on any breaking envelope change. */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;

/**
 * Server-sent on each new bridge client connection. Carries a generated
 * client id and the negotiated protocol version. The client uses this to
 * detect mismatched bridge versions.
 */
export interface HelloEnvelope {
  type: "hello";
  clientId: string;
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
}

/**
 * Client → server explicit load request. v1 sends `doc:loaded` proactively
 * on connect so this is reserved for future multi-doc sessions; included
 * now to lock the envelope shape.
 */
export interface DocLoadEnvelope {
  type: "doc:load";
  documentId: string;
}

/**
 * Server → client: here is the current state of the document.
 * Sent on connect (after `hello`) and on document switch.
 */
export interface DocLoadedEnvelope {
  type: "doc:loaded";
  documentId: string;
  doc: AtelierDocument;
}

/**
 * Client → server: I (the human) just made an edit. The server writes this
 * into the DocumentStore with `source:"human"` so the onChange filter does
 * NOT echo it back as `llm:mutation`.
 */
export interface DocPatchEnvelope {
  type: "doc:patch";
  documentId: string;
  doc: AtelierDocument;
  source: MutationSource;
  /** Optional correlation id so the client can match an ack/error response. */
  opId?: string;
}

/**
 * Server → client: an LLM (or system source) mutated the document.
 * The browser translates this to `studio.applyMutation({type:"doc:replace", doc, source})`.
 */
export interface LlmMutationEnvelope {
  type: "llm:mutation";
  documentId: string;
  doc: AtelierDocument;
  source: MutationSource;
  /** Name of the MCP tool that triggered the mutation, when known. */
  toolName?: string;
  /** Optional correlation id (mirrors any client-side request id). */
  opId?: string;
}

/** Generic error envelope, in either direction. */
export interface ErrorEnvelope {
  type: "error";
  code: string;
  message: string;
  opId?: string;
}

// ─── Workspace-aware envelopes ─────────────────────────────────────
//
// These are server → client only. They let the workspace-aware studio UI
// react to backend events (media ingest progress, file additions) without
// polling. The browser side accepts unknown envelope types gracefully, so a
// older client connected to a newer server is harmless.

/**
 * The media file list on disk changed (file added/removed). The client
 * refetches `/api/project/:name/media` on receipt. Cheap signal — no payload
 * beyond the project name keeps the envelope small for high-frequency events.
 */
export interface MediaListChangedEnvelope {
  type: "media:list:changed";
  projectName: string;
}

/** A transcript file was added or updated. */
export interface TranscriptAddedEnvelope {
  type: "transcript:added";
  projectName: string;
  /** Workspace-relative path of the transcript file. */
  transcriptPath: string;
}

/**
 * Progress envelope for the multi-step ingest pipeline. `phase` reflects the
 * current sub-step; the UI maps it to a human-readable status string. The
 * `received`/`total` pair carries download progress when phase is
 * `model:download` (whisper model fetch on first use).
 */
export interface MediaIngestProgressEnvelope {
  type: "media:ingest:progress";
  projectName: string;
  /** Source-file basename for display. */
  file: string;
  phase:
    | "start"
    | "model:download"
    | "transcribing"
    | "composing"
    | "done"
    | "error";
  /** Bytes received so far (download-only). */
  received?: number;
  /** Total bytes when known (download-only). */
  total?: number | null;
  /** Error message when phase === "error". */
  error?: string;
  /**
   * Bin-add fields (v1.0 media-bin pivot). Present on `phase: "done"`
   * envelopes that came from a no-target ingest. The browser's ToastHost
   * discriminates bin-add from target-drop completion by checking
   * `mediaPath && !targetDocPath`.
   */
  mediaPath?: string;
  fileKind?: "video" | "image" | "audio";
  transcribePending?: boolean;
  /** Set on target-drop progress to differentiate from bin-add envelopes. */
  targetDocPath?: string;
}

/**
 * A single workspace file was deleted via DELETE /api/file. Used for plain
 * artifacts / sidecar notes / per-file transcripts (anything that the UI
 * surfaces but that isn't the cascade-bearing media-file or whole-project
 * delete). Lets the sidebar invalidate just the affected section.
 *
 * `projectName` is best-effort: when the deleted path lives inside a project
 * subdir the server fills it so the sidebar can `refreshProject(name)`
 * without re-deriving the owner. Workspace-root files (rare) leave it null.
 */
export interface FileDeletedEnvelope {
  type: "file:deleted";
  /** Workspace-relative path of the removed file. */
  path: string;
  /** Owning project subdir name, when the path is inside a project. */
  projectName: string | null;
}

/**
 * A media file was deleted via DELETE /api/project/:name/media. Carries the
 * cascade report so the sidebar can refresh both the media list and the
 * transcripts list in one round-trip. See `delete-cascade-project-atelier-surgery`.
 */
export interface MediaDeletedEnvelope {
  type: "media:deleted";
  projectName: string;
  /** Basename of the deleted media file (e.g. "IMG_7347.MOV"). */
  file: string;
}

/**
 * A whole project was deleted via DELETE /api/project/:name. The sidebar
 * removes it from the projects list; `wasActive` lets the UI clear the
 * active-project indicator when the deleted project happened to be active
 * (the server already cleared active.yaml — this is just the UI signal).
 */
export interface ProjectDeletedEnvelope {
  type: "project:deleted";
  /** Subdir basename of the removed project. */
  projectName: string;
  /** True iff the deleted project was active (active.yaml was cleared too). */
  wasActive: boolean;
}

// ── doc:list:changed envelope (v1.0.x doc-management) ──────
//
// Server → client signal that the set of .atelier docs inside a project
// changed (create / duplicate / delete). Mirrors `media:list:changed` —
// cheap envelope, no payload beyond the project name. Client refetches
// `GET /api/project/:name/docs` on receipt. The browser tolerates unknown
// envelope types, so an older client connected to a newer server is
// harmless. Marker block kept narrow to avoid stomping on Kit-B's edits to
// `bridge-protocol.ts` from the parallel MCP build.
export interface DocListChangedEnvelope {
  type: "doc:list:changed";
  /** Subdir basename of the project whose docs[] changed. Client refetches GET /api/project/:name/docs. */
  projectName: string;
}

/** Discriminated union of all envelopes carried over the bridge. */
export type BridgeEnvelope =
  | HelloEnvelope
  | DocLoadEnvelope
  | DocLoadedEnvelope
  | DocPatchEnvelope
  | LlmMutationEnvelope
  | ErrorEnvelope
  | MediaListChangedEnvelope
  | TranscriptAddedEnvelope
  | MediaIngestProgressEnvelope
  | FileDeletedEnvelope
  | MediaDeletedEnvelope
  | ProjectDeletedEnvelope
  | DocListChangedEnvelope;

/** Type guard for runtime envelope validation. */
export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  if (!value || typeof value !== "object") return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === "hello" ||
    t === "doc:load" ||
    t === "doc:loaded" ||
    t === "doc:patch" ||
    t === "llm:mutation" ||
    t === "error" ||
    t === "media:list:changed" ||
    t === "transcript:added" ||
    t === "media:ingest:progress" ||
    t === "file:deleted" ||
    t === "media:deleted" ||
    t === "project:deleted" ||
    t === "doc:list:changed"
  );
}
