// @a-company/atelier-mcp — Document management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@a-company/atelier-types";
import { validateDocument, parseAtelier, serializeAtelier } from "@a-company/atelier-schema";
import type { DocumentStore } from "../store.js";

/** Helper: get document or return error result */
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
  // ── atelier_create ──────────────────────────────────────────
  server.tool(
    "atelier_create",
    "Create a new Atelier animation document with canvas settings",
    {
      name: z.string().describe("Animation name"),
      width: z.number().positive().describe("Canvas width in pixels"),
      height: z.number().positive().describe("Canvas height in pixels"),
      fps: z.number().positive().int().describe("Frames per second"),
      background: z.string().optional().describe("Background color (hex string)"),
      description: z.string().optional().describe("Animation description"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ name, width, height, fps, background, description, tags }) => {
      const doc: AtelierDocument = {
        version: "1.0",
        name,
        canvas: { width, height, fps, ...(background ? { background } : {}) },
        layers: [],
        states: {},
        ...(description ? { description } : {}),
        ...(tags ? { tags } : {}),
      };

      const validation = validateDocument(doc);
      if (!validation.success) {
        return err(`Validation failed: ${validation.errors.map(e => `${e.path}: ${e.message}`).join("; ")}`);
      }

      const id = store.create(doc);
      return ok({ id, name: doc.name, canvas: doc.canvas });
    },
  );

  // ── atelier_info ────────────────────────────────────────────
  server.tool(
    "atelier_info",
    "Get summary information about an Atelier document",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const stateNames = Object.keys(doc.states);
      const totalDuration = stateNames.reduce(
        (sum, name) => sum + doc.states[name].duration,
        0,
      );

      return ok({
        name: doc.name,
        description: doc.description,
        tags: doc.tags,
        canvas: doc.canvas,
        layerCount: doc.layers.length,
        stateNames,
        totalDuration,
        presetNames: doc.presets ? Object.keys(doc.presets) : [],
      });
    },
  );

  // ── atelier_load ────────────────────────────────────────────
  server.tool(
    "atelier_load",
    "Load an Atelier document from a YAML string",
    {
      id: z.string().optional().describe("Custom document ID (auto-generated if omitted)"),
      yaml: z.string().describe("YAML string representing an Atelier document"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, yaml }) => {
      const parsed = parseAtelier(yaml);
      if (!parsed.success) {
        return err(`Parse/validation failed: ${parsed.errors.map(e => `${e.path}: ${e.message}`).join("; ")}`);
      }

      const docId = store.create(parsed.data, id);
      return ok({ id: docId, name: parsed.data.name });
    },
  );

  // ── atelier_export ──────────────────────────────────────────
  server.tool(
    "atelier_export",
    "Export an Atelier document as a YAML string",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);

      const yaml = serializeAtelier(result.doc);
      return { content: [{ type: "text" as const, text: yaml }] };
    },
  );

  // ── atelier_list ────────────────────────────────────────────
  server.tool(
    "atelier_list",
    "List all Atelier documents in the store",
    {},
    { readOnlyHint: true, destructiveHint: false },
    async () => {
      const docs = store.list();
      return ok({ documents: docs, count: docs.length });
    },
  );
}
