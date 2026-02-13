import { z } from "zod";

export const AssetTypeSchema = z.enum(["image", "svg", "font", "animation"]);

export const AssetSchema = z.object({
  type: AssetTypeSchema,
  src: z.string().min(1, "Asset src is required"),
  description: z.string().optional(),
});
