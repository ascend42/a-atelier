import { describe, it, expect } from "vitest";
import {
  validateDocument,
  validateLayer,
  validateDelta,
  parseAtelier,
  serializeAtelier,
} from "./index.js";

const MINIMAL_DOC = {
  version: "1.0",
  name: "test-animation",
  canvas: { width: 1080, height: 1080, fps: 30 },
  layers: [],
  states: {},
};

const FULL_DOC = {
  version: "1.0",
  name: "fade-in-title",
  description: "A title that fades in with a bounce",
  tags: ["title", "intro"],
  canvas: { width: 1920, height: 1080, fps: 60, background: "#000000" },
  layers: [
    {
      id: "bg",
      description: "Dark background",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: "#1a1a2e" },
      },
      frame: { x: 0, y: 0 },
      bounds: { width: 1920, height: 1080 },
    },
    {
      id: "title",
      description: "Main title text",
      tags: ["text", "animated"],
      visual: {
        type: "text",
        content: "Hello Atelier",
        style: {
          fontFamily: "Inter",
          fontSize: 72,
          fontWeight: "bold",
          textAlign: "center",
          color: "#FFFFFF",
        },
      },
      frame: { x: "50%", y: "50%" },
      bounds: { width: 800, height: 100 },
      anchorPoint: { x: 0.5, y: 0.5 },
      opacity: 0,
    },
  ],
  states: {
    intro: {
      description: "Title fades in and bounces",
      duration: 60,
      deltas: [
        {
          layer: "title",
          property: "opacity",
          range: [0, 30],
          from: 0,
          to: 1,
          easing: "ease-out",
          description: "Fade in the title",
        },
        {
          layer: "title",
          property: "scale.x",
          range: [0, 45],
          from: 0.8,
          to: 1,
          easing: { type: "spring", stiffness: 200, damping: 12 },
        },
        {
          layer: "title",
          property: "scale.y",
          range: [0, 45],
          from: 0.8,
          to: 1,
          easing: { type: "spring", stiffness: 200, damping: 12 },
        },
      ],
    },
  },
};

describe("validateDocument", () => {
  it("accepts minimal valid document", () => {
    const result = validateDocument(MINIMAL_DOC);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("test-animation");
      expect(result.data.canvas.fps).toBe(30);
    }
  });

  it("accepts full document with layers, states, deltas", () => {
    const result = validateDocument(FULL_DOC);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layers).toHaveLength(2);
      expect(result.data.states.intro.deltas).toHaveLength(3);
    }
  });

  it("rejects document missing name", () => {
    const result = validateDocument({ ...MINIMAL_DOC, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some(e => e.message.includes("name"))).toBe(true);
    }
  });

  it("rejects document with invalid canvas", () => {
    const result = validateDocument({ ...MINIMAL_DOC, canvas: { width: -1, height: 100, fps: 30 } });
    expect(result.success).toBe(false);
  });

  it("rejects completely invalid input", () => {
    const result = validateDocument("not an object");
    expect(result.success).toBe(false);
  });
});

describe("validateLayer", () => {
  it("accepts valid shape layer", () => {
    const result = validateLayer({
      id: "rect-1",
      visual: { type: "shape", shape: { type: "rect", cornerRadius: 8 } },
      frame: { x: 0, y: 0 },
      bounds: { width: 100, height: 100 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts layer with percentage units", () => {
    const result = validateLayer({
      id: "centered",
      visual: { type: "group" },
      frame: { x: "50%", y: "50%" },
      bounds: { width: "100%", height: "100%" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects layer without id", () => {
    const result = validateLayer({
      visual: { type: "group" },
      frame: { x: 0, y: 0 },
      bounds: { width: 100, height: 100 },
    });
    expect(result.success).toBe(false);
  });
});

describe("validateDelta", () => {
  it("accepts valid delta", () => {
    const result = validateDelta({
      layer: "title",
      property: "opacity",
      range: [0, 30],
      from: 0,
      to: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects delta with invalid property", () => {
    const result = validateDelta({
      layer: "title",
      property: "not-a-real-property",
      range: [0, 30],
      from: 0,
      to: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects delta with reversed frame range", () => {
    const result = validateDelta({
      layer: "title",
      property: "opacity",
      range: [30, 0],
      from: 0,
      to: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("YAML parsing", () => {
  const YAML_DOC = `
version: "1.0"
name: yaml-test
canvas:
  width: 1080
  height: 1080
  fps: 30
layers:
  - id: bg
    visual:
      type: shape
      shape:
        type: rect
      fill:
        type: solid
        color: "#000000"
    frame: { x: 0, y: 0 }
    bounds: { width: 1080, height: 1080 }
states:
  idle:
    duration: 30
    deltas: []
`;

  it("parses valid YAML into validated document", () => {
    const result = parseAtelier(YAML_DOC);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("yaml-test");
      expect(result.data.layers[0].id).toBe("bg");
    }
  });

  it("rejects invalid YAML syntax", () => {
    const result = parseAtelier("{{{{not yaml");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].path).toBe("(yaml)");
    }
  });

  it("rejects valid YAML that doesn't match schema", () => {
    const result = parseAtelier("name: missing-everything");
    expect(result.success).toBe(false);
  });

  it("roundtrips through serialize and parse", () => {
    const original = validateDocument(FULL_DOC);
    expect(original.success).toBe(true);
    if (!original.success) return;

    const yaml = serializeAtelier(original.data);
    const reparsed = parseAtelier(yaml);
    expect(reparsed.success).toBe(true);
    if (reparsed.success) {
      expect(reparsed.data.name).toBe(FULL_DOC.name);
      expect(reparsed.data.layers).toHaveLength(FULL_DOC.layers.length);
      expect(reparsed.data.states.intro.deltas).toHaveLength(FULL_DOC.states.intro.deltas.length);
    }
  });
});
