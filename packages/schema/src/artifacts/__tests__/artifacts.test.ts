import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseDesign,
  parseScript,
  parseStoryboard,
  serializeDesign,
  serializeScript,
  serializeStoryboard,
} from "../parse.js";
import { SlotRefSchema, parseSlotRef, SLOT_KINDS } from "../slot.js";
import { validateArtifactSet } from "../validate.js";
import { StoryboardArtifactSchema, type StoryboardArtifact } from "../storyboard.js";
import { ScriptArtifactSchema, type ScriptArtifact } from "../script.js";
import { DesignArtifactSchema, type DesignArtifact } from "../design.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "..", "__fixtures__");

const designMd = readFileSync(join(FIXTURES, "DESIGN.md"), "utf8");
const scriptMd = readFileSync(join(FIXTURES, "SCRIPT.md"), "utf8");
const storyboardMd = readFileSync(join(FIXTURES, "STORYBOARD.md"), "utf8");

describe("DESIGN — parse + round-trip", () => {
  it("parses the fixture", () => {
    const design = parseDesign(designMd);
    expect(design.audience.primary).toBe("Senior product engineers");
    expect(design.audience.platform).toEqual(["linkedin", "x"]);
    expect(design.voice.descriptors).toHaveLength(3);
    expect(design.visual_register.palette).toHaveLength(3);
    expect(design.visual_register.palette[2].token).toBe("ember");
    expect(design.visual_register.motion_register.tempo).toBe("steady");
    expect(design.constraints.aspect_ratios).toContain("9:16");
    expect(design.brand_references.logos[0].role).toBe("mark");
    expect(design.body).toContain("Voice notes");
  });

  it("round-trip parse → serialize → parse is structurally stable", () => {
    const a = parseDesign(designMd);
    const serialized = serializeDesign(a);
    const b = parseDesign(serialized);
    expect(b).toEqual(a);
  });

  it("rejects an unknown palette role", () => {
    const bad = designMd.replace("role: background", "role: chartreuse");
    expect(() => parseDesign(bad)).toThrow();
  });

  it("rejects an unknown typography usage", () => {
    const bad = designMd.replace("usage: display", "usage: subtitle");
    expect(() => parseDesign(bad)).toThrow();
  });

  it("rejects a malformed hex color", () => {
    const bad = designMd.replace('"#F4EFE6"', '"not-a-color"');
    expect(() => parseDesign(bad)).toThrow();
  });

  it("rejects unknown frontmatter keys (.strict())", () => {
    const bad = designMd.replace(
      "audience:",
      "extra_field: true\naudience:",
    );
    expect(() => parseDesign(bad)).toThrow();
  });
});

describe("SCRIPT — parse + round-trip", () => {
  it("parses the narrated fixture", () => {
    const script = parseScript(scriptMd);
    expect(script.mode).toBe("narrated");
    expect(script.target_duration_s).toBe(60);
    expect(script.language).toBe("en-US");
    expect(script.tts_voice).toBe("voice.host.primary");
    if (script.mode !== "narrated") throw new Error("expected narrated");
    expect(script.blocks.hook).toHaveLength(1);
    expect(script.blocks.story).toHaveLength(2);
    expect(script.blocks.proof).toHaveLength(3);
    expect(script.blocks.cta).toHaveLength(1);
    expect(script.blocks.hook[0].id).toBe("hook-1");
    expect(script.blocks.hook[0].bind_to_transcript).toBe(true);
  });

  it("round-trip parse → serialize → parse is structurally stable", () => {
    const a = parseScript(scriptMd);
    const serialized = serializeScript(a);
    const b = parseScript(serialized);
    expect(b).toEqual(a);
  });

  it("rejects a missing top-level mode", () => {
    const bad = scriptMd.replace("mode: narrated\n", "");
    expect(() => parseScript(bad)).toThrow();
  });

  it("rejects an unknown mode", () => {
    const bad = scriptMd.replace("mode: narrated", "mode: epic-poem");
    expect(() => parseScript(bad)).toThrow();
  });

  it("rejects an invalid tts_voice slot reference (wrong kind)", () => {
    const bad = scriptMd.replace("voice.host.primary", "person.host.primary");
    expect(() => parseScript(bad)).toThrow();
  });

  it("parses a carousel-mode script with flat beats list", () => {
    const carouselMd = `---
mode: carousel
target_duration_s: 30
language: en-US
---

- id: slide-1
  copy: "Slide one body."
  intent: "Open the carousel."
  est_duration_s: 5
- id: slide-2
  copy: "Slide two body."
  intent: "Continue."
  est_duration_s: 5
`;
    const script = parseScript(carouselMd);
    expect(script.mode).toBe("carousel");
    if (script.mode === "carousel") {
      expect(script.beats).toHaveLength(2);
      expect(script.beats[0].id).toBe("slide-1");
    }
    // Round-trip
    const serialized = serializeScript(script);
    const reparsed = parseScript(serialized);
    expect(reparsed).toEqual(script);
  });

  it("round-trips when bind_to_transcript is omitted (default true applied)", () => {
    const minimal = `---
mode: narrated
target_duration_s: 30
language: en-US
---

# Hook
- id: hook-1
  copy: "x"
  intent: "y"
  est_duration_s: 2

# Story
- id: story-1
  copy: "x"
  intent: "y"
  est_duration_s: 3

# Proof
- id: proof-1
  copy: "x"
  intent: "y"
  est_duration_s: 3

# CTA
- id: cta-1
  copy: "x"
  intent: "y"
  est_duration_s: 1.5
`;
    const a = parseScript(minimal);
    if (a.mode !== "narrated") throw new Error("expected narrated");
    // Default applied at parse time:
    expect(a.blocks.hook[0].bind_to_transcript).toBe(true);
    // Round-trip: re-parse should match (default re-applied).
    const serialized = serializeScript(a);
    const b = parseScript(serialized);
    expect(b).toEqual(a);
  });

  it("parses a text-only script", () => {
    const textOnlyMd = `---
mode: text-only
target_duration_s: 10
language: en-US
---

- id: t-1
  copy: "Plain text card."
  intent: "Demonstrate text-only mode."
  est_duration_s: 4
`;
    const script = parseScript(textOnlyMd);
    expect(script.mode).toBe("text-only");
  });
});

