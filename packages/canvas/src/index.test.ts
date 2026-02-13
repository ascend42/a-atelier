import { describe, it, expect } from "vitest";
import type { AtelierDocument } from "@atelier/types";
import { resolveFrame } from "@atelier/core";
import { renderFrame, buildEffectiveLayer, colorToCSS } from "./index.js";
import type { RenderContext } from "./canvas-types.js";

/** Create a mock RenderContext that tracks calls */
function createMockContext(): RenderContext & { calls: [string, ...unknown[]][] } {
  const calls: [string, ...unknown[]][] = [];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop === "calls") return calls;
      if (prop === "canvas") return { width: 100, height: 100 };

      // Return stored values for style properties
      if (prop in target) return target[prop];

      // Return a function that records calls
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push([`set:${prop}`, value]);
      return true;
    },
  };

  return new Proxy({} as Record<string, unknown>, handler) as unknown as RenderContext & { calls: [string, ...unknown[]][] };
}

// ─── colorToCSS ─────────────────────────────────────────────

describe("colorToCSS", () => {
  it("passes hex strings through", () => {
    expect(colorToCSS("#FF0000")).toBe("#FF0000");
  });

  it("converts RGBA to css", () => {
    expect(colorToCSS({ r: 255, g: 0, b: 0, a: 1 })).toBe("rgba(255, 0, 0, 1)");
  });

  it("converts HSLA to css", () => {
    expect(colorToCSS({ h: 0, s: 100, l: 50, a: 1 })).toBe("hsla(0, 100%, 50%, 1)");
  });
});

// ─── buildEffectiveLayer ────────────────────────────────────

describe("buildEffectiveLayer", () => {
  it("uses layer defaults when no computed properties", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: 10, y: 20 },
          bounds: { width: 100, height: 50 },
          opacity: 0.8,
        },
        computedProperties: {},
      },
      1080,
      1080,
    );
    expect(eff.x).toBe(10);
    expect(eff.y).toBe(20);
    expect(eff.width).toBe(100);
    expect(eff.height).toBe(50);
    expect(eff.opacity).toBe(0.8);
  });

  it("overrides with computed properties", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 100 },
        },
        computedProperties: {
          "frame.x": 50,
          opacity: 0.5,
          "scale.x": 2,
        },
      },
      1080,
      1080,
    );
    expect(eff.x).toBe(50);
    expect(eff.opacity).toBe(0.5);
    expect(eff.scaleX).toBe(2);
  });

  it("resolves percentage units", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: "50%", y: "25%" },
          bounds: { width: "100%", height: "50%" },
        },
        computedProperties: {},
      },
      1000,
      800,
    );
    expect(eff.x).toBe(500);
    expect(eff.y).toBe(200);
    expect(eff.width).toBe(1000);
    expect(eff.height).toBe(400);
  });
});

// ─── renderFrame ────────────────────────────────────────────

describe("renderFrame", () => {
  const doc: AtelierDocument = {
    version: "1.0",
    name: "test",
    canvas: { width: 100, height: 100, fps: 30, background: "#000000" },
    layers: [
      {
        id: "bg",
        visual: {
          type: "shape",
          shape: { type: "rect" },
          fill: { type: "solid", color: "#1a1a2e" },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      },
      {
        id: "title",
        visual: {
          type: "text",
          content: "Hello",
          style: {
            fontFamily: "Arial",
            fontSize: 24,
            color: "#FFFFFF",
          },
        },
        frame: { x: 10, y: 10 },
        bounds: { width: 80, height: 30 },
        opacity: 1,
      },
    ],
    states: {
      intro: {
        duration: 30,
        deltas: [
          {
            layer: "title",
            property: "opacity",
            range: [0, 30] as [number, number],
            from: 0,
            to: 1,
          },
        ],
      },
    },
  };

  it("clears canvas with background color", () => {
    const ctx = createMockContext();
    const resolved = resolveFrame(doc, "intro", 0);
    renderFrame(ctx, resolved, doc);

    const bgFill = ctx.calls.find(c => c[0] === "set:fillStyle" && c[1] === "#000000");
    expect(bgFill).toBeDefined();
  });

  it("renders shape layer with fill", () => {
    const ctx = createMockContext();
    const resolved = resolveFrame(doc, "intro", 15);
    renderFrame(ctx, resolved, doc);

    // Should have fillRect calls (background clear + rect shape)
    const fillRects = ctx.calls.filter(c => c[0] === "fillRect");
    expect(fillRects.length).toBeGreaterThanOrEqual(2);
  });

  it("renders text layer", () => {
    const ctx = createMockContext();
    const resolved = resolveFrame(doc, "intro", 15);
    renderFrame(ctx, resolved, doc);

    const textCalls = ctx.calls.filter(c => c[0] === "fillText");
    expect(textCalls.length).toBe(1);
    expect(textCalls[0][1]).toBe("Hello");
  });

  it("skips layers with zero opacity", () => {
    const ctx = createMockContext();
    const resolved = resolveFrame(doc, "intro", 0);
    renderFrame(ctx, resolved, doc);

    // At frame 0, title has opacity 0 (delta from: 0)
    // So fillText should NOT be called
    const textCalls = ctx.calls.filter(c => c[0] === "fillText");
    expect(textCalls.length).toBe(0);
  });

  it("applies opacity from computed properties", () => {
    const ctx = createMockContext();
    const resolved = resolveFrame(doc, "intro", 15);
    renderFrame(ctx, resolved, doc);

    // Should set globalAlpha for the title layer
    const alphaCalls = ctx.calls.filter(c => c[0] === "set:globalAlpha");
    // At frame 15/30, opacity should be ~0.5
    const halfOpacity = alphaCalls.find(c => {
      const val = c[1] as number;
      return val > 0.4 && val < 0.6;
    });
    expect(halfOpacity).toBeDefined();
  });

  it("skips invisible layers", () => {
    const docWithHidden: AtelierDocument = {
      ...doc,
      layers: [
        ...doc.layers,
        {
          id: "hidden",
          visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#FF0000" } },
          frame: { x: 0, y: 0 },
          bounds: { width: 50, height: 50 },
          visible: false,
        },
      ],
    };
    const ctx = createMockContext();
    const resolved = resolveFrame(docWithHidden, "intro", 15);
    renderFrame(ctx, resolved, docWithHidden);

    // save/restore pairs: 1 for bg + 1 for title = 2 (hidden skipped)
    const saves = ctx.calls.filter(c => c[0] === "save");
    expect(saves.length).toBe(2);
  });

  it("applies rotation transform", () => {
    const docWithRotation: AtelierDocument = {
      ...doc,
      layers: [
        {
          id: "rotated",
          visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#FF0000" } },
          frame: { x: 50, y: 50 },
          bounds: { width: 20, height: 20 },
          rotation: 45,
          anchorPoint: { x: 0.5, y: 0.5 },
        },
      ],
    };
    const ctx = createMockContext();
    const resolved = resolveFrame(docWithRotation, "intro", 0);
    renderFrame(ctx, resolved, docWithRotation);

    const rotateCalls = ctx.calls.filter(c => c[0] === "rotate");
    expect(rotateCalls.length).toBe(1);
    // 45 degrees in radians
    expect(rotateCalls[0][1]).toBeCloseTo(Math.PI / 4);
  });
});
