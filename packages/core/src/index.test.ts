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
  blendResolvedFrames,
  instantiateTemplate,
  findTemplateVariables,
  evaluateExpression,
  isExpression,
  frameToTime,
  timeToFrame,
  computeAudioState,
  computeAudioCues,
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
    // frame.x range ends at 15, so at frame 30 it holds the final "to" value
    expect(resolved.layers[0].computedProperties["frame.x"]).toBe(50);
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

// ─── Expression Evaluator ──────────────────────────────────

describe("expression evaluator", () => {
  const ctx = { t: 0.5, progress: 0.5, frame: 15, duration: 30 };

  it("isExpression detects expression objects", () => {
    expect(isExpression({ expr: "t * 100" })).toBe(true);
    expect(isExpression(42)).toBe(false);
    expect(isExpression("hello")).toBe(false);
    expect(isExpression(null)).toBe(false);
    expect(isExpression({ other: "key" })).toBe(false);
  });

  it("evaluates simple arithmetic", () => {
    expect(evaluateExpression("2 + 3", ctx)).toBe(5);
    expect(evaluateExpression("10 - 4", ctx)).toBe(6);
    expect(evaluateExpression("3 * 7", ctx)).toBe(21);
    expect(evaluateExpression("20 / 4", ctx)).toBe(5);
    expect(evaluateExpression("17 % 5", ctx)).toBe(2);
  });

  it("respects operator precedence", () => {
    expect(evaluateExpression("2 + 3 * 4", ctx)).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4", ctx)).toBe(20);
  });

  it("supports power operator", () => {
    expect(evaluateExpression("2 ** 3", ctx)).toBe(8);
    expect(evaluateExpression("2 ** 3 ** 2", ctx)).toBe(512); // right-associative: 2^(3^2) = 2^9
  });

  it("supports unary minus", () => {
    expect(evaluateExpression("-5", ctx)).toBe(-5);
    expect(evaluateExpression("-(3 + 4)", ctx)).toBe(-7);
  });

  it("reads context variables", () => {
    expect(evaluateExpression("t", ctx)).toBe(0.5);
    expect(evaluateExpression("frame", ctx)).toBe(15);
    expect(evaluateExpression("duration", ctx)).toBe(30);
    expect(evaluateExpression("progress", ctx)).toBe(0.5);
  });

  it("reads constants", () => {
    expect(evaluateExpression("pi", ctx)).toBeCloseTo(Math.PI);
    expect(evaluateExpression("e", ctx)).toBeCloseTo(Math.E);
    expect(evaluateExpression("tau", ctx)).toBeCloseTo(Math.PI * 2);
  });

  it("calls math functions", () => {
    expect(evaluateExpression("sin(0)", ctx)).toBeCloseTo(0);
    expect(evaluateExpression("cos(0)", ctx)).toBeCloseTo(1);
    expect(evaluateExpression("abs(-5)", ctx)).toBe(5);
    expect(evaluateExpression("floor(3.7)", ctx)).toBe(3);
    expect(evaluateExpression("ceil(3.2)", ctx)).toBe(4);
    expect(evaluateExpression("round(3.5)", ctx)).toBe(4);
    expect(evaluateExpression("sqrt(9)", ctx)).toBe(3);
    expect(evaluateExpression("min(3, 7)", ctx)).toBe(3);
    expect(evaluateExpression("max(3, 7)", ctx)).toBe(7);
    expect(evaluateExpression("pow(2, 10)", ctx)).toBe(1024);
    expect(evaluateExpression("clamp(5, 0, 3)", ctx)).toBe(3);
  });

  it("evaluates complex expressions", () => {
    // Oscillation: sin(t * pi * 2) * 100
    const val = evaluateExpression("sin(t * pi * 2) * 100", ctx);
    expect(val).toBeCloseTo(Math.sin(0.5 * Math.PI * 2) * 100);
  });

  it("supports comparison operators", () => {
    expect(evaluateExpression("5 > 3", ctx)).toBe(1);
    expect(evaluateExpression("5 < 3", ctx)).toBe(0);
    expect(evaluateExpression("5 == 5", ctx)).toBe(1);
    expect(evaluateExpression("5 != 3", ctx)).toBe(1);
    expect(evaluateExpression("5 >= 5", ctx)).toBe(1);
    expect(evaluateExpression("4 <= 3", ctx)).toBe(0);
  });

  it("supports ternary operator", () => {
    expect(evaluateExpression("t > 0.3 ? 100 : 0", ctx)).toBe(100);
    expect(evaluateExpression("t > 0.8 ? 100 : 0", ctx)).toBe(0);
  });

  it("handles safe division by zero", () => {
    expect(evaluateExpression("5 / 0", ctx)).toBe(0);
  });

  it("throws on unknown variables", () => {
    expect(() => evaluateExpression("unknownVar", ctx)).toThrow("unknown variable");
  });

  it("throws on unknown functions", () => {
    expect(() => evaluateExpression("unknownFn(5)", ctx)).toThrow("unknown function");
  });

  it("works as delta from/to values", () => {
    const delta: Delta = {
      layer: "test",
      property: "rotation",
      range: [0, 60],
      from: 0,
      to: { expr: "sin(t * pi * 4) * 30" } as unknown,
    };
    // At frame 30 (midpoint), t=0.5, sin(0.5 * pi * 4) = sin(2pi) ≈ 0
    // The expression evaluates to ~0, then interpolateValue(0, ~0, 0.5) ≈ 0
    const val = resolveDeltaValue(delta, 30) as number;
    expect(typeof val).toBe("number");
  });
});

