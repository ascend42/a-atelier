// @a-company/atelier-mcp — MCP server: AI authoring interface for animations

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DocumentStore } from "./store.js";
import { register as registerDocumentTools } from "./tools/document.js";
import { register as registerLayerTools } from "./tools/layers.js";
import { register as registerShapeTools } from "./tools/shapes.js";
import { register as registerStateTools } from "./tools/states.js";
import { register as registerDeltaTools } from "./tools/deltas.js";
import { register as registerPresetTools } from "./tools/presets.js";
import { register as registerPreviewTools } from "./tools/preview.js";
import { register as registerTemplateTools } from "./tools/templates.js";
import { register as registerLayerEffectTools } from "./tools/layer-effects.js";
import { register as registerStateConfigTools } from "./tools/state-config.js";
import { register as registerExportTools } from "./tools/export.js";
import { register as registerAssetTools } from "./tools/assets.js";
import { register as registerVariableTools } from "./tools/variables.js";
import { register as registerInteractionTools } from "./tools/interactions.js";
import { register as registerRefTools } from "./tools/refs.js";
import { register as registerPerformanceTools } from "./tools/performance.js";
import { register as registerOverlayTools } from "./tools/overlays.js";
import { register as registerRecipeTools } from "./tools/recipes.js";
import { register as registerImportImageTools } from "./tools/import-images.js";
import { register as registerMindMapTools } from "./tools/mind-map.js";
import { register as registerEffectiveTranscriptTools } from "./tools/effective-transcript.js";
import { register as registerMediaNotesTools } from "./tools/media-notes.js";

export { DocumentStore } from "./store.js";
export type { MutationSource, ChangeListener } from "./store.js";
export {
  BRIDGE_PROTOCOL_VERSION,
  isBridgeEnvelope,
} from "./bridge-protocol.js";
export type {
  BridgeEnvelope,
  HelloEnvelope,
  DocLoadEnvelope,
  DocLoadedEnvelope,
  DocPatchEnvelope,
  LlmMutationEnvelope,
  ErrorEnvelope,
  MediaListChangedEnvelope,
  TranscriptAddedEnvelope,
  MediaIngestProgressEnvelope,
  FileDeletedEnvelope,
  MediaDeletedEnvelope,
  ProjectDeletedEnvelope,
} from "./bridge-protocol.js";
export { WebSocketServerTransport } from "./transports/ws-transport.js";
export type { WsLike } from "./transports/ws-transport.js";
export { register as registerDocumentTools } from "./tools/document.js";
export { register as registerLayerTools } from "./tools/layers.js";
export { register as registerShapeTools } from "./tools/shapes.js";
export { register as registerStateTools } from "./tools/states.js";
export { register as registerDeltaTools } from "./tools/deltas.js";
export { register as registerPresetTools } from "./tools/presets.js";
export { register as registerPreviewTools } from "./tools/preview.js";
export { register as registerTemplateTools } from "./tools/templates.js";
export { register as registerLayerEffectTools } from "./tools/layer-effects.js";
export { register as registerStateConfigTools } from "./tools/state-config.js";
export { register as registerExportTools } from "./tools/export.js";
export { register as registerAssetTools } from "./tools/assets.js";
export { register as registerVariableTools } from "./tools/variables.js";
export { register as registerInteractionTools } from "./tools/interactions.js";
export { register as registerRefTools } from "./tools/refs.js";
export { register as registerPerformanceTools } from "./tools/performance.js";
export { register as registerOverlayTools } from "./tools/overlays.js";
export { register as registerRecipeTools } from "./tools/recipes.js";
export { register as registerImportImageTools } from "./tools/import-images.js";
export { register as registerMindMapTools } from "./tools/mind-map.js";

/**
 * Create a fully configured MCP server with all Atelier tools registered.
 * Returns both the server and the backing store for testing.
 *
 * The `store` parameter is optional — pass an existing `DocumentStore` to
 * share state across multiple MCP server instances. This is how the
 * `atelier studio` command's per-connection WebSocket MCP servers all
 * surface their writes through a single `onChange` emitter that the live
 * bridge subscribes to (task #10).
 */
export function createServer(
  store: DocumentStore = new DocumentStore(),
): { server: McpServer; store: DocumentStore } {

  const server = new McpServer(
    { name: "atelier", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  registerDocumentTools(server, store);
  registerLayerTools(server, store);
  registerShapeTools(server, store);
  registerStateTools(server, store);
  registerDeltaTools(server, store);
  registerPresetTools(server, store);
  registerPreviewTools(server, store);
  registerTemplateTools(server, store);
  registerLayerEffectTools(server, store);
  registerStateConfigTools(server, store);
  registerExportTools(server, store);
  registerAssetTools(server, store);
  registerVariableTools(server, store);
  registerInteractionTools(server, store);
  registerRefTools(server, store);
  registerPerformanceTools(server, store);
  registerOverlayTools(server, store);
  registerRecipeTools(server, store);
  registerImportImageTools(server, store);
  registerMindMapTools(server, store);
  registerEffectiveTranscriptTools(server, store);
  registerMediaNotesTools(server, store);

  return { server, store };
}

// ── Main entry point ─────────────────────────────────────────
// When run directly, connect via stdio transport.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") ||
    process.argv[1].endsWith("/index.cjs") ||
    process.argv[1].includes("atelier-mcp"));

if (isMain) {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error("Failed to start Atelier MCP server:", error);
    process.exit(1);
  });
}
