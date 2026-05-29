import { z } from "zod";
import { SlotRefSchema } from "./slot.js";

/**
 * SCRIPT.md — the narrative artifact (front-of-pipeline spec §4).
 *
 * Authored by Quill, refined by Lux. Two modes — discriminated union on
 * `mode`:
 *  - `narrated`: four ordered blocks (hook/story/proof/cta), each a list
 *    of beats with optional `bind_to_transcript` for post-VO rebinding.
 *  - `carousel` | `text-only`: flat ordered list of beats; no transcript
 *    binding (no VO exists).
 *
 * Every sub-schema is `.strict()` per the package convention.
 */

/** Kebab-case beat-id pattern — also accepts `b-roll.<rest>` prefix used by STORYBOARD. */
const BEAT_ID_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;

/** Beat-id schema — kebab-case, may contain dot-prefixed namespaces like `b-roll.intro`. */
export const ScriptBeatIdSchema = z.string().regex(BEAT_ID_RE, {
  message: "beat id must be kebab-case (optionally dot-namespaced, e.g. `proof-1` or `b-roll.intro`)",
});

/** Narrated-mode beat — has `bind_to_transcript` (default true). */
export const NarratedBeatSchema = z.object({
  id: ScriptBeatIdSchema,
  copy: z.string().min(1),
  intent: z.string().min(1),
  est_duration_s: z.number().nonnegative(),
  bind_to_transcript: z.boolean().default(true),
}).strict();

export type NarratedBeat = z.infer<typeof NarratedBeatSchema>;

/** Non-narrated beat — carousel / text-only; no transcript binding field. */
export const NonNarratedBeatSchema = z.object({
  id: ScriptBeatIdSchema,
  copy: z.string().min(1),
  intent: z.string().min(1),
  est_duration_s: z.number().nonnegative(),
}).strict();

export type NonNarratedBeat = z.infer<typeof NonNarratedBeatSchema>;

/** Narrated-mode body: four ordered blocks. */
export const NarratedBlocksSchema = z.object({
  hook: z.array(NarratedBeatSchema).min(1),
  story: z.array(NarratedBeatSchema),
  proof: z.array(NarratedBeatSchema),
  cta: z.array(NarratedBeatSchema).min(1),
}).strict();

/**
 * The script mode is a discriminated union on `mode`. Top-level fields:
 *   mode, target_duration_s, language, tts_voice?
 * Plus the beat structure: narrated has four blocks; carousel/text-only
 * has a flat `beats` list.
 */
export const NarratedScriptSchema = z.object({
  mode: z.literal("narrated"),
  target_duration_s: z.number().positive(),
  language: z.string().min(1),
  /** Optional slot reference for TTS voice (e.g. `voice.host.primary`). */
  tts_voice: SlotRefSchema.optional(),
  blocks: NarratedBlocksSchema,
  /** Markdown body verbatim — attached by the parser when the body has stray prose. */
  body: z.string(),
}).strict();

export const CarouselScriptSchema = z.object({
  mode: z.literal("carousel"),
  target_duration_s: z.number().positive(),
  language: z.string().min(1),
  tts_voice: SlotRefSchema.optional(),
  beats: z.array(NonNarratedBeatSchema).min(1),
  body: z.string(),
}).strict();

export const TextOnlyScriptSchema = z.object({
  mode: z.literal("text-only"),
  target_duration_s: z.number().positive(),
  language: z.string().min(1),
  tts_voice: SlotRefSchema.optional(),
  beats: z.array(NonNarratedBeatSchema).min(1),
  body: z.string(),
}).strict();

/** ScriptArtifactSchema — discriminated union across the three modes. */
export const ScriptArtifactSchema = z.discriminatedUnion("mode", [
  NarratedScriptSchema,
  CarouselScriptSchema,
  TextOnlyScriptSchema,
]);

export type ScriptArtifact = z.infer<typeof ScriptArtifactSchema>;
export type NarratedScript = z.infer<typeof NarratedScriptSchema>;
export type CarouselScript = z.infer<typeof CarouselScriptSchema>;
export type TextOnlyScript = z.infer<typeof TextOnlyScriptSchema>;

/**
 * Flatten all beats from a script regardless of mode — useful for
 * cross-artifact validation and duration summing.
 */
export function allScriptBeats(script: ScriptArtifact): Array<NarratedBeat | NonNarratedBeat> {
  if (script.mode === "narrated") {
    return [
      ...script.blocks.hook,
      ...script.blocks.story,
      ...script.blocks.proof,
      ...script.blocks.cta,
    ];
  }
  return script.beats;
}