// ─── Audio Timing ──────────────────────────────────────────

describe("audio timing", () => {
  it("frameToTime converts frames to seconds", () => {
    expect(frameToTime(0, 30)).toBe(0);
    expect(frameToTime(30, 30)).toBe(1);
    expect(frameToTime(60, 30)).toBe(2);
    expect(frameToTime(15, 30)).toBe(0.5);
    expect(frameToTime(90, 60)).toBe(1.5);
  });

  it("timeToFrame converts seconds to frames (floored)", () => {
    expect(timeToFrame(0, 30)).toBe(0);
    expect(timeToFrame(1, 30)).toBe(30);
    expect(timeToFrame(2, 30)).toBe(60);
    expect(timeToFrame(0.5, 30)).toBe(15);
    expect(timeToFrame(1.5, 60)).toBe(90);
    // Flooring behavior
    expect(timeToFrame(0.9, 30)).toBe(27);
  });

  it("computeAudioState — basic playback", () => {
    const audio = { src: "music.mp3" };
    const state = computeAudioState(audio, 0, 30, 90);
    expect(state.shouldPlay).toBe(true);
    expect(state.currentTime).toBe(0);
    expect(state.volume).toBe(1);
  });

  it("computeAudioState — respects offset", () => {
    const audio = { src: "music.mp3", offset: 5 };
    // At frame 30 (1 second into 30fps), currentTime = offset + elapsed = 5 + 1 = 6
    const state = computeAudioState(audio, 30, 30, 90);
    expect(state.shouldPlay).toBe(true);
    expect(state.currentTime).toBeCloseTo(6);
  });

  it("computeAudioState — respects volume", () => {
    const audio = { src: "music.mp3", volume: 0.5 };
    const state = computeAudioState(audio, 0, 30, 90);
    expect(state.volume).toBe(0.5);
  });

  it("computeAudioState — delayed start", () => {
    const audio = { src: "music.mp3", startFrame: 30 };
    // Before startFrame
    const before = computeAudioState(audio, 15, 30, 90);
    expect(before.shouldPlay).toBe(false);
    expect(before.currentTime).toBe(0);

    // At startFrame
    const at = computeAudioState(audio, 30, 30, 90);
    expect(at.shouldPlay).toBe(true);
    expect(at.currentTime).toBe(0);

    // After startFrame
    const after = computeAudioState(audio, 60, 30, 90);
    expect(after.shouldPlay).toBe(true);
    expect(after.currentTime).toBe(1); // 30 frames = 1 second at 30fps
  });

  it("computeAudioState — stops at state end", () => {
    const audio = { src: "music.mp3" };
    const state = computeAudioState(audio, 90, 30, 90);
    expect(state.shouldPlay).toBe(false);
  });

  it("computeAudioState — loop wraps time", () => {
    const audio = { src: "beat.mp3", loop: true };
    // State is 90 frames = 3 seconds at 30fps
    // At frame 0: time = 0
    const t0 = computeAudioState(audio, 0, 30, 90);
    expect(t0.shouldPlay).toBe(true);
    expect(t0.currentTime).toBe(0);

    // At frame 45 (1.5s): should still be playing
    const t1 = computeAudioState(audio, 45, 30, 90);
    expect(t1.shouldPlay).toBe(true);
    expect(t1.currentTime).toBeCloseTo(1.5);
  });

  it("computeAudioState — loop with offset + delayed start", () => {
    const audio = { src: "beat.mp3", loop: true, offset: 2, startFrame: 30 };
    // At frame 30 (start): elapsed = 0, currentTime = offset + 0 = 2
    const t0 = computeAudioState(audio, 30, 30, 90);
    expect(t0.currentTime).toBeCloseTo(2);
  });

  it("computeAudioCues — basic start/end", () => {
    const audio = { src: "music.mp3" };
    const cues = computeAudioCues(audio, 90);
    expect(cues).toContainEqual({ frame: 0, event: "start" });
    expect(cues).toContainEqual({ frame: 89, event: "end" });
  });

  it("computeAudioCues — delayed start", () => {
    const audio = { src: "music.mp3", startFrame: 30 };
    const cues = computeAudioCues(audio, 90);
    expect(cues[0]).toEqual({ frame: 30, event: "start" });
    expect(cues[cues.length - 1]).toEqual({ frame: 89, event: "end" });
  });

  it("computeAudioCues — no cues when startFrame >= duration", () => {
    const audio = { src: "music.mp3", startFrame: 100 };
    const cues = computeAudioCues(audio, 90);
    expect(cues).toEqual([]);
  });
});

