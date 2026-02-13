import { describe, it, expect } from "vitest";
import type { AtelierDocument, Delta } from "@atelier/types";
import {
  resolveFrame,
  resolveDeltaValue,
  isFrameInRange,
  computeProgress,
  interpolateValue,
  resolveEasing,
  validateNoOverlap,
  validateAllDeltas,
  rangesOverlap,
  createDocument,
  resolveUnit,
  isPercentage,
  expandPreset,
  StateMachine,
  instantiateTemplate,
  findTemplateVariables,
} from "./index.js";

// ─── Delta Resolver ─────────────────────────────────────────

describe("delta resolver", () => {
  it("isFrameInRange checks inclusive bounds", () => {
    expect(isFrameInRange(0, [0, 30])).toBe(true);
    expect(isFrameInRange(15, [0, 30])).toBe(true);
    expect(isFrameInRange(30, [0, 30])).toBe(true);
    expect(isFrameInRange(31, [0, 30])).toBe(false);
    expect(isFrameInRange(-1, [0, 30])).toBe(false);
  });

  it("computeProgress returns 0-1", () => {
    expect(computeProgress(0, [0, 30])).toBe(0);
    expect(computeProgress(15, [0, 30])).toBe(0.5);
    expect(computeProgress(30, [0, 30])).toBe(1);
  });

  it("computeProgress handles single-frame range", () => {
    expect(computeProgress(10, [10, 10])).toBe(1);
  });

  it("interpolateValue lerps numbers", () => {
    expect(interpolateValue(0, 100, 0.5)).toBe(50);
    expect(interpolateValue(0, 1, 0)).toBe(0);
    expect(interpolateValue(0, 1, 1)).toBe(1);
  });

  it("resolveDeltaValue returns undefined outside range", () => {
    const delta: Delta = {
      layer: "test",
      property: "opacity",
      range: [10, 20],
      from: 0,
      to: 1,
    };
    expect(resolveDeltaValue(delta, 5)).toBeUndefined();
    expect(resolveDeltaValue(delta, 25)).toBeUndefined();
  });

  it("resolveDeltaValue interpolates within range", () => {
    const delta: Delta = {
      layer: "test",
      property: "opacity",
      range: [0, 10],
      from: 0,
      to: 1,
    };
    expect(resolveDeltaValue(delta, 0)).toBe(0);
    expect(resolveDeltaValue(delta, 5)).toBeCloseTo(0.5);
    expect(resolveDeltaValue(delta, 10)).toBe(1);
  });

  it("resolveDeltaValue applies easing", () => {
    const delta: Delta = {
      layer: "test",
      property: "opacity",
      range: [0, 10],
      from: 0,
      to: 1,
      easing: "ease-in",
    };
    const midValue = resolveDeltaValue(delta, 5) as number;
    // ease-in should be below 0.5 at midpoint
    expect(midValue).toBeLessThan(0.5);
  });
});

// ─── Easing Resolver ────────────────────────────────────────

