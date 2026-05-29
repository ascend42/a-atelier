import { z } from "zod";

/**
 * Carousel slide schemas — see `@a-company/atelier-types/slides.ts` for
 * semantics. SlideRef.src points at any `.atelier` file in the workspace;
 * cycle detection is the resolver's responsibility (not enforced here).
 */

export const SlideTransitionSchema = z.object({
  kind: z.enum(["cut", "crossfade", "fade"]),
  durationFrames: z.number().int().min(0, "transition durationFrames must be a non-negative integer").optional(),
  color: z.string().optional(),
});

export const SlideRefSchema = z.object({
  src: z.string().min(1, "SlideRef.src is required"),
  duration: z.number().int().min(0, "SlideRef.duration must be a non-negative integer (frames)").optional(),
  transition: SlideTransitionSchema.optional(),
  label: z.string().optional(),
});
