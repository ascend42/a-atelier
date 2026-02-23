// @atelier/mcp — Layer effect tools (blend mode, shadow, motion path, clip path, visual editing)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  AtelierDocument,
  ShapeVisual,
  TextVisual,
  ImageVisual,
} from "@atelier/types";
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
  // ── atelier_set_blend_mode ────────────────────────────────
  server.tool(
    "atelier_set_blend_mode",
    "Set or clear the blend mode on a layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      blendMode: z.enum([
        "normal", "multiply", "screen", "overlay", "darken", "lighten",
        "color-dodge", "color-burn", "hard-light", "soft-light",
        "difference", "exclusion", "hue", "saturation", "color", "luminosity",
      ]).nullable().describe("Blend mode to set, or null to clear"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, blendMode }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (blendMode === null) {
        delete layer.blendMode;
        return ok({ layerId, blendMode: null, cleared: true });
      }

      layer.blendMode = blendMode;
      return ok({ layerId, blendMode });
    },
  );

  // ── atelier_set_shadow ────────────────────────────────────
  server.tool(
    "atelier_set_shadow",
    "Set or remove a drop shadow on a layer",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      shadow: z.object({
        color: z.unknown().describe("Shadow color (hex string or RGBA/HSLA object)"),
        blur: z.number().min(0).describe("Blur radius in pixels"),
        offsetX: z.number().optional().describe("Horizontal offset in pixels"),
        offsetY: z.number().optional().describe("Vertical offset in pixels"),
      }).nullable().describe("Shadow definition, or null to remove"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, shadow }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (shadow === null) {
        delete layer.shadow;
        return ok({ layerId, shadow: null, removed: true });
      }

      layer.shadow = shadow as unknown as NonNullable<typeof layer.shadow>;
      return ok({ layerId, hasShadow: true });
    },
  );

  // ── atelier_set_tint ─────────────────────────────────────
  server.tool(
    "atelier_set_tint",
    "Set or remove a color tint on a layer (works on any visual type)",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      tint: z.object({
        color: z.string().describe("Tint color (hex string)"),
        amount: z.number().min(0).max(1).describe("Tint amount (0 = none, 1 = full)"),
      }).nullable().describe("Tint definition, or null to remove"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, tint }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (tint === null) {
        delete layer.tint;
        return ok({ layerId, tint: null, removed: true });
      }

      layer.tint = tint;
      return ok({ layerId, hasTint: true });
    },
  );

  // ── atelier_set_motion_path ───────────────────────────────
  server.tool(
    "atelier_set_motion_path",
    "Set or remove a motion path on a layer for path-based position animation",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      motionPath: z.object({
        points: z.array(z.object({
          x: z.number(),
          y: z.number(),
          in: z.object({ x: z.number(), y: z.number() }).optional(),
          out: z.object({ x: z.number(), y: z.number() }).optional(),
        })).min(2).describe("Path points (minimum 2)"),
        closed: z.boolean().optional().describe("Whether the path is closed"),
        autoRotate: z.boolean().optional().describe("Auto-rotate layer to follow path tangent"),
        autoRotateOffset: z.number().optional().describe("Rotation offset in degrees when autoRotate is enabled"),
      }).nullable().describe("Motion path definition, or null to remove"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, motionPath }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (motionPath === null) {
        delete layer.motionPath;
        return ok({ layerId, motionPath: null, removed: true });
      }

      layer.motionPath = motionPath as unknown as NonNullable<typeof layer.motionPath>;
      return ok({ layerId, pointCount: motionPath.points.length, closed: motionPath.closed ?? false });
    },
  );

  // ── atelier_set_clip_path ─────────────────────────────────
  server.tool(
    "atelier_set_clip_path",
    "Set or remove a clip path on a layer to restrict rendering to within a shape",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      clipPath: z.object({
        type: z.enum(["rect", "ellipse", "path"]).describe("Clip shape type"),
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
      }).nullable().describe("Clip path shape, or null to remove"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, clipPath }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      if (clipPath === null) {
        delete layer.clipPath;
        return ok({ layerId, clipPath: null, removed: true });
      }

      layer.clipPath = clipPath as unknown as NonNullable<typeof layer.clipPath>;
      return ok({ layerId, clipType: clipPath.type });
    },
  );

  // ── atelier_edit_visual ───────────────────────────────────
  server.tool(
    "atelier_edit_visual",
    "Edit visual content of an existing layer (text content/style, image src/assetId, shape/fill/stroke)",
    {
      id: z.string().describe("Document ID"),
      layerId: z.string().describe("Layer ID"),
      // Text fields
      content: z.string().optional().describe("New text content (text layers only)"),
      style: z.record(z.unknown()).optional().describe("Partial style update — only provided keys are overwritten (text layers only)"),
      // Image fields
      src: z.string().optional().describe("Image source URL (image layers only)"),
      assetId: z.string().optional().describe("Asset ID reference (image layers only)"),
      sourceRect: z.object({
        x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(),
      }).nullable().optional().describe("Source rectangle crop (image layers only). Null to remove."),
      spritesheet: z.object({
        columns: z.number().int().positive(),
        rows: z.number().int().positive(),
        frameCount: z.number().int().positive().optional(),
        frameWidth: z.number().positive(),
        frameHeight: z.number().positive(),
      }).nullable().optional().describe("Spritesheet config (image layers only). Null to remove."),
      frameIndex: z.number().int().min(0).optional().describe("Spritesheet frame index (image layers only)"),
      // Shape fields
      shape: z.object({
        type: z.enum(["rect", "ellipse", "path"]),
        cornerRadius: z.union([
          z.number(),
          z.tuple([z.number(), z.number(), z.number(), z.number()]),
        ]).optional(),
        points: z.array(z.object({
          x: z.number(),
          y: z.number(),
          in: z.object({ x: z.number(), y: z.number() }).optional(),
          out: z.object({ x: z.number(), y: z.number() }).optional(),
        })).optional(),
        closed: z.boolean().optional(),
      }).optional().describe("New shape (shape layers only)"),
      fill: z.record(z.unknown()).optional().describe("New fill definition (shape layers only)"),
      stroke: z.record(z.unknown()).optional().describe("New stroke definition (shape layers only)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, layerId, content, style, src, assetId, sourceRect, spritesheet, frameIndex, shape, fill, stroke }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const layer = doc.layers.find(l => l.id === layerId);
      if (!layer) return err(`Layer "${layerId}" not found`);

      const visualType = layer.visual.type;
      const updated: string[] = [];

      // Text fields
      if (content !== undefined) {
        if (visualType !== "text") return err(`Cannot set "content" on ${visualType} layer — text layers only`);
        (layer.visual as TextVisual).content = content;
        updated.push("content");
      }
      if (style !== undefined) {
        if (visualType !== "text") return err(`Cannot set "style" on ${visualType} layer — text layers only`);
        const currentStyle = (layer.visual as TextVisual).style;
        Object.assign(currentStyle, style);
        updated.push("style");
      }

      // Image fields
      if (src !== undefined) {
        if (visualType !== "image") return err(`Cannot set "src" on ${visualType} layer — image layers only`);
        (layer.visual as ImageVisual).src = src;
        updated.push("src");
      }
      if (assetId !== undefined) {
        if (visualType !== "image") return err(`Cannot set "assetId" on ${visualType} layer — image layers only`);
        (layer.visual as ImageVisual).assetId = assetId;
        updated.push("assetId");
      }
      if (sourceRect !== undefined) {
        if (visualType !== "image") return err(`Cannot set "sourceRect" on ${visualType} layer — image layers only`);
        if (sourceRect === null) {
          delete (layer.visual as ImageVisual).sourceRect;
          updated.push("sourceRect (removed)");
        } else {
          (layer.visual as ImageVisual).sourceRect = sourceRect;
          updated.push("sourceRect");
        }
      }
      if (spritesheet !== undefined) {
        if (visualType !== "image") return err(`Cannot set "spritesheet" on ${visualType} layer — image layers only`);
        if (spritesheet === null) {
          delete (layer.visual as ImageVisual).spritesheet;
          updated.push("spritesheet (removed)");
        } else {
          (layer.visual as ImageVisual).spritesheet = spritesheet;
          updated.push("spritesheet");
        }
      }
      if (frameIndex !== undefined) {
        if (visualType !== "image") return err(`Cannot set "frameIndex" on ${visualType} layer — image layers only`);
        (layer.visual as ImageVisual).frameIndex = frameIndex;
        updated.push("frameIndex");
      }

      // Shape fields
      if (shape !== undefined) {
        if (visualType !== "shape") return err(`Cannot set "shape" on ${visualType} layer — shape layers only`);
        (layer.visual as ShapeVisual).shape = shape as ShapeVisual["shape"];
        updated.push("shape");
      }
      if (fill !== undefined) {
        if (visualType !== "shape") return err(`Cannot set "fill" on ${visualType} layer — shape layers only`);
        (layer.visual as ShapeVisual).fill = fill as unknown as ShapeVisual["fill"];
        updated.push("fill");
      }
      if (stroke !== undefined) {
        if (visualType !== "shape") return err(`Cannot set "stroke" on ${visualType} layer — shape layers only`);
        (layer.visual as ShapeVisual).stroke = stroke as unknown as ShapeVisual["stroke"];
        updated.push("stroke");
      }

      if (updated.length === 0) {
        return err("No visual fields provided to update");
      }

      return ok({ layerId, visualType, updated });
    },
  );
}