describe("easing resolver", () => {
  it("resolves undefined to linear", () => {
    const fn = resolveEasing(undefined);
    expect(fn(0.5)).toBe(0.5);
  });

  it("resolves string presets", () => {
    const fn = resolveEasing("ease-in");
    expect(fn(0.5)).toBeLessThan(0.5);
  });

  it("resolves cubic-bezier objects", () => {
    const fn = resolveEasing({ type: "cubic-bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
  });

  it("resolves spring objects", () => {
    const fn = resolveEasing({ type: "spring", stiffness: 200, damping: 15 });
    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(1);
  });

  it("resolves linear objects", () => {
    const fn = resolveEasing({ type: "linear" });
    expect(fn(0.5)).toBe(0.5);
  });

  it("resolves step objects", () => {
    const fn = resolveEasing({ type: "step", steps: 4 });
    expect(fn(0.1)).toBe(0);
    expect(fn(0.3)).toBe(0.25);
  });
});

// ─── Frame Resolver ─────────────────────────────────────────

describe("frame resolver", () => {
  const doc: AtelierDocument = {
    version: "1.0",
    name: "test",
    canvas: { width: 100, height: 100, fps: 30 },
    layers: [
      {
        id: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
        opacity: 0,
      },
    ],
    states: {
      intro: {
        duration: 30,
        deltas: [
          {
            layer: "rect",
            property: "opacity",
            range: [0, 30] as [number, number],
            from: 0,
            to: 1,
          },
          {
            layer: "rect",
            property: "frame.x",
            range: [0, 15] as [number, number],
            from: 0,
            to: 50,
          },
        ],
      },
    },
  };

  it("resolves frame at start", () => {
    const resolved = resolveFrame(doc, "intro", 0);
    expect(resolved.frame).toBe(0);
    expect(resolved.stateName).toBe("intro");
    expect(resolved.layers).toHaveLength(1);
    expect(resolved.layers[0].computedProperties.opacity).toBe(0);
    expect(resolved.layers[0].computedProperties["frame.x"]).toBe(0);
  });

  it("resolves frame at midpoint", () => {
    const resolved = resolveFrame(doc, "intro", 15);
    expect(resolved.layers[0].computedProperties.opacity).toBeCloseTo(0.5);
    expect(resolved.layers[0].computedProperties["frame.x"]).toBeCloseTo(50);
  });

  it("resolves frame at end", () => {
    const resolved = resolveFrame(doc, "intro", 30);
    expect(resolved.layers[0].computedProperties.opacity).toBe(1);
    // frame.x range ends at 15, so at frame 30 it should be undefined (past range)
    expect(resolved.layers[0].computedProperties["frame.x"]).toBeUndefined();
  });

  it("throws for unknown state", () => {
    expect(() => resolveFrame(doc, "nonexistent", 0)).toThrow("not found");
  });

  it("returns empty computedProperties for layers with no deltas", () => {
    const docWithExtra: AtelierDocument = {
      ...doc,
      layers: [
        ...doc.layers,
        {
          id: "static",
          visual: { type: "group" },
          frame: { x: 50, y: 50 },
          bounds: { width: 10, height: 10 },
        },
      ],
    };
    const resolved = resolveFrame(docWithExtra, "intro", 10);
    const staticLayer = resolved.layers.find(l => l.id === "static");
    expect(staticLayer).toBeDefined();
    expect(Object.keys(staticLayer!.computedProperties)).toHaveLength(0);
  });
});

// ─── Overlap Validator ──────────────────────────────────────

describe("overlap validator", () => {
  it("detects overlapping ranges", () => {
    expect(rangesOverlap([0, 10], [5, 15])).toBe(true);
    expect(rangesOverlap([0, 10], [10, 20])).toBe(true);
    expect(rangesOverlap([0, 10], [11, 20])).toBe(false);
  });

  it("validateNoOverlap returns null for no overlap", () => {
    const existing: Delta[] = [
      { layer: "a", property: "opacity", range: [0, 10], from: 0, to: 1 },
    ];
    const newDelta: Delta = {
      layer: "a",
      property: "opacity",
      range: [11, 20],
      from: 1,
      to: 0,
    };
    expect(validateNoOverlap(existing, newDelta)).toBeNull();
  });

  it("validateNoOverlap returns error for overlap", () => {
    const existing: Delta[] = [
      { layer: "a", property: "opacity", range: [0, 10], from: 0, to: 1 },
    ];
    const newDelta: Delta = {
      layer: "a",
      property: "opacity",
      range: [5, 15],
      from: 0.5,
      to: 0,
    };
    const error = validateNoOverlap(existing, newDelta);
    expect(error).not.toBeNull();
    expect(error!.layerId).toBe("a");
    expect(error!.property).toBe("opacity");
  });

  it("allows overlap on different properties", () => {
    const existing: Delta[] = [
      { layer: "a", property: "opacity", range: [0, 10], from: 0, to: 1 },
    ];
    const newDelta: Delta = {
      layer: "a",
      property: "rotation",
      range: [0, 10],
      from: 0,
      to: 360,
    };
    expect(validateNoOverlap(existing, newDelta)).toBeNull();
  });

  it("allows overlap on different layers", () => {
    const existing: Delta[] = [
      { layer: "a", property: "opacity", range: [0, 10], from: 0, to: 1 },
    ];
    const newDelta: Delta = {
      layer: "b",
      property: "opacity",
      range: [0, 10],
      from: 0,
      to: 1,
    };
    expect(validateNoOverlap(existing, newDelta)).toBeNull();
  });

  it("validateAllDeltas finds multiple overlaps", () => {
    const deltas: Delta[] = [
      { layer: "a", property: "opacity", range: [0, 10], from: 0, to: 1 },
      { layer: "a", property: "opacity", range: [5, 15], from: 0.5, to: 0 },
      { layer: "a", property: "opacity", range: [12, 20], from: 0, to: 1 },
    ];
    const errors = validateAllDeltas(deltas);
    // [0-10] overlaps [5-15], [5-15] overlaps [12-20]
    expect(errors).toHaveLength(2);
  });
});

// ─── Builder ────────────────────────────────────────────────

describe("document builder", () => {
  it("builds a minimal document", () => {
    const doc = createDocument("test", { width: 100, height: 100, fps: 30 }).build();
    expect(doc.name).toBe("test");
    expect(doc.version).toBe("1.0");
    expect(doc.canvas.width).toBe(100);
    expect(doc.layers).toEqual([]);
    expect(doc.states).toEqual({});
  });

  it("supports fluent chaining", () => {
    const doc = createDocument("animated", { width: 1080, height: 1080, fps: 60 })
      .description("A test animation")
      .tags("test", "demo")
      .addLayer({
        id: "bg",
        visual: { type: "shape", shape: { type: "rect" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1080 },
      })
      .addState("intro", { duration: 60 })
      .addDelta("intro", {
        layer: "bg",
        property: "opacity",
        range: [0, 30],
        from: 0,
        to: 1,
      })
      .build();

    expect(doc.description).toBe("A test animation");
    expect(doc.tags).toEqual(["test", "demo"]);
    expect(doc.layers).toHaveLength(1);
    expect(doc.states.intro.deltas).toHaveLength(1);
  });

  it("rejects duplicate layer IDs", () => {
    expect(() => {
      createDocument("test", { width: 100, height: 100, fps: 30 })
        .addLayer({ id: "a", visual: { type: "group" }, frame: { x: 0, y: 0 }, bounds: { width: 10, height: 10 } })
        .addLayer({ id: "a", visual: { type: "group" }, frame: { x: 0, y: 0 }, bounds: { width: 10, height: 10 } });
    }).toThrow("already exists");
  });

  it("rejects deltas referencing nonexistent layers", () => {
    expect(() => {
      createDocument("test", { width: 100, height: 100, fps: 30 })
        .addState("intro", { duration: 30 })
        .addDelta("intro", {
          layer: "missing",
          property: "opacity",
          range: [0, 10],
          from: 0,
          to: 1,
        });
    }).toThrow("not found");
  });

  it("rejects overlapping deltas", () => {
    expect(() => {
      createDocument("test", { width: 100, height: 100, fps: 30 })
        .addLayer({ id: "a", visual: { type: "group" }, frame: { x: 0, y: 0 }, bounds: { width: 10, height: 10 } })
        .addState("intro", { duration: 30 })
        .addDelta("intro", { layer: "a", property: "opacity", range: [0, 15], from: 0, to: 1 })
        .addDelta("intro", { layer: "a", property: "opacity", range: [10, 20], from: 0.5, to: 0 });
    }).toThrow("Overlapping");
  });

  it("returns a deep clone from build()", () => {
    const builder = createDocument("test", { width: 100, height: 100, fps: 30 });
    const doc1 = builder.build();
    const doc2 = builder.build();
    expect(doc1).toEqual(doc2);
    expect(doc1).not.toBe(doc2);
  });
});

// ─── Units ──────────────────────────────────────────────────

describe("units", () => {
  it("isPercentage detects percentage strings", () => {
    expect(isPercentage("50%")).toBe(true);
    expect(isPercentage(100)).toBe(false);
  });

  it("resolveUnit passes through pixels", () => {
    expect(resolveUnit(100, 1080)).toBe(100);
  });

  it("resolveUnit converts percentages", () => {
    expect(resolveUnit("50%", 1080)).toBe(540);
    expect(resolveUnit("100%", 200)).toBe(200);
    expect(resolveUnit("0%", 500)).toBe(0);
  });
});

// ─── Preset Resolver ────────────────────────────────────────

describe("preset resolver", () => {
  it("expands preset into concrete deltas", () => {
    const preset = {
      description: "Fade in",
      deltas: [
        { property: "opacity" as const, from: 0, to: 1 },
      ],
    };
    const deltas = expandPreset(preset, "title", 0, 30);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].layer).toBe("title");
    expect(deltas[0].property).toBe("opacity");
    expect(deltas[0].range).toEqual([0, 30]);
  });

  it("uses offset when provided", () => {
    const preset = {
      deltas: [
        { property: "opacity" as const, offset: [5, 20] as [number, number], from: 0, to: 1 },
      ],
    };
    const deltas = expandPreset(preset, "title", 10, 30);
    expect(deltas[0].range).toEqual([15, 30]);
  });
});

// ─── State Machine ─────────────────────────────────────────

describe("state machine", () => {
  const doc: AtelierDocument = {
    version: "1.0",
    name: "state-test",
    canvas: { width: 100, height: 100, fps: 30 },
    layers: [
      {
        id: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
        opacity: 0,
      },
    ],
    states: {
      intro: {
        duration: 5,
        deltas: [
          {
            layer: "rect",
            property: "opacity",
            range: [0, 4] as [number, number],
            from: 0,
            to: 1,
          },
        ],
      },
      hover: {
        duration: 3,
        deltas: [
          {
            layer: "rect",
            property: "opacity",
            range: [0, 2] as [number, number],
            from: 1,
            to: 0.5,
          },
        ],
      },
    },
  };

  it("constructs with default first state", () => {
    const sm = new StateMachine(doc);
    expect(sm.state).toBe("intro");
    expect(sm.frame).toBe(0);
    expect(sm.stateNames).toEqual(["intro", "hover"]);
    expect(sm.duration).toBe(5);
  });

  it("constructs with explicit initial state", () => {
    const sm = new StateMachine(doc, "hover");
    expect(sm.state).toBe("hover");
    expect(sm.duration).toBe(3);
  });

  it("throws for document with no states", () => {
    const emptyDoc: AtelierDocument = {
      version: "1.0",
      name: "empty",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    expect(() => new StateMachine(emptyDoc)).toThrow("no states");
  });

  it("throws for nonexistent initial state", () => {
    expect(() => new StateMachine(doc, "nonexistent")).toThrow("not found");
  });

  it("tick advances frame and returns playback state", () => {
    const sm = new StateMachine(doc);
    const first = sm.tick();
    expect(first.stateName).toBe("intro");
    expect(first.frame).toBe(0);
    expect(first.isComplete).toBe(false);
    expect(first.resolved.frame).toBe(0);
    expect(first.resolved.layers[0].computedProperties.opacity).toBe(0);

    // Frame should have advanced
    expect(sm.frame).toBe(1);
  });

  it("tick stops advancing at last frame", () => {
    const sm = new StateMachine(doc);
    // Tick through all 5 frames (0,1,2,3,4)
    for (let i = 0; i < 4; i++) sm.tick();
    // At frame 4 (duration-1), should be complete
    const last = sm.tick();
    expect(last.frame).toBe(4);
    expect(last.isComplete).toBe(true);

    // Should not advance past last frame
    const extra = sm.tick();
    expect(extra.frame).toBe(4);
  });

  it("transition changes state and records history", () => {
    const sm = new StateMachine(doc);
    sm.tick(); // frame 0 -> 1
    sm.tick(); // frame 1 -> 2

    sm.transition("hover");
    expect(sm.state).toBe("hover");
    expect(sm.frame).toBe(0);

    expect(sm.history).toHaveLength(1);
    expect(sm.history[0].from).toBe("intro");
    expect(sm.history[0].to).toBe("hover");
    expect(sm.history[0].at).toBe(2);
  });

  it("transition with startFrame", () => {
    const sm = new StateMachine(doc);
    sm.transition("hover", 1);
    expect(sm.frame).toBe(1);
  });

  it("transition throws for nonexistent state", () => {
    const sm = new StateMachine(doc);
    expect(() => sm.transition("nonexistent")).toThrow("not found");
  });

  it("seek clamps to valid range", () => {
    const sm = new StateMachine(doc);
    sm.seek(3);
    expect(sm.frame).toBe(3);

    sm.seek(100);
    expect(sm.frame).toBe(4); // duration - 1

    sm.seek(-5);
    expect(sm.frame).toBe(0);
  });

  it("reset resets frame to 0", () => {
    const sm = new StateMachine(doc);
    sm.tick();
    sm.tick();
    sm.reset();
    expect(sm.frame).toBe(0);
    expect(sm.state).toBe("intro");
  });

  it("reset with state name switches state", () => {
    const sm = new StateMachine(doc);
    sm.reset("hover");
    expect(sm.state).toBe("hover");
    expect(sm.frame).toBe(0);
  });

  it("reset throws for nonexistent state", () => {
    const sm = new StateMachine(doc);
    expect(() => sm.reset("nonexistent")).toThrow("not found");
  });

  it("resolveAt returns frame without advancing", () => {
    const sm = new StateMachine(doc);
    const resolved = sm.resolveAt("intro", 2);
    expect(resolved.frame).toBe(2);
    expect(resolved.stateName).toBe("intro");
    expect(sm.frame).toBe(0); // not advanced
  });

  it("resolveAt throws for nonexistent state", () => {
    const sm = new StateMachine(doc);
    expect(() => sm.resolveAt("nonexistent", 0)).toThrow("not found");
  });

  it("playThrough calls onFrame for every frame", () => {
    const sm = new StateMachine(doc);
    const frames: number[] = [];
    sm.playThrough((state) => {
      frames.push(state.frame);
    });
    expect(frames).toEqual([0, 1, 2, 3, 4]);
    expect(sm.frame).toBe(4);
  });

  it("isComplete reflects current state correctly", () => {
    const sm = new StateMachine(doc);
    expect(sm.isComplete).toBe(false);
    sm.seek(4); // last frame of intro (duration=5)
    expect(sm.isComplete).toBe(true);
  });
});

// ─── Template Resolver ─────────────────────────────────────

describe("template resolver", () => {
  const templateDoc: AtelierDocument = {
    version: "1.0",
    name: "{{title}}",
    canvas: { width: 100, height: 100, fps: 30 },
    layers: [
      {
        id: "text",
        visual: {
          type: "text",
          content: "Hello {{name}}",
          style: { fontFamily: "sans-serif", fontSize: 24, color: "{{textColor}}" },
        },
        frame: { x: "{{xPos}}" as unknown as number, y: 0 },
        bounds: { width: 100, height: 100 },
      },
    ],
    states: {
      intro: {
        duration: 30,
        deltas: [],
      },
    },
    variables: {
      title: { type: "string", description: "Animation title" },
      name: { type: "string", default: "World" },
      textColor: { type: "color", default: "#000000" },
      xPos: { type: "number", default: 10 },
    },
  };

  it("instantiates template with all bindings", () => {
    const result = instantiateTemplate(templateDoc, {
      title: "My Animation",
      name: "Claude",
      textColor: "#FF0000",
      xPos: 50,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.document.name).toBe("My Animation");
    expect(result.document.variables).toBeUndefined();

    const visual = result.document.layers[0].visual as { content: string; style: { color: string } };
    expect(visual.content).toBe("Hello Claude");
    expect(visual.style.color).toBe("#FF0000");
  });

  it("uses defaults for missing optional bindings", () => {
    const result = instantiateTemplate(templateDoc, {
      title: "Test",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.document.name).toBe("Test");

    const visual = result.document.layers[0].visual as { content: string; style: { color: string } };
    expect(visual.content).toBe("Hello World");
    expect(visual.style.color).toBe("#000000");
  });

  it("preserves raw type for exact match bindings", () => {
    const result = instantiateTemplate(templateDoc, {
      title: "Test",
      xPos: 42,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // xPos was "{{xPos}}" (exact match), so it should become the raw number 42
    expect(result.document.layers[0].frame.x).toBe(42);
  });

  it("preserves default raw type for exact match", () => {
    const result = instantiateTemplate(templateDoc, {
      title: "Test",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // xPos default is 10 (number), should be raw number
    expect(result.document.layers[0].frame.x).toBe(10);
  });

  it("returns errors for missing required variables", () => {
    const result = instantiateTemplate(templateDoc, {});

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.length).toBeGreaterThan(0);
    const titleError = result.errors.find(e => e.variable === "title");
    expect(titleError).toBeDefined();
    expect(titleError!.message).toContain("Required");
  });

  it("returns errors for unknown bindings", () => {
    const result = instantiateTemplate(templateDoc, {
      title: "Test",
      unknownVar: "oops",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const unknownError = result.errors.find(e => e.variable === "unknownVar");
    expect(unknownError).toBeDefined();
    expect(unknownError!.message).toContain("Unknown");
  });

  it("does not mutate original template", () => {
    const original = JSON.parse(JSON.stringify(templateDoc));
    instantiateTemplate(templateDoc, { title: "Test" });
    expect(templateDoc).toEqual(original);
  });

  it("handles document with no variables section", () => {
    const simpleDoc: AtelierDocument = {
      version: "1.0",
      name: "simple",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const result = instantiateTemplate(simpleDoc, {});
    expect(result.success).toBe(true);
  });
});

describe("findTemplateVariables", () => {
  it("finds variables in string values throughout document", () => {
    const doc: AtelierDocument = {
      version: "1.0",
      name: "{{title}}",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "text",
          visual: {
            type: "text",
            content: "{{greeting}} {{name}}",
            style: { fontFamily: "sans-serif", fontSize: 24, color: "{{color}}" },
          },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 100 },
        },
      ],
      states: {},
    };

    const vars = findTemplateVariables(doc);
    expect(vars).toContain("title");
    expect(vars).toContain("greeting");
    expect(vars).toContain("name");
    expect(vars).toContain("color");
    expect(vars).toHaveLength(4);
  });

  it("returns empty array for document with no variables", () => {
    const doc: AtelierDocument = {
      version: "1.0",
      name: "plain",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    expect(findTemplateVariables(doc)).toEqual([]);
  });

  it("deduplicates repeated variables", () => {
    const doc: AtelierDocument = {
      version: "1.0",
      name: "{{title}} - {{title}}",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {},
    };
    const vars = findTemplateVariables(doc);
    expect(vars.filter(v => v === "title")).toHaveLength(1);
  });
});
