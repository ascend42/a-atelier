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

/** Discriminated union of all envelopes carried over the bridge. */
export type BridgeEnvelope =
  | HelloEnvelope
  | DocLoadEnvelope
  | DocLoadedEnvelope
  | DocPatchEnvelope
  | LlmMutationEnvelope
  | ErrorEnvelope;

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
    t === "error"
  );
}
