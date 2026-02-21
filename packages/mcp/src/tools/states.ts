// @atelier/mcp — State management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@atelier/types";
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
  // ── atelier_add_state ───────────────────────────────────────
  server.tool(
    "atelier_add_state",
    "Add a named animation state to a document",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name (e.g. 'intro', 'hover', 'exit')"),
      duration: z.number().positive().int().describe("Duration in frames"),
      description: z.string().optional().describe("State description"),
      tags: z.array(z.string()).optional().describe("Tags"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, stateName, duration, description, tags }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (doc.states[stateName]) {
        return err(`State "${stateName}" already exists`);
      }

      doc.states[stateName] = {
        duration,
        deltas: [],
        ...(description ? { description } : {}),
        ...(tags ? { tags } : {}),
      };

      return ok({ stateName, duration });
    },
  );

  // ── atelier_edit_state ──────────────────────────────────────
  server.tool(
    "atelier_edit_state",
    "Edit metadata of an existing animation state",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name to edit"),
      duration: z.number().positive().int().optional().describe("New duration in frames"),
      description: z.string().optional().describe("New description"),
      tags: z.array(z.string()).optional().describe("New tags"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, stateName, duration, description, tags }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      if (duration != null) state.duration = duration;
      if (description != null) state.description = description;
      if (tags) state.tags = tags;

      return ok({ stateName, updated: true });
    },
  );

  // ── atelier_remove_state ────────────────────────────────────
  server.tool(
    "atelier_remove_state",
    "Remove an animation state and all its deltas",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name to remove"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ id, stateName }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.states[stateName]) return err(`State "${stateName}" not found`);

      const deltaCount = doc.states[stateName].deltas.length;
      delete doc.states[stateName];

      return ok({ stateName, removed: true, deltasRemoved: deltaCount });
    },
  );

  // ── atelier_list_states ─────────────────────────────────────
  server.tool(
    "atelier_list_states",
    "List all animation states in a document",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const states = Object.entries(doc.states).map(([name, state]) => ({
        name,
        duration: state.duration,
        description: state.description,
        tags: state.tags,
        deltaCount: state.deltas.length,
      }));

      return ok({ states, count: states.length });
    },
  );
}
