import { describe, it, expect } from "vitest";
import type { AtelierDocument, Delta } from "@atelier/types";
import {
  exportToLottie,
  colorToLottie,
  mapEasing,
  isLossyEasing,
  mapDeltasToAnimated,
  collectUnsupportedWarnings,
} from "./index.js";

// ── Test document ─────────────────────────────────────────

const testDoc: AtelierDocument = {
  version: "1.0",
  name: "lottie-test",
  canvas: { width: 400, height: 300, fps: 30 },
  layers: [
    {
      id: "rect",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: "#FF0000" },
      },
      frame: { x: 50, y: 50 },
      bounds: { width: 100, height: 80 },
      opacity: 1,
    },
    {
      id: "circle",
      visual: {
        type: "shape",
        shape: { type: "ellipse" },
        fill: { type: "solid", color: "#00FF00" },
        stroke: { color: "#000000", width: 2 },
      },
      frame: { x: 200, y: 100 },
      bounds: { width: 60, height: 60 },
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
          range: [0, 20] as [number, number],
          from: 0,
          to: 100,
        },
      ],
    },
  },
};

// ── exportToLottie ────────────────────────────────────────

describe("exportToLottie", () => {
  it("exports basic Lottie JSON structure", () => {
    const { json } = exportToLottie(testDoc);
    expect(json.v).toBe("5.7.4");
    expect(json.fr).toBe(30);
    expect(json.w).toBe(400);
    expect(json.h).toBe(300);
    expect(json.ip).toBe(0);
    expect(json.op).toBe(30);
    expect(json.nm).toBe("lottie-test");
  });

  it("exports correct number of layers", () => {
    const { json } = exportToLottie(testDoc);
    expect(json.layers).toHaveLength(2);
  });

  it("maps shape layer type correctly", () => {
    const { json } = exportToLottie(testDoc);
    expect(json.layers[0].ty).toBe(4); // shape
    expect(json.layers[0].nm).toBe("rect");
  });

  it("maps layer shapes", () => {
    const { json } = exportToLottie(testDoc);
    expect(json.layers[0].shapes).toBeDefined();
    expect(json.layers[0].shapes!.length).toBeGreaterThan(0);
    // Should have rect shape + fill
    const rectShape = json.layers[0].shapes!.find(s => s.ty === "rc");
    expect(rectShape).toBeDefined();
    const fillShape = json.layers[0].shapes!.find(s => s.ty === "fl");
    expect(fillShape).toBeDefined();
  });

  it("maps animated opacity", () => {
    const { json } = exportToLottie(testDoc);
    const transform = json.layers[0].ks;
    // Opacity should be animated
    expect(transform.o.a).toBe(1);
  });

  it("maps animated position", () => {
    const { json } = exportToLottie(testDoc);
    const transform = json.layers[0].ks;
    // Position should be animated (frame.x has animation)
    expect(transform.p.a).toBe(1);
  });

  it("maps static transform values", () => {
    const { json } = exportToLottie(testDoc);
    // Circle has no deltas — all transforms should be static
    const circle = json.layers[1];
    expect(circle.ks.o.a).toBe(0); // static opacity
    expect(circle.ks.r.a).toBe(0); // static rotation
  });

  it("maps stroke layer", () => {
    const { json } = exportToLottie(testDoc);
    const circleShapes = json.layers[1].shapes!;
    const stroke = circleShapes.find(s => s.ty === "st");
    expect(stroke).toBeDefined();
  });

  it("exports text layer", () => {
    const textDoc: AtelierDocument = {
      ...testDoc,
      layers: [{
        id: "title",
        visual: {
          type: "text",
          content: "Hello",
          style: { fontFamily: "Arial", fontSize: 24, color: "#000000" },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 200, height: 40 },
      }],
    };
    const { json } = exportToLottie(textDoc);
    expect(json.layers[0].ty).toBe(5); // text
    expect(json.layers[0].t).toBeDefined();
    expect(json.layers[0].t!.d.k[0].s.t).toBe("Hello");
    expect(json.layers[0].t!.d.k[0].s.f).toBe("Arial");
  });

  it("exports image layer with asset ref", () => {
    const imageDoc: AtelierDocument = {
      ...testDoc,
      assets: { logo: { type: "image", src: "logo.png" } },
      layers: [{
        id: "img",
        visual: { type: "image", assetId: "logo" },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      }],
    };
    const { json } = exportToLottie(imageDoc);
    expect(json.layers[0].ty).toBe(2); // image
    expect(json.layers[0].refId).toBe("logo");
    expect(json.assets).toBeDefined();
    expect(json.assets!).toHaveLength(1);
  });

  it("throws for document with no states", () => {
    const noStates: AtelierDocument = {
      ...testDoc,
      states: {},
    };
    expect(() => exportToLottie(noStates)).toThrow("no states");
  });

  it("throws for nonexistent state", () => {
    expect(() => exportToLottie(testDoc, { state: "nonexistent" })).toThrow("not found");
  });

  it("warns about audio tracks", () => {
    const audioDoc: AtelierDocument = {
      ...testDoc,
      states: {
        intro: {
          ...testDoc.states.intro,
          audio: { src: "music.mp3" },
        },
      },
    };
    const { warnings } = exportToLottie(audioDoc);
    expect(warnings.some(w => w.includes("Audio"))).toBe(true);
  });

  it("warns about shadows", () => {
    const shadowDoc: AtelierDocument = {
      ...testDoc,
      layers: [{
        ...testDoc.layers[0],
        shadow: { color: "#000", blur: 10 },
      }],
    };
    const { warnings } = exportToLottie(shadowDoc);
    expect(warnings.some(w => w.includes("Shadow"))).toBe(true);
  });

  it("maps blend mode", () => {
    const blendDoc: AtelierDocument = {
      ...testDoc,
      layers: [{
        ...testDoc.layers[0],
        blendMode: "multiply",
      }],
    };
    const { json } = exportToLottie(blendDoc);
    expect(json.layers[0].bm).toBe(1);
  });

  it("deduplicates warnings", () => {
    const { warnings } = exportToLottie(testDoc);
    const unique = new Set(warnings);
    expect(warnings.length).toBe(unique.size);
  });
});

