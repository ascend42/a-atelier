import { z } from "zod";

/**
 * Per-file design block schemas — see `@a-company/atelier-types/design.ts`
 * for semantics. Self-contained per file; lineage is explicit via
 * `relatedTo[]` (no auto-merge at render time).
 */

export const DesignRelationSchema = z.enum(["derived-from", "sibling", "references"]);

export const AtelierDesignRelationSchema = z.object({
  source: z.string().min(1, "AtelierDesignRelation.source is required"),
  relation: DesignRelationSchema,
  note: z.string().optional(),
});

export const DesignTypographySchema = z.object({
  headingFamily: z.string().optional(),
  bodyFamily: z.string().optional(),
  monoFamily: z.string().optional(),
  sizes: z.record(z.string(), z.number().positive()).optional(),
  weights: z.record(z.string(), z.string()).optional(),
});

export const DesignMotionSchema = z.object({
  defaultEasing: z.string().optional(),
  defaultDuration: z.number().int().positive().optional(),
});

export const AtelierDesignSchema = z.object({
  palette: z.record(z.string(), z.string()).optional(),
  typography: DesignTypographySchema.optional(),
  motion: DesignMotionSchema.optional(),
  relatedTo: z.array(AtelierDesignRelationSchema).optional(),
});