// ─── Hierarchical States ──────────────────────────────────

describe("hierarchical states", () => {
  const hierarchicalDoc: AtelierDocument = {
    version: "1.0",
    name: "hierarchical-test",
    canvas: { width: 100, height: 100, fps: 30 },
    layers: [
      {
        id: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
        opacity: 0,
      },
      {
        id: "circle",
        visual: { type: "shape", shape: { type: "ellipse" } },
        frame: { x: 50, y: 50 },
        bounds: { width: 50, height: 50 },
      },
    ],
    states: {
      idle: {
        duration: 10,
        deltas: [
          {
            layer: "rect",
            property: "opacity",
            range: [0, 9] as [number, number],
            from: 0,
            to: 1,
          },
          {
            layer: "circle",
            property: "opacity",
            range: [0, 9] as [number, number],
            from: 0.5,
            to: 0.5,
          },
        ],
      },
      hover: {
        parent: "idle",
        duration: 10,
        deltas: [
          // Override rect opacity from parent
          {
            layer: "rect",
            property: "opacity",
            range: [0, 9] as [number, number],
            from: 0.8,
            to: 1,
          },
          // Add new animation not in parent
          {
            layer: "rect",
            property: "rotation",
            range: [0, 9] as [number, number],
            from: 0,
            to: 15,
          },
        ],
      },
      active: {
        parent: "hover",
        duration: 10,
        deltas: [
          // Override hover's rotation
          {
            layer: "rect",
            property: "rotation",
            range: [0, 9] as [number, number],
            from: 0,
            to: 45,
          },
        ],
      },
    },
  };

  it("resolves parent state deltas alongside own", () => {
    const sm = new StateMachine(hierarchicalDoc, "hover");
    const result = sm.tick();
    // rect.opacity from hover (overrides idle): 0.8
    expect(result.resolved.layers[0].computedProperties.opacity).toBe(0.8);
    // circle.opacity inherited from idle: 0.5
    expect(result.resolved.layers[1].computedProperties.opacity).toBe(0.5);
    // rect.rotation from hover: 0
    expect(result.resolved.layers[0].computedProperties.rotation).toBe(0);
  });

  it("child overrides parent deltas for same layer+property", () => {
    const sm = new StateMachine(hierarchicalDoc, "hover");
    sm.seek(9); // last frame
    const result = sm.tick();
    // rect.opacity from hover (not idle)
    expect(result.resolved.layers[0].computedProperties.opacity).toBe(1);
    // rect.rotation from hover
    expect(result.resolved.layers[0].computedProperties.rotation).toBe(15);
  });

  it("multi-level inheritance (grandchild)", () => {
    const sm = new StateMachine(hierarchicalDoc, "active");
    sm.seek(9);
    const result = sm.tick();
    // rect.rotation from active (overrides hover): 45
    expect(result.resolved.layers[0].computedProperties.rotation).toBe(45);
    // rect.opacity from hover (inherited through active, since active doesn't define it): 1
    expect(result.resolved.layers[0].computedProperties.opacity).toBe(1);
    // circle.opacity from idle (inherited through hover → active): 0.5
    expect(result.resolved.layers[1].computedProperties.opacity).toBe(0.5);
  });

  it("resolveAncestorChain returns correct chain", () => {
    const sm = new StateMachine(hierarchicalDoc, "idle");
    expect(sm.resolveAncestorChain("idle")).toEqual(["idle"]);
    expect(sm.resolveAncestorChain("hover")).toEqual(["idle", "hover"]);
    expect(sm.resolveAncestorChain("active")).toEqual(["idle", "hover", "active"]);
  });

  it("detects circular parent references", () => {
    const circularDoc: AtelierDocument = {
      version: "1.0",
      name: "circular",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {
        a: { parent: "b", duration: 10, deltas: [] },
        b: { parent: "a", duration: 10, deltas: [] },
      },
    };
    const sm = new StateMachine(circularDoc, "a");
    expect(() => sm.resolveAncestorChain("a")).toThrow("Circular parent reference");
  });

  it("throws for missing parent state", () => {
    const missingParentDoc: AtelierDocument = {
      version: "1.0",
      name: "missing-parent",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [],
      states: {
        child: { parent: "nonexistent", duration: 10, deltas: [] },
      },
    };
    const sm = new StateMachine(missingParentDoc, "child");
    expect(() => sm.resolveAncestorChain("child")).toThrow("not found");
  });

  it("collectDeltas merges parent and child deltas", () => {
    const sm = new StateMachine(hierarchicalDoc, "hover");
    const deltas = sm.collectDeltas("hover");
    // Should have: rect.opacity (from hover), circle.opacity (from idle), rect.rotation (from hover)
    expect(deltas).toHaveLength(3);
    const rectOpacity = deltas.filter(d => d.layer === "rect" && d.property === "opacity");
    expect(rectOpacity).toHaveLength(1);
    expect(rectOpacity[0].from).toBe(0.8); // hover's version, not idle's
  });

  it("resolveAt with hierarchical state uses merged deltas", () => {
    const sm = new StateMachine(hierarchicalDoc, "hover");
    const resolved = sm.resolveAt("hover", 0);
    // Should include circle.opacity from parent idle
    expect(resolved.layers[1].computedProperties.opacity).toBe(0.5);
  });

  it("state without parent works normally", () => {
    const sm = new StateMachine(hierarchicalDoc, "idle");
    const result = sm.tick();
    expect(result.resolved.layers[0].computedProperties.opacity).toBe(0);
  });
});

