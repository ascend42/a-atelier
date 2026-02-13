// @atelier/mcp — Delta (animation keyframe) tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, Delta, AnimatableProperty, Easing } from "@atelier/types";
import { validateNoOverlap, expandPreset } from "@atelier/core";
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

const AnimatablePropertyEnum = z.enum([
  "frame.x", "frame.y", "bounds.width", "bounds.height",
  "opacity", "rotation", "scale.x", "scale.y",
  "anchorPoint.x", "anchorPoint.y",
  "visual.shape.cornerRadius", "visual.fill.color",
  "visual.stroke.color", "visual.stroke.width",
  "visual.style.fontSize", "visual.style.color",
]);

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
  // ── atelier_add_delta ───────────────────────────────────────
  server.tool(
    "atelier_add_delta",
    "Add an animation delta (keyframe transition) to a state",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name"),
      layer: z.string().describe("Target layer ID"),
      property: AnimatablePropertyEnum.describe("Property to animate"),
      range: z.tuple([z.number().int().min(0), z.number().int().min(0)]).describe("Frame range [start, end] inclusive"),
      from: z.unknown().describe("Starting value"),
      to: z.unknown().describe("Ending value"),
      easing: EasingInputSchema.optional().describe("Easing function"),
      description: z.string().optional().describe("Delta description"),
      tags: z.array(z.string()).optional().describe("Tags"),
      deltaId: z.string().optional().describe("Custom delta ID"),
    },
    async ({ id, stateName, layer, property, range, from, to, easing, description, tags, deltaId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      // Validate state exists
      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      // Validate layer exists
      if (!doc.layers.some(l => l.id === layer)) {
        return err(`Layer "${layer}" not found`);
      }

      // Validate range
      if (range[0] > range[1]) {
        return err(`Invalid range: start (${range[0]}) must be <= end (${range[1]})`);
      }

      const delta: Delta = {
        layer,
        property: property as AnimatableProperty,
        range: [range[0], range[1]],
        from,
        to,
        ...(easing ? { easing: easing as Easing } : {}),
        ...(description ? { description } : {}),
        ...(tags ? { tags } : {}),
        ...(deltaId ? { id: deltaId } : {}),
      };

      // Check for overlaps
      const overlap = validateNoOverlap(state.deltas, delta);
      if (overlap) {
        return err(overlap.message);
      }

      state.deltas.push(delta);
      return ok({ stateName, deltaIndex: state.deltas.length - 1, layer, property });
    },
  );

  // ── atelier_edit_delta ──────────────────────────────────────
  server.tool(
    "atelier_edit_delta",
    "Edit an existing delta by index within a state",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name"),
      deltaIndex: z.number().int().min(0).describe("Delta index within the state"),
      layer: z.string().optional().describe("New target layer ID"),
      property: AnimatablePropertyEnum.optional().describe("New property to animate"),
      range: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional().describe("New frame range [start, end]"),
      from: z.unknown().optional().describe("New starting value"),
      to: z.unknown().optional().describe("New ending value"),
      easing: EasingInputSchema.optional().describe("New easing function"),
      description: z.string().optional().describe("New description"),
      tags: z.array(z.string()).optional().describe("New tags"),
    },
    async ({ id, stateName, deltaIndex, layer, property, range, from, to, easing, description, tags }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      if (deltaIndex >= state.deltas.length) {
        return err(`Delta index ${deltaIndex} out of range (${state.deltas.length} deltas)`);
      }

      const delta = state.deltas[deltaIndex];

      // Apply updates
      if (layer != null) {
        if (!doc.layers.some(l => l.id === layer)) return err(`Layer "${layer}" not found`);
        delta.layer = layer;
      }
      if (property != null) delta.property = property as AnimatableProperty;
      if (range != null) {
        if (range[0] > range[1]) return err(`Invalid range: start (${range[0]}) must be <= end (${range[1]})`);
        delta.range = [range[0], range[1]];
      }
      if (from !== undefined) delta.from = from;
      if (to !== undefined) delta.to = to;
      if (easing != null) delta.easing = easing as Easing;
      if (description != null) delta.description = description;
      if (tags) delta.tags = tags;

      // Re-validate overlaps with the updated delta against others
      const others = state.deltas.filter((_, i) => i !== deltaIndex);
      const overlap = validateNoOverlap(others, delta);
      if (overlap) {
        return err(`Edit would cause overlap: ${overlap.message}`);
      }

      return ok({ stateName, deltaIndex, updated: true });
    },
  );

  // ── atelier_remove_delta ────────────────────────────────────
  server.tool(
    "atelier_remove_delta",
    "Remove a delta by index from a state",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name"),
      deltaIndex: z.number().int().min(0).describe("Delta index to remove"),
    },
    async ({ id, stateName, deltaIndex }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      if (deltaIndex >= state.deltas.length) {
        return err(`Delta index ${deltaIndex} out of range (${state.deltas.length} deltas)`);
      }

      const removed = state.deltas.splice(deltaIndex, 1)[0];
      return ok({
        stateName,
        removed: {
          layer: removed.layer,
          property: removed.property,
          range: removed.range,
        },
        remainingDeltas: state.deltas.length,
      });
    },
  );

  // ── atelier_apply_preset ────────────────────────────────────
  server.tool(
    "atelier_apply_preset",
    "Apply a preset to a layer, expanding it into concrete deltas",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().describe("State name to add deltas to"),
      presetName: z.string().describe("Preset name defined in the document"),
      layerId: z.string().describe("Target layer ID"),
      startFrame: z.number().int().min(0).optional().describe("Start frame (default: 0)"),
      duration: z.number().positive().int().optional().describe("Duration for preset (default: state duration)"),
    },
    async ({ id, stateName, presetName, layerId, startFrame, duration }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const state = doc.states[stateName];
      if (!state) return err(`State "${stateName}" not found`);

      if (!doc.layers.some(l => l.id === layerId)) {
        return err(`Layer "${layerId}" not found`);
      }

      if (!doc.presets || !doc.presets[presetName]) {
        return err(`Preset "${presetName}" not found`);
      }

      const preset = doc.presets[presetName];
      const start = startFrame ?? 0;
      const dur = duration ?? state.duration;

      const deltas = expandPreset(preset, layerId, start, dur);

      // Validate no overlaps for each new delta
      const errors: string[] = [];
      for (const delta of deltas) {
        const overlap = validateNoOverlap(state.deltas, delta);
        if (overlap) {
          errors.push(overlap.message);
        }
      }

      if (errors.length > 0) {
        return err(`Preset would cause overlaps:\n${errors.join("\n")}`);
      }

      // Add all deltas
      state.deltas.push(...deltas);

      return ok({
        stateName,
        presetName,
        layerId,
        deltasAdded: deltas.length,
        totalDeltas: state.deltas.length,
      });
    },
  );
}
