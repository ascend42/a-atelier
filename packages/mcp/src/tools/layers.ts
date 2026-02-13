// @atelier/mcp — Layer management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, Layer, Visual, UnitValue } from "@atelier/types";
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

/** Zod schema for visual objects passed by the AI */
const VisualInputSchema = z.object({
  type: z.enum(["shape", "text", "image", "group", "ref"]).describe("Visual type"),
  // shape visual fields
  shape: z.object({
    type: z.enum(["rect", "ellipse", "path"]),
    cornerRadius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
    points: z.array(z.object({
      x: z.number(),
      y: z.number(),
      in: z.object({ x: z.number(), y: z.number() }).optional(),
      out: z.object({ x: z.number(), y: z.number() }).optional(),
    })).optional(),
    closed: z.boolean().optional(),
  }).optional(),
  fill: z.record(z.unknown()).optional(),
  stroke: z.record(z.unknown()).optional(),
  // text visual fields
  content: z.string().optional(),
  style: z.record(z.unknown()).optional(),
  // image visual fields
  assetId: z.string().optional(),
  // ref visual fields
  src: z.string().optional(),
}).describe("Visual content definition");

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_add_layer ───────────────────────────────────────
  server.tool(
    "atelier_add_layer",
    "Add a new layer to an Atelier document",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Unique layer ID"),
      visual: VisualInputSchema.describe("Visual content definition"),
      x: z.union([z.number(), z.string()]).describe("X position (pixels or percentage)"),
      y: z.union([z.number(), z.string()]).describe("Y position (pixels or percentage)"),
      width: z.union([z.number(), z.string()]).describe("Width (pixels or percentage)"),
      height: z.union([z.number(), z.string()]).describe("Height (pixels or percentage)"),
      description: z.string().optional().describe("Layer description"),
      tags: z.array(z.string()).optional().describe("Tags"),
      opacity: z.number().min(0).max(1).optional().describe("Opacity 0-1"),
      rotation: z.number().optional().describe("Rotation in degrees"),
      parentId: z.string().optional().describe("Parent layer ID for transform inheritance"),
      anchorPoint: z.object({ x: z.number(), y: z.number() }).optional().describe("Anchor point (0-1 normalized)"),
      scale: z.object({ x: z.number(), y: z.number() }).optional().describe("Scale factors"),
      visible: z.boolean().optional().describe("Whether layer is visible"),
    },
    async ({ id, layerId, visual, x, y, width, height, description, tags, opacity, rotation, parentId, anchorPoint, scale, visible }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      // Check for duplicate layer ID
      if (doc.layers.some(l => l.id === layerId)) {
        return err(`Layer "${layerId}" already exists in document "${id}"`);
      }

      // Validate parentId if provided
      if (parentId && !doc.layers.some(l => l.id === parentId)) {
        return err(`Parent layer "${parentId}" not found`);
      }

      const layer: Layer = {
        id: layerId,
        visual: visual as unknown as Visual,
        frame: { x: x as UnitValue, y: y as UnitValue },
        bounds: { width: width as UnitValue, height: height as UnitValue },
        ...(description != null ? { description } : {}),
        ...(tags ? { tags } : {}),
        ...(opacity != null ? { opacity } : {}),
        ...(rotation != null ? { rotation } : {}),
        ...(parentId ? { parentId } : {}),
        ...(anchorPoint ? { anchorPoint } : {}),
        ...(scale ? { scale } : {}),
        ...(visible != null ? { visible } : {}),
      };

      doc.layers.push(layer);
      return ok({ layerId, index: doc.layers.length - 1 });
    },
  );

  // ── atelier_edit_layer ──────────────────────────────────────
  server.tool(
    "atelier_edit_layer",
    "Edit properties of an existing layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID to edit"),
      x: z.union([z.number(), z.string()]).optional().describe("New X position"),
      y: z.union([z.number(), z.string()]).optional().describe("New Y position"),
      width: z.union([z.number(), z.string()]).optional().describe("New width"),
      height: z.union([z.number(), z.string()]).optional().describe("New height"),
      description: z.string().optional().describe("New description"),
      tags: z.array(z.string()).optional().describe("New tags"),
      opacity: z.number().min(0).max(1).optional().describe("New opacity"),
      rotation: z.number().optional().describe("New rotation"),
      parentId: z.string().nullable().optional().describe("New parent layer ID (null to clear)"),
      anchorPoint: z.object({ x: z.number(), y: z.number() }).optional().describe("New anchor point"),
      scale: z.object({ x: z.number(), y: z.number() }).optional().describe("New scale"),
      visible: z.boolean().optional().describe("New visibility"),
    },
    async ({ id, layerId, x, y, width, height, description, tags, opacity, rotation, parentId, anchorPoint, scale, visible }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (x != null) layer.frame.x = x as UnitValue;
      if (y != null) layer.frame.y = y as UnitValue;
      if (width != null) layer.bounds.width = width as UnitValue;
      if (height != null) layer.bounds.height = height as UnitValue;
      if (description != null) layer.description = description;
      if (tags) layer.tags = tags;
      if (opacity != null) layer.opacity = opacity;
      if (rotation != null) layer.rotation = rotation;
      if (parentId !== undefined) {
        if (parentId === null) {
          delete layer.parentId;
        } else {
          if (!doc.layers.some(l => l.id === parentId)) return err(`Parent layer "${parentId}" not found`);
          layer.parentId = parentId;
        }
      }
      if (anchorPoint) layer.anchorPoint = anchorPoint;
      if (scale) layer.scale = scale;
      if (visible != null) layer.visible = visible;

      return ok({ layerId, updated: true });
    },
  );

  // ── atelier_remove_layer ────────────────────────────────────
  server.tool(
    "atelier_remove_layer",
    "Remove a layer from an Atelier document",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID to remove"),
    },
    async ({ id, layerId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const index = doc.layers.findIndex(l => l.id === layerId);
      if (index === -1) return err(`Layer "${layerId}" not found`);

      // Check for deltas that reference this layer
      const warnings: string[] = [];
      for (const [stateName, state] of Object.entries(doc.states)) {
        const deltaCount = state.deltas.filter(d => d.layer === layerId).length;
        if (deltaCount > 0) {
          warnings.push(`State "${stateName}" has ${deltaCount} delta(s) referencing this layer`);
        }
      }

      // Check for child layers
      const childCount = doc.layers.filter(l => l.parentId === layerId).length;
      if (childCount > 0) {
        warnings.push(`${childCount} child layer(s) reference this layer as parent`);
      }

      doc.layers.splice(index, 1);
      return ok({ layerId, removed: true, warnings });
    },
  );

  // ── atelier_list_layers ─────────────────────────────────────
  server.tool(
    "atelier_list_layers",
    "List all layers in an Atelier document",
    {
      id: z.string().describe("Document ID"),
    },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layers = doc.layers.map((l, index) => ({
        index,
        id: l.id,
        type: l.visual.type,
        frame: l.frame,
        bounds: l.bounds,
        description: l.description,
        tags: l.tags,
        opacity: l.opacity,
        rotation: l.rotation,
        parentId: l.parentId,
        visible: l.visible,
      }));

      return ok({ layers, count: layers.length });
    },
  );

  // ── atelier_reorder ─────────────────────────────────────────
  server.tool(
    "atelier_reorder",
    "Move a layer to a new position in the layer stack",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID to move"),
      position: z.number().int().min(0).describe("Target position index (0-based)"),
    },
    async ({ id, layerId, position }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const currentIndex = doc.layers.findIndex(l => l.id === layerId);
      if (currentIndex === -1) return err(`Layer "${layerId}" not found`);

      const targetPos = Math.min(position, doc.layers.length - 1);
      const [layer] = doc.layers.splice(currentIndex, 1);
      doc.layers.splice(targetPos, 0, layer);

      return ok({ layerId, from: currentIndex, to: targetPos });
    },
  );
}
