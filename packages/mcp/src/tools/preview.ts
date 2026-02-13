// @atelier/mcp — Validation and preview tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@atelier/types";
import { validateDocument } from "@atelier/schema";
import { validateAllDeltas, resolveFrame } from "@atelier/core";
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
  // ── atelier_validate ────────────────────────────────────────
  server.tool(
    "atelier_validate",
    "Validate an Atelier document for schema correctness and delta overlaps",
    {
      id: z.string().describe("Document ID"),
    },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      // Schema validation
      const schemaResult = validateDocument(doc);
      const schemaErrors = schemaResult.success ? [] : schemaResult.errors;

      // Overlap validation per state
      const overlapErrors: Array<{ state: string; message: string }> = [];
      for (const [stateName, state] of Object.entries(doc.states)) {
        const overlaps = validateAllDeltas(state.deltas);
        for (const overlap of overlaps) {
          overlapErrors.push({ state: stateName, message: overlap.message });
        }
      }

      const valid = schemaErrors.length === 0 && overlapErrors.length === 0;

      return ok({
        valid,
        schemaErrors,
        overlapErrors,
        summary: valid
          ? "Document is valid"
          : `Found ${schemaErrors.length} schema error(s) and ${overlapErrors.length} overlap error(s)`,
      });
    },
  );

  // ── atelier_preview ─────────────────────────────────────────
  server.tool(
    "atelier_preview",
    "Preview the resolved state of all layers at a specific frame",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name to preview"),
      frame: z.number().int().min(0).describe("Frame number to resolve"),
    },
    async ({ id, stateName, frame }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.states[stateName]) {
        return err(`State "${stateName}" not found`);
      }

      try {
        const resolved = resolveFrame(doc, stateName, frame);

        const layers = resolved.layers.map(rl => ({
          id: rl.id,
          visualType: rl.layer.visual.type,
          baseFrame: rl.layer.frame,
          baseBounds: rl.layer.bounds,
          baseOpacity: rl.layer.opacity,
          baseRotation: rl.layer.rotation,
          computedProperties: rl.computedProperties,
        }));

        return ok({
          stateName: resolved.stateName,
          frame: resolved.frame,
          duration: doc.states[stateName].duration,
          layers,
        });
      } catch (e) {
        return err(`Preview failed: ${(e as Error).message}`);
      }
    },
  );
}