describe("STORYBOARD — parse + round-trip", () => {
  it("parses the fixture", () => {
    const story = parseStoryboard(storyboardMd);
    expect(story.technique_library_version).toBe(1);
    expect(story.aspect_ratio).toBe("9:16");
    expect(story.beats).toHaveLength(3);
    const hook = story.beats[0];
    expect(hook.id).toBe("hook-1");
    expect(hook.window.start_s).toBe(0);
    expect(hook.window.end_s).toBe(2.8);
    expect(hook.mood).toEqual(["clinical", "dry"]);
    expect(hook.camera.kind).toBe("static");
    expect(hook.slots).toContain("image.b-roll.code-monitor");
    expect(hook.techniques).toContain("text.split-reveal");
    expect(hook.transition_out.kind).toBe("whip");
    expect(hook.sfx?.[0].slot).toBe("audio.sfx.transition.whoosh");
    expect(hook.sfx?.[0].gain_db).toBe(-6);
  });

  it("round-trip parse → serialize → parse is structurally stable", () => {
    const a = parseStoryboard(storyboardMd);
    const serialized = serializeStoryboard(a);
    const b = parseStoryboard(serialized);
    expect(b).toEqual(a);
  });

  it("rejects a window where end_s <= start_s", () => {
    const bad = storyboardMd.replace(
      "{ start_s: 0.0, end_s: 2.8 }",
      "{ start_s: 5.0, end_s: 2.0 }",
    );
    expect(() => parseStoryboard(bad)).toThrow();
  });

  it("rejects an unknown camera kind", () => {
    const bad = storyboardMd.replace("{ kind: static }", "{ kind: zoom }");
    expect(() => parseStoryboard(bad)).toThrow();
  });

  it("rejects an unknown aspect ratio", () => {
    const bad = storyboardMd.replace('aspect_ratio: "9:16"', 'aspect_ratio: "21:9"');
    expect(() => parseStoryboard(bad)).toThrow();
  });
});

describe("Slot reference validation", () => {
  it("accepts known-good three-segment refs", () => {
    expect(SlotRefSchema.safeParse("image.b-roll.tech").success).toBe(true);
    expect(SlotRefSchema.safeParse("image.logo.primary").success).toBe(true);
    expect(SlotRefSchema.safeParse("text.super.from-script").success).toBe(true);
    expect(SlotRefSchema.safeParse("voice.host.primary").success).toBe(true);
  });

  it("accepts a four-segment ref (specifier may contain dots)", () => {
    // Matches the artifact spec's own STORYBOARD EXAMPLE.
    const result = SlotRefSchema.safeParse("audio.sfx.transition.whoosh");
    expect(result.success).toBe(true);
    const parsed = parseSlotRef("audio.sfx.transition.whoosh");
    expect(parsed).toEqual({ kind: "audio", category: "sfx", specifier: "transition.whoosh" });
  });

  it("rejects an unknown kind segment", () => {
    const result = SlotRefSchema.safeParse("widget.foo.bar");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /unknown kind/i.test(i.message))).toBe(true);
    }
  });

  it("accepts a two-segment ref matching the spec's `font.display` example", () => {
    // The artifact spec's STORYBOARD example uses `font.display` directly.
    expect(SlotRefSchema.safeParse("font.display").success).toBe(true);
    const parsed = parseSlotRef("font.display");
    expect(parsed).toEqual({ kind: "font", category: "display", specifier: "" });
  });

  it("rejects refs with fewer than two segments", () => {
    expect(SlotRefSchema.safeParse("image").success).toBe(false);
    expect(SlotRefSchema.safeParse("").success).toBe(false);
  });

  it("rejects refs with empty segments", () => {
    expect(SlotRefSchema.safeParse("image..foo").success).toBe(false);
    expect(SlotRefSchema.safeParse("image.foo.").success).toBe(false);
    expect(SlotRefSchema.safeParse(".image.foo").success).toBe(false);
  });

  it("SLOT_KINDS covers exactly the closed set from the spec", () => {
    expect(new Set(SLOT_KINDS)).toEqual(
      new Set(["image", "video", "audio", "text", "font", "voice", "logo"]),
    );
  });
});

