// @a-company/atelier-mcp — State configuration tools (audio, transitions, parent states)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@a-company/atelier-types";
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

const EasingInputSchema = z.union([
  z.enum(["ease-in", "ease-out", "ease-in-out"]),
  z.object({ type: z.literal("linear") }),
  z.object({
    type: z.literal("cubic-bezier"),
    x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
  }),
  z.object({
    type: z.literal("spring"),
    mass: z.number().optional(),
    stiffness: z.number().optional(),
    damping: z.number().optional(),
    velocity: z.number().optional(),
  }),
  z.object({
    type: z.literal("step"),
    steps: z.number().int().positive(),
    position: z.enum(["start", "end"]).optional(),
  }),
]).describe("Easing function");

export function register(server: McpServer, store: DocumentStore): void {
  // NOTE: `atelier_set_audio` was removed in v1.0. Audio is now a first-class
  // `AudioVisual` layer (not a per-state field). Add audio via the unified
  // clip-authoring path: `atelier_add_clip` with `kind: "audio"`. State
  // configuration tools below still operate on transitions and state
  // metadata; audio is no longer state-scoped.

  // ── atelier_configure_transition ──────────────────────────
  server.tool(
    "atelier_configure_transition",
    "Configure or remove a transition from one state to a target state",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("Source state name"),
      targetState: z.string().describe("Target state name"),
      transition: z.object({
        duration: z.number().positive().int().describe("Transition duration in frames"),
        easing: EasingInputSchema.optional(),
      }).nullable().describe("Transition config, or null to remove"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, stateName, targetState, transition }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      if (stateName === targetState) {
        return err("Cannot create a transition from a state to itself");
      }

      if (!doc.states[targetState]) {
        return err(`Target state "${targetState}" not found`);
      }

      if (transition === null) {
        if (state.transitions) {
          delete state.transitions[targetState];
          if (Object.keys(state.transitions).length === 0) {
            delete state.transitions;
          }
        }
        return ok({ stateName, targetState, removed: true });
      }

      if (!state.transitions) {
        state.transitions = {};
      }
      state.transitions[targetState] = transition as unknown as NonNullable<typeof state.transitions>[string];
      return ok({ stateName, targetState, duration: transition.duration });
    },
  );

  // ── atelier_set_state_parent ──────────────────────────────
  server.tool(
    "atelier_set_state_parent",
    "Set or clear the parent state for hierarchical delta inheritance",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name"),
      parent: z.string().nullable().describe("Parent state name, or null to clear"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, stateName, parent }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      if (parent === null) {
        delete state.parent;
        return ok({ stateName, parent: null, cleared: true });
      }

      if (parent === stateName) {
        return err("A state cannot be its own parent");
      }

      if (!doc.states[parent]) {
        return err(`Parent state "${parent}" not found`);
      }

      // Walk parent chain to detect cycles
      let current = parent;
      const visited = new Set<string>([stateName]);
      while (current) {
        if (visited.has(current)) {
          return err(`Circular reference detected: setting parent "${parent}" would create a cycle`);
        }
        visited.add(current);
        current = doc.states[current]?.parent as string;
      }

      state.parent = parent;
      return ok({ stateName, parent });
    },
  );
}
