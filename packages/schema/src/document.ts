import { z } from "zod";
import { LayerSchema } from "./layer.js";
import { StateSchema } from "./state.js";
import { PresetSchema } from "./preset.js";
import { VariableSchema } from "./variable.js";
import { AssetSchema } from "./asset.js";

export const CanvasSchema = z.object({
  width: z.number().int().positive("Canvas width must be a positive integer"),
  height: z.number().int().positive("Canvas height must be a positive integer"),
  fps: z.number().int().positive("FPS must be a positive integer"),
  background: z.string().optional(),
});

export const AtelierDocumentSchema = z.object({
  version: z.string().min(1, "Version is required"),
  name: z.string().min(1, "Animation name is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  canvas: CanvasSchema,
  variables: z.record(z.string(), VariableSchema).optional(),
  assets: z.record(z.string(), AssetSchema).optional(),
  presets: z.record(z.string(), PresetSchema).optional(),
  layers: z.array(LayerSchema),
  states: z.record(z.string(), StateSchema),
});
