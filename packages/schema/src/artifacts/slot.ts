import { z } from "zod";

/**
 * Slot reference vocabulary (front-of-pipeline artifacts spec §5).
 *
 * Format: `<kind>.<open-tail>` where `<open-tail>` is one or more
 * dot-separated segments. The canonical form per spec §5 is
 * `<kind>.<category>.<specifier>` (three segments), but the spec's own
 * STORYBOARD example mixes longer (`audio.sfx.transition.whoosh`, four
 * segments) and shorter (`font.display`, two segments) forms. We reconcile
 * by enforcing the contract that's stable across both: `kind` is closed,
 * everything after the first dot is open.
 *
 * - `kind` is a CLOSED enum (the seven asset-family roots).
 * - At least one open segment must follow the kind.
 *
 * Aligns conceptually with `VariableSchema`'s `asset` type — both are the
 * inert-reference surface that the mind-map binds at compose time (TD-229).
 */
export const SlotKindSchema = z.enum([
  "image",
  "video",
  "audio",
  "text",
  "font",
  "voice",
  "logo",
]);

export type SlotKind = z.infer<typeof SlotKindSchema>;

export const SLOT_KINDS = SlotKindSchema.options;

/**
 * Parse a slot reference into its segments. Returns null if the string
 * does not satisfy `<kind>.<tail>` (where `<tail>` has at least one
 * segment); otherwise returns the kind plus the logical category and
 * specifier. When only two segments are present (e.g. `font.display`),
 * `category` carries the open segment and `specifier` is the empty string.
 */
export function parseSlotRef(ref: string): { kind: SlotKind; category: string; specifier: string } | null {
  if (typeof ref !== "string" || ref.length === 0) return null;
  const segments = ref.split(".");
  if (segments.length < 2) return null;
  if (segments.some((s) => s.length === 0)) return null;
  const [rawKind, category, ...rest] = segments;
  const kindParsed = SlotKindSchema.safeParse(rawKind);
  if (!kindParsed.success) return null;
  const specifier = rest.join(".");
  return { kind: kindParsed.data, category, specifier };
}

/**
 * Zod schema for a single slot reference string. Refuses unknown `kind`
 * segments; permits any open `category.specifier`. The specifier may
 * itself contain dots (e.g. `audio.sfx.transition.whoosh`).
 */
export const SlotRefSchema = z.string().superRefine((value, ctx) => {
  const parsed = parseSlotRef(value);
  if (parsed !== null) return;
  // Distinguish "unknown kind" from "shape wrong" for clearer errors.
  const segments = value.split(".");
  if (segments.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `slot reference "${value}" must have at least two segments (<kind>.<open-tail>)`,
    });
    return;
  }
  if (segments.some((s) => s.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `slot reference "${value}" has an empty segment`,
    });
    return;
  }
  const kindOk = SlotKindSchema.safeParse(segments[0]).success;
  if (!kindOk) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `slot reference "${value}" has unknown kind "${segments[0]}" — expected one of ${SLOT_KINDS.join(", ")}`,
    });
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: `slot reference "${value}" is malformed`,
  });
});
