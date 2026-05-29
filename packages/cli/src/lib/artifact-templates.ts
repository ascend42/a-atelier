/**
 * Canonical empty templates for the three front-of-pipeline artifacts —
 * DESIGN.md / SCRIPT.md / STORYBOARD.md (spec §3 / §4 / §5).
 *
 * `atelier artifacts scaffold <project-dir>` writes these strings verbatim
 * into a creator's Project directory as the starting point for authoring.
 *
 * INVARIANT (`artifact-templates-self-validate`): the templates here MUST
 * parse cleanly via `parseDesign` / `parseScript` / `parseStoryboard` AND
 * `validateArtifactSet` over the triple must return `ok: true` (warnings
 * permitted, errors forbidden). The schema package enforces several
 * non-empty mins (voice.descriptors >= 3, palette/typography/logos/hook/cta
 * non-empty, storyboard.beats non-empty, mood non-empty, window.end_s >
 * start_s) so the "placeholder" fields here are populated with sensible
 * defaults the creator is expected to overwrite — not empty arrays.
 *
 * Cross-artifact contract: SCRIPT ships with a `hook-1` and `cta-1` beat
 * (the two non-optional narrated blocks); STORYBOARD ships matching
 * `## hook-1` and `## cta-1` beats so a freshly-scaffolded triple
 * cross-validates clean out of the box.
 *
 * Templates are TS string constants (not external .md files) so they ship
 * with the consuming code, tree-shake, and are version-locked to the
 * schemas they target.
 */

/**
 * DESIGN.md — the brand register. Authored by Quill.
 *
 * Placeholders use real-looking values (e.g. `paper`/`ink`/`accent` palette
 * tokens, the same names the recipe schema would issue) rather than empty
 * arrays, so the file parses on first save. Markdown comments and `TODO:`
 * markers point the creator at the fields they're expected to revisit.
 */
export const DESIGN_TEMPLATE = `---
# DESIGN.md — brand register for this Project.
# Authored by Quill. Replace the TODO values with the real ones, then run
# \`atelier artifacts validate <project-dir>\` to check the result.

audience:
  # TODO: who is this for? Be specific — a single sentence's worth of person.
  primary: TODO describe primary audience
  # TODO: optional second-order audience (lurkers, decision-makers, etc.)
  # secondary: TODO secondary audience
  # TODO: where this ships. Closed-ish list; common values: linkedin, x, instagram, youtube-shorts, tiktok.
  platform: [TODO-platform]

voice:
  # TODO: 3 to 5 voice descriptors. Examples: dry, precise, mischievous, warm, clinical, contrarian.
  descriptors: [TODO-descriptor-1, TODO-descriptor-2, TODO-descriptor-3]
  # TODO: optional reference voices (writers, speakers, channels). Anchors the tone.
  # references: [TODO reference]

visual_register:
  palette:
    # TODO: replace these defaults with your real brand tokens.
    # Roles are closed: background | surface | primary | accent | text-on-dark | text-on-light.
    # Hex must be #RGB / #RRGGBB / #RRGGBBAA.
    - { token: paper,  hex: "#F4EFE6", role: background }
    - { token: ink,    hex: "#1A1A1A", role: text-on-light }
    - { token: accent, hex: "#C9533C", role: accent }
  typography:
    # TODO: real font tokens. Usage is closed: display | body | caption | mono.
    - { token: display, family: "TODO-display-family", weights: [400, 700], usage: display }
    - { token: body,    family: "TODO-body-family",    weights: [400, 500], usage: body }
  motion_register:
    # tempo:        snappy | steady | calm | languid
    # easing_bias:  linear | ease-out | spring
    # camera_bias:  static | drift | snap   (optional)
    tempo: steady
    easing_bias: ease-out
    camera_bias: static

constraints:
  # TODO: optional max duration in seconds (omit if no hard cap).
  # max_duration_seconds: 75
  # TODO: closed aspect-ratio set: 9:16 | 1:1 | 16:9 | 4:5.
  aspect_ratios: ["9:16"]
  # TODO: prose rules Iris must honor at composition time. Free-text strings.
  do_not:
    - TODO add a do-not rule

brand_references:
  logos:
    # TODO: at least one logo token. Role is closed: primary | mark | wordmark.
    - { token: mark-primary, role: mark }
  # TODO: optional social handles.
  # handles:
  #   - { platform: x, value: "@your-handle" }
  # TODO: optional page-number convention used in carousel exports.
  # page_number_convention: "n / N, bottom-right, body font, 60% opacity"

# variances:  # only populate when this Project diverges from an attached recipe.
#   - { field: visual_register.palette.accent, value: "#FF0000", reason: "campaign override" }
---

# Voice notes

<!--
  Free-form prose. Quill's notes on rhythm, signature phrases, taboos.
  This body is preserved verbatim — Iris does not parse it; it's for humans
  and for the next pass of Quill.
-->

> TODO: a paragraph or two on how the voice should *feel*. Punchy openings?
> One idea per beat? Reserve the accent color for the most important word?
`;

/**
 * SCRIPT.md — the narrative. Authored by Quill, refined by Lux.
 *
 * Default mode is `narrated` (the four-block hook/story/proof/cta lineage
 * from Hyperframes) per the task spec. We ship one beat in every block so
 * the file parses on first save and a creator can see the shape; the hook
 * and cta blocks are schema-required to be non-empty, while story and proof
 * are technically optional but populated with TODO beats for completeness.
 *
 * `tts_voice` is intentionally omitted (it's optional and must be a valid
 * slot ref like \`voice.host.primary\` if present — leave the choice to the
 * creator).
 */
