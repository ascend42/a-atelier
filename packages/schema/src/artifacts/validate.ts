import type { DesignArtifact } from "./design.js";
import { allScriptBeats, type ScriptArtifact } from "./script.js";
import { isBRollBeatId, type StoryboardArtifact } from "./storyboard.js";
import { parseSlotRef, SLOT_KINDS } from "./slot.js";
import { getTechniqueLibrary } from "./technique.js";

/**
 * Cross-artifact validation result.
 *
 * NOTE: this return shape (`{ ok, warnings, errors }`) is intentionally
 * DIFFERENT from the recipe-package's `{ success, warnings? }` idiom.
 * The artifacts surface validates multiple independent rules whose
 * severities differ (some are warn-only pre-VO, others are hard fails)
 * — flattening to a single discriminated result loses that.
 */
export interface ArtifactSetValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export interface ArtifactSet {
  design?: DesignArtifact;
  script?: ScriptArtifact;
  storyboard?: StoryboardArtifact;
}

/**
 * Run cross-artifact validation:
 *  1. Every STORYBOARD beat id must match a SCRIPT beat id, UNLESS the
 *     storyboard id is prefixed `b-roll.` (exemption per task spec).
 *  2. Every slot reference (in storyboard beats and sfx entries) parses
 *     to `<kind>.<category>.<specifier>` and uses a known kind.
 *  3. Every storyboard technique exists in the active technique library
 *     (resolved by `technique_library_version`).
 *  4. Sum of script beat `est_duration_s` ≤ `target_duration_s`
 *     (WARN-ONLY pre-VO; the Iris pipeline will hard-fail post-transcript
 *     binding — that's later code, not this validator's job).
 *
 * This function never throws — callers decide what to do with `ok`.
 */
export function validateArtifactSet(set: ArtifactSet): ArtifactSetValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // --- (1) Beat-id matching between STORYBOARD and SCRIPT ---
  if (set.storyboard && set.script) {
    const scriptIds = new Set(allScriptBeats(set.script).map((b) => b.id));
    for (const beat of set.storyboard.beats) {
      if (isBRollBeatId(beat.id)) continue;
      if (!scriptIds.has(beat.id)) {
        errors.push(
          `STORYBOARD beat "${beat.id}" has no matching SCRIPT beat (and is not prefixed b-roll.)`,
        );
      }
    }
  }

  // --- (2) Slot reference validity ---
  if (set.storyboard) {
    for (const beat of set.storyboard.beats) {
      for (const slot of beat.slots) {
        const parsed = parseSlotRef(slot);
        if (parsed === null) {
          errors.push(
            `STORYBOARD beat "${beat.id}" slot "${slot}" is malformed or has an unknown kind (expected one of ${SLOT_KINDS.join(", ")})`,
          );
        }
      }
      if (beat.sfx) {
        for (const sfx of beat.sfx) {
          const parsed = parseSlotRef(sfx.slot);
          if (parsed === null) {
            errors.push(
              `STORYBOARD beat "${beat.id}" sfx slot "${sfx.slot}" is malformed or has an unknown kind`,
            );
          }
        }
      }
    }
  }

  // --- (3) Technique library membership ---
  if (set.storyboard) {
    const lib = getTechniqueLibrary(set.storyboard.technique_library_version);
    if (lib === null) {
      errors.push(
        `STORYBOARD references unknown technique_library_version ${set.storyboard.technique_library_version}`,
      );
    } else {
      const known = new Set(lib.techniques);
      for (const beat of set.storyboard.beats) {
        for (const t of beat.techniques) {
          if (!known.has(t)) {
            errors.push(
              `STORYBOARD beat "${beat.id}" uses unknown technique "${t}" (technique_library_version=${lib.version})`,
            );
          }
        }
      }
    }
  }

  // --- (4) Duration sum (WARN-ONLY pre-VO) ---
  if (set.script) {
    const sum = allScriptBeats(set.script).reduce((acc, b) => acc + b.est_duration_s, 0);
    if (sum > set.script.target_duration_s) {
      warnings.push(
        `SCRIPT beat est_duration_s sum (${sum.toFixed(2)}s) exceeds target_duration_s (${set.script.target_duration_s}s) — warn only pre-VO; will hard-fail post-transcript binding`,
      );
    }
  }

  return { ok: errors.length === 0, warnings, errors };
}