// ── colorToLottie ─────────────────────────────────────────

describe("colorToLottie", () => {
  it("converts hex color to 0-1 array", () => {
    const result = colorToLottie("#FF0000");
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(0);
    expect(result[3]).toBeCloseTo(1);
  });

  it("converts hex with alpha", () => {
    const result = colorToLottie("#FF000080");
    expect(result[0]).toBeCloseTo(1);
    expect(result[3]).toBeCloseTo(0.502, 1);
  });

  it("converts short hex", () => {
    const result = colorToLottie("#F00");
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(0);
    expect(result[2]).toBeCloseTo(0);
  });

  it("converts black", () => {
    const result = colorToLottie("#000000");
    expect(result).toEqual([0, 0, 0, 1]);
  });

  it("converts white", () => {
    const result = colorToLottie("#FFFFFF");
    expect(result).toEqual([1, 1, 1, 1]);
  });
});

// ── mapEasing ─────────────────────────────────────────────

describe("mapEasing", () => {
  it("maps linear easing", () => {
    const result = mapEasing({ type: "linear" });
    expect(result).toHaveProperty("i");
    expect(result).toHaveProperty("o");
  });

  it("maps cubic-bezier", () => {
    const result = mapEasing({ type: "cubic-bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
    expect(result).toHaveProperty("i");
    const e = result as { i: { x: number[]; y: number[] }; o: { x: number[]; y: number[] } };
    expect(e.o.x[0]).toBe(0.42);
    expect(e.i.x[0]).toBe(0.58);
  });

  it("maps step to hold", () => {
    const result = mapEasing({ type: "step", steps: 4 });
    expect(result).toHaveProperty("h", 1);
  });

  it("maps spring to approximated bezier", () => {
    const result = mapEasing({ type: "spring", stiffness: 200 });
    expect(result).toHaveProperty("i");
  });

  it("maps string presets", () => {
    expect(mapEasing("ease-in")).toHaveProperty("o");
    expect(mapEasing("ease-out")).toHaveProperty("o");
    expect(mapEasing("ease-in-out")).toHaveProperty("o");
  });

  it("maps undefined to linear", () => {
    const result = mapEasing(undefined);
    expect(result).toHaveProperty("i");
  });
});

// ── isLossyEasing ─────────────────────────────────────────

describe("isLossyEasing", () => {
  it("returns null for lossless easings", () => {
    expect(isLossyEasing(undefined)).toBeNull();
    expect(isLossyEasing("ease-in")).toBeNull();
    expect(isLossyEasing({ type: "linear" })).toBeNull();
    expect(isLossyEasing({ type: "cubic-bezier", x1: 0, y1: 0, x2: 1, y2: 1 })).toBeNull();
  });

  it("returns message for spring", () => {
    expect(isLossyEasing({ type: "spring" })).toContain("Spring");
  });

  it("returns message for step", () => {
    expect(isLossyEasing({ type: "step", steps: 4 })).toContain("Step");
  });
});

// ── mapDeltasToAnimated ───────────────────────────────────

describe("mapDeltasToAnimated", () => {
  it("returns static value for empty deltas", () => {
    const result = mapDeltasToAnimated([], "opacity", []);
    expect(result.a).toBe(0);
    expect(result.k).toBe(0);
  });

  it("maps single delta to keyframes", () => {
    const deltas: Delta[] = [{
      layer: "a", property: "opacity",
      range: [0, 30] as [number, number],
      from: 0, to: 1,
    }];
    const result = mapDeltasToAnimated(deltas, "opacity", []);
    expect(result.a).toBe(1);
    expect(Array.isArray(result.k)).toBe(true);
    const kfs = result.k as Array<{ t: number; s: [number]; e?: [number] }>;
    expect(kfs.length).toBe(2);
    expect(kfs[0].t).toBe(0);
    expect(kfs[0].s[0]).toBe(0);
    expect(kfs[0].e![0]).toBe(1);
    expect(kfs[1].t).toBe(30);
  });

  it("maps static value when from equals to", () => {
    const deltas: Delta[] = [{
      layer: "a", property: "opacity",
      range: [0, 30] as [number, number],
      from: 0.5, to: 0.5,
    }];
    const result = mapDeltasToAnimated(deltas, "opacity", []);
    expect(result.a).toBe(0);
    expect(result.k).toBe(0.5);
  });
});

// ── collectUnsupportedWarnings ────────────────────────────

describe("collectUnsupportedWarnings", () => {
  it("warns about audio", () => {
    const state = { duration: 30, deltas: [], audio: { src: "music.mp3" } };
    const warnings = collectUnsupportedWarnings(testDoc, state);
    expect(warnings.some(w => w.includes("Audio"))).toBe(true);
  });

  it("warns about expressions", () => {
    const state = {
      duration: 30,
      deltas: [{
        layer: "rect", property: "opacity" as const,
        range: [0, 30] as [number, number],
        from: { expr: "t * 100" } as unknown,
        to: 1,
      }],
    };
    const warnings = collectUnsupportedWarnings(testDoc, state);
    expect(warnings.some(w => w.includes("Expression"))).toBe(true);
  });

  it("warns about shadows", () => {
    const shadowDoc: AtelierDocument = {
      ...testDoc,
      layers: [{ ...testDoc.layers[0], shadow: { color: "#000", blur: 5 } }],
    };
    const warnings = collectUnsupportedWarnings(shadowDoc, testDoc.states.intro);
    expect(warnings.some(w => w.includes("Shadow"))).toBe(true);
  });

  it("returns empty for supported features only", () => {
    const simpleDoc: AtelierDocument = {
      ...testDoc,
      layers: [testDoc.layers[0]],
    };
    const state = { duration: 30, deltas: [] };
    const warnings = collectUnsupportedWarnings(simpleDoc, state);
    // Should have no audio, expression, shadow, or motion path warnings
    expect(warnings.filter(w =>
      w.includes("Audio") || w.includes("Expression") || w.includes("Shadow") || w.includes("Motion")
    )).toHaveLength(0);
  });
});
