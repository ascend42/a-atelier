// @a-company/atelier-mcp — Shape, fill, and stroke tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, ShapeVisual } from "@a-company/atelier-types";
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
  // ── atelier_set_shape ───────────────────────────────────────
  server.tool(
    "atelier_set_shape",
    "Set the shape on a shape-type layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID (must be a shape visual)"),
      shape: z.object({
        type: z.enum(["rect", "ellipse", "path"]).describe("Shape type"),
        cornerRadius: z.union([
          z.number(),
          z.tuple([z.number(), z.number(), z.number(), z.number()]),
        ]).optional().describe("Corner radius (rect only)"),
        points: z.array(z.object({
          x: z.number(),
          y: z.number(),
          in: z.object({ x: z.number(), y: z.number() }).optional(),
          out: z.object({ x: z.number(), y: z.number() }).optional(),
        })).optional().describe("Path points (path only)"),
        closed: z.boolean().optional().describe("Whether path is closed (path only)"),
      }).describe("Shape definition"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, shape }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);
      if (layer.visual.type !== "shape") return err(`Layer "${layerId}" is type "${layer.visual.type}", not "shape"`);

      (layer.visual as ShapeVisual).shape = shape as ShapeVisual["shape"];
      return ok({ layerId, shape: shape.type });
    },
  );

  // ── atelier_set_fill ────────────────────────────────────────
  server.tool(
    "atelier_set_fill",
    "Set the fill on a shape-type layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID (must be a shape visual)"),
      fill: z.object({
        type: z.enum(["solid", "linear-gradient", "radial-gradient"]).describe("Fill type"),
        color: z.unknown().optional().describe("Color for solid fill (hex string or RGBA/HSLA object)"),
        angle: z.number().optional().describe("Angle in degrees (linear-gradient only)"),
        center: z.object({
          x: z.union([z.number(), z.string()]),
          y: z.union([z.number(), z.string()]),
        }).optional().describe("Center point (radial-gradient only)"),
        radius: z.union([z.number(), z.string()]).optional().describe("Radius (radial-gradient only)"),
        stops: z.array(z.object({
          offset: z.number().min(0).max(1),
          color: z.unknown(),
        })).optional().describe("Gradient stops"),
      }).describe("Fill definition"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, fill }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);
      if (layer.visual.type !== "shape") return err(`Layer "${layerId}" is type "${layer.visual.type}", not "shape"`);

      (layer.visual as ShapeVisual).fill = fill as unknown as ShapeVisual["fill"];
      return ok({ layerId, fillType: fill.type });
    },
  );

  // ── atelier_set_stroke ──────────────────────────────────────
  server.tool(
    "atelier_set_stroke",
    "Set the stroke on a shape-type layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID (must be a shape visual)"),
      stroke: z.object({
        color: z.unknown().describe("Stroke color (hex string or RGBA/HSLA object)"),
        width: z.number().positive().describe("Stroke width in pixels"),
        dash: z.array(z.number()).optional().describe("Dash pattern"),
        lineCap: z.enum(["butt", "round", "square"]).optional().describe("Line cap style"),
        lineJoin: z.enum(["miter", "round", "bevel"]).optional().describe("Line join style"),
      }).describe("Stroke definition"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, stroke }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);
      if (layer.visual.type !== "shape") return err(`Layer "${layerId}" is type "${layer.visual.type}", not "shape"`);

      (layer.visual as ShapeVisual).stroke = stroke as unknown as ShapeVisual["stroke"];
      return ok({ layerId, strokeWidth: stroke.width });
    },
  );
}
