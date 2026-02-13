import { z } from "zod";

export const RGBAColorSchema = z.object({
  r: z.number().min(0).max(255),
  g: z.number().min(0).max(255),
  b: z.number().min(0).max(255),
  a: z.number().min(0).max(1),
});

export const HSLAColorSchema = z.object({
  h: z.number().min(0).max(360),
  s: z.number().min(0).max(100),
  l: z.number().min(0).max(100),
  a: z.number().min(0).max(1),
});

export const HexColorSchema = z.string().regex(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
  message: "Color must be a hex string: #RGB, #RGBA, #RRGGBB, or #RRGGBBAA",
});

export const ColorSchema = z.union([RGBAColorSchema, HSLAColorSchema, HexColorSchema]);
