import { z } from "zod";
import { SlotRefSchema } from "./slot.js";
import { ScriptBeatIdSchema } from "./script.js";

/**
 * STORYBOARD.md — the composition artifact (front-of-pipeline spec §5).
 *
 * Authored by Lux. One storyboard beat per script beat (matching `id`),
 * plus optional storyboard-only beats prefixed `b-roll.*`.
 *
 * Iris walks this file beat by beat to mutate the live AtelierDocument.
 * Techniques are validated string-level here; library-version membership
 * is enforced by `validateArtifactSet` so the schema stays version-agnostic.
 *
 * Every sub-schema is `.strict()` per the package convention.
 */

/** Beat time window — `start_s` < `end_s` enforced by refine. */
export const BeatWindowSchema = z.object({
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
}).strict().refine((w) => w.end_s > w.start_s, {
  message: "window.end_s must be > window.start_s",
});

/** Camera block — closed kind enum, optional subject string. */
export const CameraSchema = z.object({
  kind: z.enum(["static", "drift", "push", "pull", "whip"]),
  subject: z.string().min(1).optional(),
}).strict();

/**
 * Mood adjectives — closed-ish vocabulary per spec §5. The spec lists
 * `tense | warm | clinical | mischievous | ...` with an explicit "...",
 * signalling the canonical set is open to extension. We validate
 * non-empty kebab-ish strings rather than enforce membership; the closed
 * set lives at the agent layer where it has UX consequence.
 */
export const MoodSchema = z.string().min(1);

/** Transition-out kind — closed enum per spec §5. */
export const TransitionKindSchema = z.enum(["cut", "dip-to-color", "whip", "crossfade"]);

/**
 * transition_out — the move out of this beat. `color` is a DESIGN
 * palette-token reference (e.g. `ember`), NOT a slot reference, so it is
 * a plain string here. Validation of token-existence is a cross-artifact
 * concern handled outside this schema.
 */
export const TransitionOutSchema = z.object({
  kind: TransitionKindSchema,
  duration_s: z.number().nonnegative().optional(),
  color: z.string().min(1).optional(),
}).strict();

/** A single SFX entry on a beat — a slot ref + gain. */
export const SfxEntrySchema = z.object({
  slot: SlotRefSchema,
  gain_db: z.number(),
}).strict();

/** Single storyboard beat. */
export const StoryboardBeatSchema = z.object({
  id: ScriptBeatIdSchema,
  window: BeatWindowSchema,
  mood: z.array(MoodSchema).min(1),
  camera: CameraSchema,
  slots: z.array(SlotRefSchema),
  techniques: z.array(z.string().min(1)),
  transition_out: TransitionOutSchema,
  sfx: z.array(SfxEntrySchema).optional(),
}).strict();

export type StoryboardBeat = z.infer<typeof StoryboardBeatSchema>;

/** Aspect ratios — closed enum (matches DESIGN's). Inlined to avoid a circular import. */
export const StoryboardAspectRatioSchema = z.enum(["9:16", "1:1", "16:9", "4:5"]);

/** StoryboardArtifactSchema — frontmatter + ordered beats. */
export const StoryboardArtifactSchema = z.object({
  technique_library_version: z.number().int().positive(),
  aspect_ratio: StoryboardAspectRatioSchema,
  beats: z.array(StoryboardBeatSchema).min(1),
}).strict();

export type StoryboardArtifact = z.infer<typeof StoryboardArtifactSchema>;

/** True if a storyboard beat id is in the b-roll namespace (script-id exempt). */
export function isBRollBeatId(id: string): boolean {
  return id.startsWith("b-roll.");
}
