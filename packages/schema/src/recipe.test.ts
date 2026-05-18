import { describe, it, expect } from "vitest";
import { validateRecipe } from "./validate.js";
import { OverlayPageNumberRuleSchema, OverlayHandleRuleSchema } from "./recipe.js";

const base = { version: "1.0", name: "test-recipe" };

describe("overlay_rules — handle sub-block", () => {
  it("accepts a valid handle-only overlay_rules", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        handle: {
          text: "@matt",
          anchor: "bottom-left",
          margin: 24,
          style: {
            font_family: "Inter",
            font_size: 36,
            font_weight: "bold",
            color: "#FFFFFF",
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overlay_rules?.handle?.text).toBe("@matt");
      expect(result.data.overlay_rules?.handle?.anchor).toBe("bottom-left");
    }
  });

  it("rejects a handle rule with an invalid anchor", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        handle: { text: "@matt", anchor: "middle-center" },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => /anchor/.test(e.path))).toBe(true);
    }
  });

  it("rejects an empty handle text", () => {
    const parsed = OverlayHandleRuleSchema.safeParse({
      text: "",
      anchor: "top-left",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative margin", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        handle: { text: "@x", anchor: "top-left", margin: -5 },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("overlay_rules — page_number sub-block", () => {
  it("accepts a valid page_number-only overlay_rules", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        page_number: {
          format: "{current}/{total}",
          anchor: "top-right",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts the zero-pad form {current:02d}/{total:02d}", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        page_number: { format: "{current:02d}/{total:02d}", anchor: "top-right" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a format with only {current}", () => {
    const parsed = OverlayPageNumberRuleSchema.safeParse({
      format: "Page {current}",
      anchor: "bottom-right",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a format missing both {current} and {total}", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        page_number: { format: "Page", anchor: "top-right" },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => /at least one/i.test(e.message))).toBe(true);
    }
  });

  it("rejects a format with unbalanced braces", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        page_number: { format: "{current/{total}", anchor: "top-right" },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => /unbalanced/i.test(e.message))).toBe(true);
    }
  });

  it("rejects a format with an unknown placeholder", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        page_number: { format: "{foo}/{total}", anchor: "top-right" },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => /placeholder/i.test(e.message))).toBe(true);
    }
  });

  it("rejects an empty format string", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        page_number: { format: "", anchor: "top-right" },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("overlay_rules — both sub-blocks", () => {
  it("accepts handle + page_number together", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        handle: { text: "@matt", anchor: "bottom-left" },
        page_number: { format: "{current}/{total}", anchor: "top-right" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty overlay_rules object", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {},
    });
    expect(result.success).toBe(true);
  });
});

describe("overlay_rules — promotion to Phase 1.5", () => {
  it("does NOT warn about overlay_rules being reserved", () => {
    const result = validateRecipe({
      ...base,
      overlay_rules: {
        handle: { text: "@matt", anchor: "bottom-left" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const warnings = (result as { warnings?: string[] }).warnings ?? [];
      expect(warnings.some((w) => /overlay_rules/.test(w))).toBe(false);
    }
  });

  it("still warns about other reserved Phase 3 fields", () => {
    const result = validateRecipe({
      ...base,
      palette: { primary: "#FF0000" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const warnings = (result as { warnings?: string[] }).warnings ?? [];
      expect(warnings.some((w) => /palette/.test(w))).toBe(true);
    }
  });
});
