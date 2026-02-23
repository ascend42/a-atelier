// @a-company/atelier-mcp — Asset management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, ImageVisual } from "@a-company/atelier-types";
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
  // ── atelier_add_asset ─────────────────────────────────────────
  server.tool(
    "atelier_add_asset",
    "Register an external asset (image, SVG, font, animation, audio) on a document",
    {
      id: z.string().describe("Document ID"),
      assetId: z.string().describe("Unique asset identifier"),
      type: z.enum(["image", "svg", "font", "animation", "audio"]).describe("Asset type"),
      src: z.string().describe("File path or URL"),
      description: z.string().optional().describe("Human-readable description"),
      spritesheet: z.object({
        columns: z.number().int().positive().describe("Number of columns in the spritesheet grid"),
        rows: z.number().int().positive().describe("Number of rows in the spritesheet grid"),
        frameCount: z.number().int().positive().optional().describe("Total frame count (defaults to columns × rows)"),
        frameWidth: z.number().positive().describe("Width of each frame in pixels"),
        frameHeight: z.number().positive().describe("Height of each frame in pixels"),
      }).optional().describe("Spritesheet metadata (image assets only)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, assetId, type, src, description, spritesheet }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.assets) doc.assets = {};
      if (doc.assets[assetId]) return err(`Asset "${assetId}" already exists`);

      doc.assets[assetId] = {
        type,
        src,
        ...(description !== undefined ? { description } : {}),
        ...(spritesheet ? { spritesheet } : {}),
      };
      return ok({ assetId, type, src });
    },
  );

  // ── atelier_list_assets ───────────────────────────────────────
  server.tool(
    "atelier_list_assets",
    "List all registered assets with usage info (which layers/states reference them)",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const assets = doc.assets ?? {};
      const entries = Object.entries(assets).map(([assetId, asset]) => {
        // Find layers referencing this asset (ImageVisual.assetId)
        const referencingLayers = doc.layers
          .filter(l => l.visual.type === "image" && (l.visual as ImageVisual).assetId === assetId)
          .map(l => l.id);

        // Find states whose audio.src matches this assetId
        const referencingStates = Object.entries(doc.states)
          .filter(([, state]) => state.audio?.src === assetId)
          .map(([name]) => name);

        return {
          assetId,
          type: asset.type,
          src: asset.src,
          description: asset.description,
          usedByLayers: referencingLayers,
          usedByStates: referencingStates,
        };
      });

      return ok({ count: entries.length, assets: entries });
    },
  );

  // ── atelier_remove_asset ──────────────────────────────────────
  server.tool(
    "atelier_remove_asset",
    "Remove a registered asset. Warns if layers or state audio still reference it.",
    {
      id: z.string().describe("Document ID"),
      assetId: z.string().describe("Asset ID to remove"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ id, assetId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.assets?.[assetId]) return err(`Asset "${assetId}" not found`);

      const warnings: string[] = [];

      // Check layers referencing this asset
      const referencingLayers = doc.layers
        .filter(l => l.visual.type === "image" && (l.visual as ImageVisual).assetId === assetId)
        .map(l => l.id);
      if (referencingLayers.length > 0) {
        warnings.push(`Asset is referenced by layer(s): ${referencingLayers.join(", ")}`);
      }

      // Check state audio referencing this asset
      const referencingStates = Object.entries(doc.states)
        .filter(([, state]) => state.audio?.src === assetId)
        .map(([name]) => name);
      if (referencingStates.length > 0) {
        warnings.push(`Asset is referenced by state audio: ${referencingStates.join(", ")}`);
      }

      delete doc.assets[assetId];
      return ok({ assetId, warnings });
    },
  );
}
