// @a-company/atelier-mcp — Interaction management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, Interaction } from "@a-company/atelier-types";
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
  // ── atelier_add_interaction ───────────────────────────────────
  server.tool(
    "atelier_add_interaction",
    "Add a trigger-action interaction to a layer (click, hover, timer, signal → go-to-state, emit-signal, set-variable, toggle-visibility)",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer to attach the interaction to"),
      interactionId: z.string().describe("Unique interaction ID"),
      trigger: z.object({
        type: z.enum(["click", "hover", "pointerdown", "pointerup", "timer", "signal"]).describe("Trigger type"),
        delay: z.number().optional().describe("Delay in ms (timer trigger only)"),
        signal: z.string().optional().describe("Signal name (signal trigger only)"),
      }).describe("What triggers the interaction"),
      action: z.object({
        type: z.enum(["go-to-state", "emit-signal", "set-variable", "toggle-visibility"]).describe("Action type"),
        state: z.string().optional().describe("Target state (go-to-state only)"),
        signal: z.string().optional().describe("Signal to emit (emit-signal only)"),
        variable: z.string().optional().describe("Variable name (set-variable only)"),
        value: z.unknown().optional().describe("Value to set (set-variable only)"),
        targetLayer: z.string().optional().describe("Target layer ID (toggle-visibility, defaults to self)"),
      }).describe("What happens when triggered"),
      description: z.string().optional().describe("Human-readable description"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, interactionId, trigger, action, description }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (!layer.interactions) layer.interactions = [];
      if (layer.interactions.some(i => i.id === interactionId)) {
        return err(`Interaction "${interactionId}" already exists on layer "${layerId}"`);
      }

      // Validate trigger-specific fields
      if (trigger.type === "timer" && trigger.delay === undefined) {
        return err("Timer trigger requires a delay");
      }
      if (trigger.type === "signal" && !trigger.signal) {
        return err("Signal trigger requires a signal name");
      }

      // Validate action-specific fields
      if (action.type === "go-to-state") {
        if (!action.state) return err("go-to-state action requires a state name");
        if (!doc.states[action.state]) return err(`Target state "${action.state}" not found`);
      }
      if (action.type === "emit-signal" && !action.signal) {
        return err("emit-signal action requires a signal name");
      }
      if (action.type === "set-variable") {
        if (!action.variable) return err("set-variable action requires a variable name");
        if (action.value === undefined) return err("set-variable action requires a value");
      }
      if (action.type === "toggle-visibility" && action.targetLayer) {
        if (!doc.layers.find(l => l.id === action.targetLayer)) {
          return err(`Target layer "${action.targetLayer}" not found`);
        }
      }

      const interaction: Interaction = {
        id: interactionId,
        trigger: trigger as Interaction["trigger"],
        action: action as Interaction["action"],
        ...(description !== undefined ? { description } : {}),
      };

      layer.interactions.push(interaction);
      return ok({ layerId, interactionId, triggerType: trigger.type, actionType: action.type });
    },
  );

  // ── atelier_list_interactions ─────────────────────────────────
  server.tool(
    "atelier_list_interactions",
    "List all interactions across all layers or for a specific layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().optional().describe("Optional: filter to a specific layer"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id, layerId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layers = layerId
        ? doc.layers.filter(l => l.id === layerId)
        : doc.layers;

      if (layerId && layers.length === 0) return err(`Layer "${layerId}" not found`);

      const interactions = layers.flatMap(l =>
        (l.interactions ?? []).map(i => ({
          layerId: l.id,
          interactionId: i.id,
          triggerType: i.trigger.type,
          actionType: i.action.type,
          description: i.description,
          trigger: i.trigger,
          action: i.action,
        })),
      );

      return ok({ count: interactions.length, interactions });
    },
  );

  // ── atelier_remove_interaction ────────────────────────────────
  server.tool(
    "atelier_remove_interaction",
    "Remove an interaction from a layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      interactionId: z.string().describe("Interaction ID to remove"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ id, layerId, interactionId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (!layer.interactions) return err(`Interaction "${interactionId}" not found on layer "${layerId}"`);

      const idx = layer.interactions.findIndex(i => i.id === interactionId);
      if (idx === -1) return err(`Interaction "${interactionId}" not found on layer "${layerId}"`);

      layer.interactions.splice(idx, 1);
      if (layer.interactions.length === 0) {
        layer.interactions = undefined;
      }
      return ok({ layerId, interactionId, remainingInteractions: layer.interactions?.length ?? 0 });
    },
  );
}