// ─── State Transition Interpolation ──────────────────────────

describe("state transition interpolation", () => {
  const transDoc: AtelierDocument = {
    version: "1.0",
    name: "transition-test",
    canvas: { width: 100, height: 100, fps: 30 },
    layers: [
      {
        id: "rect",
        visual: { type: "shape", shape: { type: "rect" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
        opacity: 1,
      },
    ],
    states: {
      intro: {
        duration: 10,
        deltas: [
          {
            layer: "rect",
            property: "opacity",
            range: [0, 9] as [number, number],
            from: 0,
            to: 1,
          },
        ],
        transitions: {
          outro: { duration: 5 },
        },
      },
      outro: {
        duration: 10,
        deltas: [
          {
            layer: "rect",
            property: "opacity",
            range: [0, 9] as [number, number],
            from: 1,
            to: 0,
          },
        ],
      },
    },
  };

  it("isTransitioning returns false by default", () => {
    const sm = new StateMachine(transDoc);
    expect(sm.isTransitioning()).toBe(false);
    expect(sm.getTransitionProgress()).toBeNull();
  });

  it("transition with config starts blended transition", () => {
    const sm = new StateMachine(transDoc);
    sm.tick(); // frame 0
    sm.transition("outro");
    expect(sm.isTransitioning()).toBe(true);
    expect(sm.state).toBe("outro");
  });

  it("transition progress advances with tick", () => {
    const sm = new StateMachine(transDoc);
    sm.tick(); // frame 0
    sm.transition("outro"); // starts 5-frame transition
    // Progress starts at 0
    expect(sm.getTransitionProgress()).toBe(0);
    sm.tick(); // 1 frame into transition
    const prog = sm.getTransitionProgress();
    expect(prog).toBeGreaterThan(0);
  });

  it("transition completes after duration", () => {
    const sm = new StateMachine(transDoc);
    sm.transition("outro"); // 5-frame transition
    for (let i = 0; i < 5; i++) sm.tick();
    expect(sm.isTransitioning()).toBe(false);
    expect(sm.state).toBe("outro");
  });

  it("transitionTo creates explicit transition", () => {
    const sm = new StateMachine(transDoc);
    sm.transitionTo("outro", 3);
    expect(sm.isTransitioning()).toBe(true);
    expect(sm.state).toBe("outro");
    expect(sm.frame).toBe(0);

    // After 3 ticks, transition should complete
    for (let i = 0; i < 3; i++) sm.tick();
    expect(sm.isTransitioning()).toBe(false);
  });

  it("transitionTo with easing applies easing to progress", () => {
    const sm = new StateMachine(transDoc);
    sm.transitionTo("outro", 10, "ease-in");
    sm.tick(); // 1 frame in
    const progress = sm.getTransitionProgress();
    expect(progress).toBeDefined();
    // ease-in at 10%: should be less than 0.1
    expect(progress!).toBeLessThan(0.1);
  });

  it("transition without config is instant", () => {
    const noTransDoc: AtelierDocument = {
      ...transDoc,
      states: {
        intro: { duration: 10, deltas: transDoc.states.intro.deltas },
        outro: transDoc.states.outro,
      },
    };
    const sm = new StateMachine(noTransDoc);
    sm.transition("outro");
    expect(sm.isTransitioning()).toBe(false);
    expect(sm.state).toBe("outro");
  });

  it("reset clears active transition", () => {
    const sm = new StateMachine(transDoc);
    sm.transitionTo("outro", 10);
    expect(sm.isTransitioning()).toBe(true);
    sm.reset("intro");
    expect(sm.isTransitioning()).toBe(false);
  });
});

// ─── Frame Blending ──────────────────────────────────────────

describe("blendResolvedFrames", () => {
  it("blends numeric properties", () => {
    const frameA = {
      frame: 0,
      stateName: "a",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { opacity: 0 as unknown } as Record<string, unknown>,
      }],
    };
    const frameB = {
      frame: 0,
      stateName: "b",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
      }],
    };

    const blended = blendResolvedFrames(frameA as any, frameB as any, 0.5);
    expect(blended.layers[0].computedProperties.opacity).toBeCloseTo(0.5);
  });

  it("blends colors", () => {
    const frameA = {
      frame: 0, stateName: "a",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { "visual.fill.color": "#000000" as unknown } as Record<string, unknown>,
      }],
    };
    const frameB = {
      frame: 0, stateName: "b",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { "visual.fill.color": "#FFFFFF" as unknown } as Record<string, unknown>,
      }],
    };

    const blended = blendResolvedFrames(frameA as any, frameB as any, 0.5);
    // Should be some gray midpoint
    const color = blended.layers[0].computedProperties["visual.fill.color"] as string;
    expect(color).toBeDefined();
    expect(typeof color).toBe("string");
  });

  it("fades in layers only present in target", () => {
    const frameA = {
      frame: 0, stateName: "a",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
      }],
    };
    const frameB = {
      frame: 0, stateName: "b",
      layers: [
        {
          id: "rect",
          layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
          computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
        },
        {
          id: "circle",
          layer: { id: "circle", visual: { type: "shape" as const, shape: { type: "ellipse" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 50, height: 50 } },
          computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
        },
      ],
    };

    const blended = blendResolvedFrames(frameA as any, frameB as any, 0.5);
    expect(blended.layers).toHaveLength(2);
    // circle is fading in — should have reduced opacity
    const circle = blended.layers.find(l => l.id === "circle");
    expect(circle).toBeDefined();
    expect(circle!.computedProperties.opacity).toBeCloseTo(0.5);
  });

  it("fades out layers only present in source", () => {
    const frameA = {
      frame: 0, stateName: "a",
      layers: [
        {
          id: "rect",
          layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
          computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
        },
        {
          id: "extra",
          layer: { id: "extra", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 50, height: 50 } },
          computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
        },
      ],
    };
    const frameB = {
      frame: 0, stateName: "b",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { opacity: 1 as unknown } as Record<string, unknown>,
      }],
    };

    const blended = blendResolvedFrames(frameA as any, frameB as any, 0.75);
    const extra = blended.layers.find(l => l.id === "extra");
    expect(extra).toBeDefined();
    // fading out: opacity = 1 * (1 - 0.75) = 0.25
    expect(extra!.computedProperties.opacity).toBeCloseTo(0.25);
  });

  it("snaps discrete values at t >= 0.5", () => {
    const frameA = {
      frame: 0, stateName: "a",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { "frame.x": 0 as unknown, "frame.y": 0 as unknown } as Record<string, unknown>,
      }],
    };
    const frameB = {
      frame: 0, stateName: "b",
      layers: [{
        id: "rect",
        layer: { id: "rect", visual: { type: "shape" as const, shape: { type: "rect" as const } }, frame: { x: 0, y: 0 }, bounds: { width: 100, height: 100 } },
        computedProperties: { "frame.x": 100 as unknown, "frame.y": 200 as unknown } as Record<string, unknown>,
      }],
    };

    const blended = blendResolvedFrames(frameA as any, frameB as any, 0.5);
    expect(blended.layers[0].computedProperties["frame.x"]).toBeCloseTo(50);
    expect(blended.layers[0].computedProperties["frame.y"]).toBeCloseTo(100);
  });
});
