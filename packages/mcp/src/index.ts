// @atelier/mcp — MCP server: AI authoring interface for animations

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

export { DocumentStore } from "./store.js";
export { register as registerDocumentTools } from "./tools/document.js";
export { register as registerLayerTools } from "./tools/layers.js";
export { register as registerShapeTools } from "./tools/shapes.js";
export { register as registerStateTools } from "./tools/states.js";
export { register as registerDeltaTools } from "./tools/deltas.js";
export { register as registerPresetTools } from "./tools/presets.js";
export { register as registerPreviewTools } from "./tools/preview.js";
export { register as registerTemplateTools } from "./tools/templates.js";

/**
 * Create a fully configured MCP server with all Atelier tools registered.
 * Returns both the server and the backing store for testing.
 */
export function createServer(): { server: McpServer; store: DocumentStore } {
  const store = new DocumentStore();

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
