import { z } from "zod";
import { LayerSchema } from "./layer.js";
import { StateSchema } from "./state.js";
import { PresetSchema } from "./preset.js";
import { VariableSchema } from "./variable.js";
import { AssetSchema } from "./asset.js";
import { TimelineSchema } from "./timeline.js";
import { SlideRefSchema } from "./slides.js";
import { AtelierDesignSchema } from "./design.js";

export const CanvasSchema = z.object({
  width: z.number().int().positive("Canvas width must be a positive integer"),
  height: z.number().int().positive("Canvas height must be a positive integer"),
  fps: z.number().int().positive("FPS must be a positive integer"),
  background: z.string().optional(),
});

/**
 * Project kind — controls which downstream exporters apply and which other
 * fields are meaningful. Absent = `"video"` for backcompat with pre-v1
 * documents. See `@a-company/atelier-types/document.ts` for the full
 * narrative.
 */
export const ProjectKindSchema = z.enum(["video", "image", "carousel"]);

export const AtelierDocumentSchema = z.object({
  version: z.string().min(1, "Version is required"),
  name: z.string().min(1, "Animation name is required"),
  kind: ProjectKindSchema.optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  canvas: CanvasSchema,
  /** Per-file design / brand block (self-contained — no auto-merge). */
  design: AtelierDesignSchema.optional(),
  variables: z.record(z.string(), VariableSchema).optional(),
  assets: z.record(z.string(), AssetSchema).optional(),
  presets: z.record(z.string(), PresetSchema).optional(),
  layers: z.array(LayerSchema),
  states: z.record(z.string(), StateSchema),
  /** Derived timeline summary for video-kind projects. Optional. */
  timeline: TimelineSchema.optional(),
  /** Carousel slides — only meaningful when kind === "carousel". */
  slides: z.array(SlideRefSchema).optional(),
});
