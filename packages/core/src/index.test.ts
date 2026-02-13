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
