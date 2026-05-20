// @a-company/atelier-mcp — Folder image ingestion tool
//
// Lets an agent point at a folder of images and pull them into a document as
// registered assets + (optionally) fit-to-canvas ImageVisual layers.
//
// The layer-building + background-swap convention mirrors
// @a-company/atelier-studio's image-drop helper (createImageLayerFromFile /
// buildImageLayer), adapted from the browser File/dataURL path to a node
// filesystem path. MCP does not depend on the studio package, so the logic is
// duplicated here (same pattern as the recipe-tool / overlay duplication
// elsewhere in this package). Aspect-fit (fitImageToCanvas) is intentionally
// NOT reused here — see the dimension note below.
//
// Dimension note: we do NOT add an image-dimension dependency. Without natural
// dimensions we cannot compute true aspect-fit, so each layer's bounds default
// to a centered square of min(canvas.width, canvas.height). This is surfaced in
// the tool description and in the response `note`.

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument, Layer } from "@a-company/atelier-types";
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

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(extname(name).toLowerCase());
}

/**
 * Minimal substring/`*`-glob match. Supports a single-segment glob (no path
 * separators) with `*` wildcards — enough for "*.png" / "hero-*". Returns true
 * for an undefined/empty pattern (match-all).
 */
function matchesGlob(name: string, glob: string | undefined): boolean {
  if (!glob) return true;
  // Translate the glob to a RegExp: escape regex specials, then * → .*
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(name);
}

/**
 * Derive a stable, filesystem-safe assetId from a filename, de-duped against a
 * set of already-used ids. "hero shot.png" → "hero-shot", colliding → "-2".
 */
function deriveAssetId(filename: string, used: Set<string>): string {
  const stem = basename(filename, extname(filename));
  const base = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}

/** Pick a unique layer id `${prefix}-N` not colliding with existing layers. */
function nextImageLayerId(existing: Set<string>, seq: number): string {
  let candidate = `image-${seq}`;
  let n = seq;
  while (existing.has(candidate)) {
    n++;
    candidate = `image-${n}`;
  }
  existing.add(candidate);
  return candidate;
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_import_images ───────────────────────────────────
  server.tool(
    "atelier_import_images",
    "Import every image in a folder into a document. Registers each as an asset and, " +
      "unless asLayers is false, creates one fit-to-canvas ImageVisual layer per image " +
      "(centered). Extensions: .png .jpg .jpeg .webp .gif .svg. Optional glob filters by " +
      "filename (e.g. \"*.png\"); results are sorted by name. If the folder has exactly one " +
      "image AND the doc's layer[0] is the welcome \"background\" placeholder, that image " +
      "replaces the placeholder in place. Asset src is the absolute file path. " +
      "Layer bounds default to a centered min(canvas.w, canvas.h) square because natural " +
      "image dimensions are not measured (no image-dimension dependency).",
    {
      documentId: z.string().describe("In-store document ID to import into"),
      dir: z.string().describe("Directory containing the images"),
      glob: z.string().optional().describe("Optional filename glob, e.g. \"*.png\" (default: all images)"),
      asLayers: z.boolean().optional().describe("Create layers per image (default: true). false = register assets only."),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, dir, glob, asLayers }) => {
      const result = getDoc(store, documentId);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const absDir = resolve(dir);
      if (!existsSync(absDir)) return err(`Directory "${absDir}" does not exist`);
      if (!statSync(absDir).isDirectory()) return err(`Path "${absDir}" is not a directory`);

      const files = readdirSync(absDir)
        .filter((name) => isImageFile(name) && matchesGlob(name, glob))
        .sort((a, b) => a.localeCompare(b));

      if (files.length === 0) {
        return err(`No image files matched in "${absDir}"${glob ? ` (glob: ${glob})` : ""}`);
      }

      const makeLayers = asLayers !== false;
      const canvas = doc.canvas;
      const square = Math.min(canvas.width, canvas.height);

      // Background-swap is only allowed for a single-image import (mirrors the
      // welcome-placeholder convention from the Studio image-drop helper).
      const allowBackgroundSwap = files.length === 1 && doc.layers[0]?.id === "background";

      // Copy-on-write: build a NEW doc with cloned assets + layers and store it
      // once at the end (mirrors applyRecipeToOverlay). A concurrent onChange
      // reader (the studio bridge) must never observe a half-mutated document.
      const newAssets: NonNullable<AtelierDocument["assets"]> = { ...(doc.assets ?? {}) };
      const newLayers: Layer[] = [...doc.layers];

      const usedAssetIds = new Set(Object.keys(newAssets));
      const existingLayerIds = new Set(newLayers.map((l) => l.id));

      const assetIds: string[] = [];
      const layerIds: string[] = [];

      let layerSeq = newLayers.length + 1;
      for (const file of files) {
        const absPath = join(absDir, file);
        const assetId = deriveAssetId(file, usedAssetIds);
        newAssets[assetId] = { type: "image", src: absPath, description: file };
        assetIds.push(assetId);

        if (!makeLayers) continue;

        const layerId = nextImageLayerId(existingLayerIds, layerSeq);
        layerSeq++;

        const layer: Layer = {
          id: layerId,
          visual: { type: "image", assetId, src: absPath },
          frame: { x: canvas.width / 2, y: canvas.height / 2 },
          bounds: { width: square, height: square },
          anchorPoint: { x: 0.5, y: 0.5 },
          opacity: 1,
        };

        if (allowBackgroundSwap) {
          // Single image filling the welcome placeholder — swap in place so any
          // existing overlays stay on top.
          newLayers[0] = layer;
        } else {
          // Bottom of the z-stack (renderer paints index 0 first), behind
          // existing overlays — matches the Studio drop convention.
          newLayers.unshift(layer);
        }
        layerIds.push(layerId);
      }

      const newDoc: AtelierDocument = { ...doc, assets: newAssets, layers: newLayers };
      store.set(documentId, newDoc, "llm");

      return ok({
        imported: files.length,
        assetIds,
        layerIds,
        asLayers: makeLayers,
        note:
          "Layer bounds default to a centered square (min canvas dimension) — " +
          "natural image dimensions are not measured.",
      });
    },
  );
}
