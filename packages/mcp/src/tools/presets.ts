// @atelier/mcp — Preset management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, Preset, PresetDelta } from "@atelier/types";
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
  "visual.stroke.start", "visual.stroke.end",
  "visual.style.fontSize", "visual.style.color",
  "shadow.color", "shadow.blur",
  "shadow.offsetX", "shadow.offsetY",
  "motionPath.progress",
  "visual.fill.angle",
  "visual.fill.center.x", "visual.fill.center.y",
  "visual.fill.radius",
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
]);

const PresetDeltaSchema = z.object({
  property: AnimatablePropertyEnum.describe("Animatable property"),
  offset: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional().describe("Relative frame offset [start, end]"),
  from: z.unknown().describe("Starting value"),
  to: z.unknown().describe("Ending value"),
  easing: EasingInputSchema.optional().describe("Easing function"),
});

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_define_preset ───────────────────────────────────
  server.tool(
    "atelier_define_preset",
    "Define a reusable animation preset on a document",
    {
      id: z.string().describe("Document ID"),
      presetName: z.string().describe("Preset name"),
      description: z.string().optional().describe("Preset description"),
      tags: z.array(z.string()).optional().describe("Tags"),
      deltas: z.array(PresetDeltaSchema).min(1).describe("Array of preset delta definitions"),
    },
    async ({ id, presetName, description, tags, deltas }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.presets) doc.presets = {};

      const preset: Preset = {
        deltas: deltas as unknown as PresetDelta[],
        ...(description ? { description } : {}),
        ...(tags ? { tags } : {}),
      };

      doc.presets[presetName] = preset;

      return ok({ presetName, deltaCount: deltas.length });
    },
  );

  // ── atelier_list_presets ────────────────────────────────────
  server.tool(
    "atelier_list_presets",
    "List all presets defined on a document",
    {
      id: z.string().describe("Document ID"),
    },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.presets || Object.keys(doc.presets).length === 0) {
        return ok({ presets: [], count: 0 });
      }

      const presets = Object.entries(doc.presets).map(([name, preset]) => ({
        name,
        description: preset.description,
        tags: preset.tags,
        deltaCount: preset.deltas.length,
        properties: preset.deltas.map(d => d.property),
      }));

      return ok({ presets, count: presets.length });
    },
  );
}
