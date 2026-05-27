import { z } from "zod";

/**
 * Animation Technique Library (front-of-pipeline artifacts spec §5).
 *
 * STORYBOARD beats declare `technique_library_version` and pull techniques
 * by string name from the library at that version. Iris refuses unknown
 * techniques at compose time. The schema itself only validates that
 * `techniques: string[]` — membership against the active library is
 * enforced by `validateArtifactSet` so the pure-Zod schema stays version-
 * agnostic.
 *
 * Versioning policy: integer (per artifact spec §9 Q4). Bump on additive
 * changes; older STORYBOARDs continue to declare their original version.
 * Library versions are SUPERSETS: v(n+1) contains every entry from v(n) so
 * a creator's existing storyboard never breaks when the library moves
 * forward.
 */
export const TechniqueLibrarySchema = z.object({
  version: z.number().int().positive(),
  techniques: z.array(z.string().min(1)),
}).strict();

export type TechniqueLibrary = z.infer<typeof TechniqueLibrarySchema>;

/**
 * Version 1 starter set — drawn from the artifact spec's STORYBOARD EXAMPLE.
 * Additions land in higher versions; v1 stays frozen.
 */
export const TECHNIQUE_LIBRARY_V1: TechniqueLibrary = {
  version: 1,
  techniques: [
    "text.split-reveal",
    "image.ken-burns.slow",
    "super.weight-pulse-on-keyword",
    "background.color-shift-to-token",
  ],
};

/**
 * Version 2 — additive expansion for Iris's animation craft. Twelve new
 * techniques cover text, image, transition, super (overlay text), and audio
 * categories so STORYBOARD can call for them by name and Iris's
 * compose-from-primitives skill knows how to lower each one to MCP calls.
 *
 * Every v1 entry is preserved (supersets, not replacements).
 */
export const TECHNIQUE_LIBRARY_V2: TechniqueLibrary = {
  version: 2,
  techniques: [
    // v1 (preserved)
    "text.split-reveal",
    "image.ken-burns.slow",
    "super.weight-pulse-on-keyword",
    "background.color-shift-to-token",
    // v2 additions — text
    "text.kinetic-keyword-emphasis",
    "text.typewriter",
    // v2 additions — image
    "image.zoom-in-during-beat",
    "image.cross-dissolve",
    "image.parallax-pan-slow",
    // v2 additions — transition
    "transition.whip-pan",
    "transition.match-cut",
    "transition.morph-cut",
    "transition.fade-through-color",
    // v2 additions — super (overlay text)
    "super.scale-in-spring",
    "super.drop-in-staggered",
    // v2 additions — audio
    "audio.fade-under-vo",
  ],
};

/** Registry of all shipped technique-library versions. Keyed by integer version. */
export const TECHNIQUE_LIBRARIES: Record<number, TechniqueLibrary> = {
  1: TECHNIQUE_LIBRARY_V1,
  2: TECHNIQUE_LIBRARY_V2,
};

/** The current/latest shipped library version. */
export const CURRENT_TECHNIQUE_LIBRARY_VERSION = 2;

/** Resolve a library by version; returns null if the version is not shipped. */
export function getTechniqueLibrary(version: number): TechniqueLibrary | null {
  return TECHNIQUE_LIBRARIES[version] ?? null;
}
