// @a-company/atelier-mcp — Ref layer (composition/nesting) tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, RefVisual } from "@a-company/atelier-types";
import type { DocumentStore } from "../store.js";

function getDoc(store: DocumentStore, id: string): { doc: AtelierDocument } | { error: string } {
  const doc = store.get(id);
  if (!doc) return { error: `Document "${id}" not found` };
  return { doc };
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_set_ref ───────────────────────────────────────────
  server.tool(
    "atelier_set_ref",
    "Set the source reference on a ref-type layer. Can point to a file path or another in-memory document ID.",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID (must be a ref visual)"),
      src: z.string().describe("File path, URL, or in-memory document ID"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, src }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);
      if (layer.visual.type !== "ref") return err(`Layer "${layerId}" is type "${layer.visual.type}", not "ref"`);

      // Prevent self-reference
      if (src === id) return err("Cannot reference self — would cause infinite recursion");

      (layer.visual as RefVisual).src = src;

      // Check if src is an in-memory document
      const isInMemory = store.has(src);
      return ok({ layerId, src, resolvedInMemory: isInMemory });
    },
  );

  // ── atelier_resolve_refs ──────────────────────────────────────
  server.tool(
    "atelier_resolve_refs",
    "Check which ref layers can be resolved (point to valid in-memory documents)",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const refs = doc.layers
        .filter(l => l.visual.type === "ref")
        .map(l => {
          const src = (l.visual as RefVisual).src;
          const resolved = store.has(src);
          const targetDoc = resolved ? store.get(src) : undefined;
          return {
            layerId: l.id,
            src,
            resolved,
            targetName: targetDoc?.name,
            targetLayerCount: targetDoc?.layers.length,
            targetStateCount: targetDoc ? Object.keys(targetDoc.states).length : undefined,
          };
        });

      const resolvedCount = refs.filter(r => r.resolved).length;
      return ok({ count: refs.length, resolvedCount, refs });
    },
  );
}
