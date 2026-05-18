// @a-company/atelier-mcp — Overlay layer tools (handle, page-number)
//
// Convenience tools for agents that build social-feed style overlays
// (creator handle, "1/5" page indicator). Both tools tag emitted layers
// "overlay" so re-running recipe pipelines (applyRecipeToOverlay) won't
// destroy user-tweaked overlays — the same tag-namespace isolation
// invariant used by silence-trim and caption layers.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, Layer, TextStyle } from "@a-company/atelier-types";
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

const AnchorEnum = z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]);

// Mirrors recipe OverlayTextStyle (snake_case). Kept loose — partial overrides
// merge over the runtime defaults below.
const OverlayStyleSchema = z.object({
  font_family: z.string().optional(),
  font_size: z.number().positive().optional(),
  font_weight: z.union([z.number(), z.enum(["normal", "bold"])]).optional(),
  color: z.string().optional(),
}).optional();

const DEFAULT_OVERLAY_MARGIN = 24;
const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Inter",
  fontSize: 24,
  fontWeight: 600,
  color: "#F5F5F7",
};

type Anchor = z.infer<typeof AnchorEnum>;
type OverlayStyleInput = {
  font_family?: string;
  font_size?: number;
  font_weight?: number | "normal" | "bold";
  color?: string;
};

function anchorToFrame(
  anchor: Anchor,
  canvas: AtelierDocument["canvas"],
  margin: number,
): { frame: { x: number; y: number }; anchorPoint: { x: number; y: number } } {
  switch (anchor) {
    case "top-left":
      return { frame: { x: margin, y: margin }, anchorPoint: { x: 0, y: 0 } };
    case "top-right":
      return { frame: { x: canvas.width - margin, y: margin }, anchorPoint: { x: 1, y: 0 } };
    case "bottom-left":
      return { frame: { x: margin, y: canvas.height - margin }, anchorPoint: { x: 0, y: 1 } };
    case "bottom-right":
      return {
        frame: { x: canvas.width - margin, y: canvas.height - margin },
        anchorPoint: { x: 1, y: 1 },
      };
  }
}

function mergeStyle(style: OverlayStyleInput | undefined): TextStyle {
  return {
    fontFamily: style?.font_family ?? DEFAULT_TEXT_STYLE.fontFamily,
    fontSize: style?.font_size ?? DEFAULT_TEXT_STYLE.fontSize,
    fontWeight: style?.font_weight ?? DEFAULT_TEXT_STYLE.fontWeight,
    color: style?.color ?? DEFAULT_TEXT_STYLE.color,
  };
}

/**
 * Render a page-number format template — substitutes {current} / {total}
 * placeholders including zero-pad forms ({current:02d}, {total:02d}).
 * Mirrors recipe.ts's renderPageNumberFormat exactly (intentional duplication
 * to keep the mcp package independent of the cli package).
 */
function renderPageNumberFormat(format: string, currentIndex: number, totalCount: number): string {
  return format.replace(
    /\{(current|total)(?::0(\d+)d)?\}/g,
    (_, name: string, padWidth?: string) => {
      const value = name === "current" ? currentIndex : totalCount;
      const str = String(value);
      if (padWidth) {
        const width = parseInt(padWidth, 10);
        return str.padStart(width, "0");
      }
      return str;
    },
  );
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_add_handle ──────────────────────────────────────
  server.tool(
    "atelier_add_handle",
    "Add an anchored creator-handle TextVisual overlay layer (tag: overlay)",
    {
      id: z.string().describe("Document ID"),
      text: z.string().min(1).describe("Handle text, e.g. \"@username\""),
      anchor: AnchorEnum.describe("Anchored corner"),
      margin: z.number().nonnegative().optional().describe("Px from anchored edges (default 24)"),
      style: OverlayStyleSchema.describe("Text style overrides (snake_case to match recipe)"),
      layerId: z.string().optional().describe("Layer ID (default: overlay-handle)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, text, anchor, margin, style, layerId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const targetId = layerId ?? "overlay-handle";
      if (doc.layers.some((l) => l.id === targetId)) {
        return err(`Layer "${targetId}" already exists in document "${id}"`);
      }

      const m = margin ?? DEFAULT_OVERLAY_MARGIN;
      const { frame, anchorPoint } = anchorToFrame(anchor, doc.canvas, m);
      const layer: Layer = {
        id: targetId,
        tags: ["overlay"],
        visual: { type: "text", content: text, style: mergeStyle(style) },
        frame,
        bounds: { width: 600, height: 80 },
        anchorPoint,
      };

      doc.layers.push(layer);
      store.set(id, doc);
      return ok({ layerId: targetId, layer });
    },
  );

  // ── atelier_add_page_number ─────────────────────────────────
  server.tool(
    "atelier_add_page_number",
    "Add an anchored page-number TextVisual overlay layer (tag: overlay). " +
      "Substitutes {current} / {total} (and zero-pad forms {current:02d} / {total:02d}) into format.",
    {
      id: z.string().describe("Document ID"),
      format: z.string().min(1).describe("Format string, e.g. \"{current}/{total}\" or \"{current:02d}/{total:02d}\""),
      anchor: AnchorEnum.describe("Anchored corner"),
      currentIndex: z.number().int().nonnegative().describe("1-based current index"),
      totalCount: z.number().int().positive().describe("Total count"),
      margin: z.number().nonnegative().optional().describe("Px from anchored edges (default 24)"),
      style: OverlayStyleSchema.describe("Text style overrides (snake_case to match recipe)"),
      layerId: z.string().optional().describe("Layer ID (default: overlay-page-number)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, format, anchor, currentIndex, totalCount, margin, style, layerId }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const targetId = layerId ?? "overlay-page-number";
      if (doc.layers.some((l) => l.id === targetId)) {
        return err(`Layer "${targetId}" already exists in document "${id}"`);
      }

      const content = renderPageNumberFormat(format, currentIndex, totalCount);
      const m = margin ?? DEFAULT_OVERLAY_MARGIN;
      const { frame, anchorPoint } = anchorToFrame(anchor, doc.canvas, m);
      const layer: Layer = {
        id: targetId,
        tags: ["overlay"],
        visual: { type: "text", content, style: mergeStyle(style) },
        frame,
        bounds: { width: 200, height: 80 },
        anchorPoint,
      };

      doc.layers.push(layer);
      store.set(id, doc);
      return ok({ layerId: targetId, layer, rendered: content });
    },
  );
}