describe("Cross-artifact validator", () => {
  const design = parseDesign(designMd);
  const script = parseScript(scriptMd);
  const storyboard = parseStoryboard(storyboardMd);

  it("accepts a matched set with valid slots, techniques, and durations", () => {
    const result = validateArtifactSet({ design, script, storyboard });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    // The fixture's beat durations sum to 21.4s; target is 60s.
    expect(result.warnings).toEqual([]);
  });

  it("errors when a STORYBOARD beat id does not exist in SCRIPT", () => {
    const bogus: StoryboardArtifact = {
      ...storyboard,
      beats: [
        ...storyboard.beats,
        {
          ...storyboard.beats[0],
          id: "ghost-beat",
        },
      ],
    };
    const result = validateArtifactSet({ script, storyboard: bogus });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /ghost-beat/.test(e))).toBe(true);
  });

  it("exempts b-roll.* prefixed storyboard ids from script-match requirement", () => {
    const withBRoll: StoryboardArtifact = {
      ...storyboard,
      beats: [
        ...storyboard.beats,
        {
          ...storyboard.beats[0],
          id: "b-roll.intro-cards",
        },
      ],
    };
    const result = validateArtifactSet({ script, storyboard: withBRoll });
    expect(result.ok).toBe(true);
  });

  it("warns (does not error) on duration overrun pre-VO", () => {
    // Build a script whose beat sum overruns target.
    const overrun: ScriptArtifact = {
      mode: "carousel",
      target_duration_s: 5,
      language: "en-US",
      body: "",
      beats: [
        { id: "a", copy: "x", intent: "y", est_duration_s: 4 },
        { id: "b", copy: "x", intent: "y", est_duration_s: 4 },
      ],
    };
    const result = validateArtifactSet({ script: overrun });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/exceeds target_duration_s/);
  });

  it("errors on an unknown technique against the active library", () => {
    const story: StoryboardArtifact = StoryboardArtifactSchema.parse({
      technique_library_version: 1,
      aspect_ratio: "9:16",
      beats: [
        {
          id: "hook-1",
          window: { start_s: 0, end_s: 2 },
          mood: ["dry"],
          camera: { kind: "static" },
          slots: ["text.super.from-script"],
          techniques: ["text.split-reveal", "made.up.technique"],
          transition_out: { kind: "cut" },
        },
      ],
    });
    const result = validateArtifactSet({ script, storyboard: story });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /made.up.technique/.test(e))).toBe(true);
  });

  it("errors on an unknown technique_library_version", () => {
    const story: StoryboardArtifact = {
      ...storyboard,
      technique_library_version: 999,
    };
    const result = validateArtifactSet({ storyboard: story });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /unknown technique_library_version 999/.test(e))).toBe(true);
  });

  it("accepts an empty set (no artifacts present)", () => {
    const result = validateArtifactSet({});
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns a structured result and does not throw on any input", () => {
    expect(() => validateArtifactSet({})).not.toThrow();
    expect(() => validateArtifactSet({ design })).not.toThrow();
    // Even with self-inconsistent script (mode missing beats) we never throw
    // here because the inputs are typed — the schemas guarded the caller.
  });
});

describe("Schemas — coverage smoke tests", () => {
  it("DesignArtifactSchema parses the fixture's frontmatter+body shape directly", () => {
    const design = parseDesign(designMd);
    const validated: DesignArtifact = DesignArtifactSchema.parse(design);
    expect(validated).toEqual(design);
  });

  it("ScriptArtifactSchema discriminates correctly across modes", () => {
    const script = parseScript(scriptMd);
    const validated: ScriptArtifact = ScriptArtifactSchema.parse(script);
    expect(validated.mode).toBe("narrated");
  });

  it("rejects 2-descriptor voice (min 3)", () => {
    const bad = designMd.replace(
      "descriptors: [dry, precise, lightly self-deprecating]",
      "descriptors: [dry, precise]",
    );
    expect(() => parseDesign(bad)).toThrow();
  });

  it("rejects 6-descriptor voice (max 5)", () => {
    const bad = designMd.replace(
      "descriptors: [dry, precise, lightly self-deprecating]",
      "descriptors: [a, b, c, d, e, f]",
    );
    expect(() => parseDesign(bad)).toThrow();
  });
});
