import { describe, it, expect } from "vitest";
import { createDocument } from "@a-company/atelier-core";
import { withTemplateDefaults } from "./template-defaults.js";

function templateDoc() {
  return createDocument("Template", { width: 100, height: 100, fps: 30 })
    .variable("title", { type: "string", default: "Hello" })
    .variable("brandColor", { type: "color", default: "#C75B39" })
    .addLayer({
      id: "title",
      visual: {
        type: "text",
        content: "{{title}}",
        style: { fontFamily: "sans-serif", fontSize: 12, color: "{{brandColor}}" },
      },
      frame: { x: 0, y: 0 },
      bounds: { width: 100, height: 20 },
    })
    .addState("intro", { duration: 10 })
    .build();
}

describe("withTemplateDefaults", () => {
  it("binds {{var}} placeholders to declared defaults", () => {
    const out = withTemplateDefaults(templateDoc());
    const visual = out.layers[0].visual as { content: string; style: { color: string } };
    expect(visual.content).toBe("Hello");
    expect(visual.style.color).toBe("#C75B39");
  });

  it("follows a changed default", () => {
    const doc = templateDoc();
    doc.variables!.brandColor.default = "#4A7C91";
    const visual = withTemplateDefaults(doc).layers[0].visual as { style: { color: string } };
    expect(visual.style.color).toBe("#4A7C91");
  });

  it("leaves the source document untouched", () => {
    const doc = templateDoc();
    withTemplateDefaults(doc);
    expect((doc.layers[0].visual as { content: string }).content).toBe("{{title}}");
    expect(doc.variables).toBeDefined();
  });

  it("returns docs without variables unchanged", () => {
    const doc = createDocument("Plain", { width: 10, height: 10, fps: 30 })
      .addState("s", { duration: 1 })
      .build();
    expect(withTemplateDefaults(doc)).toBe(doc);
  });

  it("returns the source doc when a variable has no default", () => {
    const doc = templateDoc();
    delete doc.variables!.title.default;
    expect(withTemplateDefaults(doc)).toBe(doc);
  });
});