export const SCRIPT_TEMPLATE = `---
# SCRIPT.md — narrative for this Project.
# Authored by Quill, refined by Lux. Replace TODO copy with the real line.
# Beat ids are kebab-case and must match the STORYBOARD beat ids.

mode: narrated            # narrated | carousel | text-only
target_duration_s: 60     # creator intent; transcript binding can rebind beat windows post-VO
language: en-US
# tts_voice: voice.host.primary   # optional slot ref; resolved at TTS time
---

# Hook
# At least one beat. The hook earns the rest of the watch.
- id: hook-1
  copy: "TODO: contrarian opener — one sentence that earns the next beat."
  intent: "TODO why this opener works (one sentence)."
  est_duration_s: 3.0
  bind_to_transcript: true

# Story
# Optional block; remove if not used. Establish receipts.
- id: story-1
  copy: "TODO: who you are / why this is credible — one sentence."
  intent: "TODO establish receipts; promise specificity."
  est_duration_s: 3.0
  bind_to_transcript: true

# Proof
# Optional block; remove if not used. Concrete claims.
- id: proof-1
  copy: "TODO: the most defensible claim, stated plainly."
  intent: "TODO lead with what you can defend hardest."
  est_duration_s: 3.0
  bind_to_transcript: true

# CTA
# At least one beat. Single token call-to-action; no verb pileup.
- id: cta-1
  copy: "TODO: link in bio. / one short ask."
  intent: "TODO the single action you want from the viewer."
  est_duration_s: 2.0
  bind_to_transcript: true
`;

/**
 * STORYBOARD.md — the compositional spec, one beat per SCRIPT beat (plus
 * any storyboard-only \`b-roll.*\` beats). Authored by Lux. Direct input to
 * Iris.
 *
 * Cross-artifact invariant: every \`## <id>\` here must match a SCRIPT beat
 * id (or be prefixed \`b-roll.\`). We ship matching \`hook-1\` and \`cta-1\`
 * beats so a freshly-scaffolded triple cross-validates clean. Story and
 * proof beats are commented-out — the creator un-comments after Quill
 * writes the matching SCRIPT beats.
 *
 * Slot references use the typed \`<kind>.<category>.<specifier>\` form (per
 * TD-2026-05-26-229). Techniques are drawn from \`TECHNIQUE_LIBRARY_V1\`
 * so the file validates against the current shipped library.
 */
export const STORYBOARD_TEMPLATE = `---
# STORYBOARD.md — composition beats for this Project.
# Authored by Lux. One beat per SCRIPT beat (plus optional b-roll.* beats).
# Iris walks this file beat by beat to mutate the live AtelierDocument.

technique_library_version: 1     # bump on additive technique-library changes
aspect_ratio: "9:16"             # closed: 9:16 | 1:1 | 16:9 | 4:5
---

## hook-1
# TODO: matches SCRIPT beat \`hook-1\`. Tune mood / camera / slots to match the line.
window: { start_s: 0.0, end_s: 3.0 }
mood: [clinical]                 # adjectives; closed-ish vocab — tense, warm, clinical, mischievous, ...
camera: { kind: static }         # kind: static | drift | push | pull | whip
slots:
  # Typed slot refs: <kind>.<category>.<specifier>.
  # Kind is closed (image | video | audio | text | font | voice | logo).
  # \`text.super.from-script\` pulls copy from the matching SCRIPT beat.
  - text.super.from-script
techniques:
  # Must exist in the active technique library (technique_library_version).
  # v1 set: text.split-reveal, image.ken-burns.slow, super.weight-pulse-on-keyword, background.color-shift-to-token.
  - text.split-reveal
transition_out: { kind: cut }    # kind: cut | dip-to-color | whip | crossfade
# sfx:
#   - { slot: audio.sfx.transition.whoosh, gain_db: -6 }

## cta-1
# TODO: matches SCRIPT beat \`cta-1\`. Final beat — keep it clean.
window: { start_s: 3.0, end_s: 5.0 }
mood: [grounded]
camera: { kind: static }
slots:
  - text.super.from-script
techniques:
  - text.split-reveal
transition_out: { kind: cut }

# TODO: add \`## story-1\`, \`## proof-1\`, etc. once Quill writes the matching SCRIPT beats.
# Storyboard-only b-roll beats are also allowed; prefix the id with \`b-roll.\`:
#
# ## b-roll.intro-monitor
# window: { start_s: 1.0, end_s: 2.0 }
# mood: [clinical]
# camera: { kind: drift }
# slots:
#   - image.b-roll.code-monitor
# techniques:
#   - image.ken-burns.slow
# transition_out: { kind: crossfade, duration_s: 0.2 }
`;

/**
 * Template registry, keyed by the slot name used by the CLI / `--only`
 * flag. Files written to disk as `<NAME>.md` (DESIGN.md / SCRIPT.md /
 * STORYBOARD.md per sibling-of-`project.atelier` convention).
 */
export const ARTIFACT_TEMPLATES = {
  design: { filename: "DESIGN.md", content: DESIGN_TEMPLATE },
  script: { filename: "SCRIPT.md", content: SCRIPT_TEMPLATE },
  storyboard: { filename: "STORYBOARD.md", content: STORYBOARD_TEMPLATE },
} as const;

export type ArtifactSlot = keyof typeof ARTIFACT_TEMPLATES;

/** All artifact slot names, in canonical write order. */
export const ARTIFACT_SLOTS: readonly ArtifactSlot[] = ["design", "script", "storyboard"];
