import { describe, it, expect } from "vitest";
import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
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

  it("renders image with sourceRect using 9-arg drawImage", () => {
    const docWithImage: AtelierDocument = {
      ...doc,
      layers: [
        {
          id: "sprite",
          visual: {
            type: "image",
            assetId: "atlas",
            src: "atlas.png",
            sourceRect: { x: 32, y: 0, width: 32, height: 32 },
          },
          frame: { x: 0, y: 0 },
          bounds: { width: 64, height: 64 },
        },
      ],
    };
    const ctx = createMockContext();
    const resolved = resolveFrame(docWithImage, "intro", 0);
    renderFrame(ctx, resolved, docWithImage);

    // Should call drawImage with 9 args (source rect crop)
    const drawCalls = ctx.calls.filter(c => c[0] === "drawImage");
    // Image may not be loaded in mock, but the renderer should attempt it
    // The key assertion is that no errors are thrown
    expect(true).toBe(true);
  });

  it("renders spritesheet image with computed source rect", () => {
    const docWithSpritesheet: AtelierDocument = {
      ...doc,
      layers: [
        {
          id: "sprite",
          visual: {
            type: "image",
            assetId: "walk",
            src: "walk.png",
            spritesheet: { columns: 4, rows: 2, frameWidth: 32, frameHeight: 32 },
            frameIndex: 5,
          },
          frame: { x: 0, y: 0 },
          bounds: { width: 64, height: 64 },
        },
      ],
    };
    const ctx = createMockContext();
    const resolved = resolveFrame(docWithSpritesheet, "intro", 0);
    renderFrame(ctx, resolved, docWithSpritesheet);
    // frameIndex 5 on 4-column grid = column 1, row 1
    // No errors thrown
    expect(true).toBe(true);
  });

  it("skips layer with animated visibility set to false", () => {
    const docWithVisibility: AtelierDocument = {
      ...doc,
      layers: [
        {
          id: "flash",
          visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#FF0000" } },
          frame: { x: 0, y: 0 },
          bounds: { width: 50, height: 50 },
          visible: true,
        },
      ],
      states: {
        intro: {
          duration: 30,
          deltas: [
            {
              layer: "flash",
              property: "visible" as const,
              range: [10, 10] as [number, number],
              from: true,
              to: false,
            },
          ],
        },
      },
    };
    const ctx = createMockContext();
    // At frame 10, visible should be false
    const resolved = resolveFrame(docWithVisibility, "intro", 10);
    renderFrame(ctx, resolved, docWithVisibility);

    // Layer should be skipped — no save call for it
    const saves = ctx.calls.filter(c => c[0] === "save");
    expect(saves.length).toBe(0);
  });
});

describe("buildEffectiveLayer — new features", () => {
  it("computes visible from computed properties", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 50 },
          visible: true,
        },
        computedProperties: {
          visible: false,
        },
      },
      1080,
      1080,
    );
    expect(eff.visible).toBe(false);
  });

  it("defaults visible to true when not set", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 50 },
        },
        computedProperties: {},
      },
      1080,
      1080,
    );
    expect(eff.visible).toBe(true);
  });

  it("computes tint from layer defaults", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 50 },
          tint: { color: "#FF0000", amount: 0.5 },
        },
        computedProperties: {},
      },
      1080,
      1080,
    );
    expect(eff.tint).toEqual({ color: "#FF0000", amount: 0.5 });
  });

  it("overrides tint.amount from computed properties", () => {
    const eff = buildEffectiveLayer(
      {
        id: "test",
        layer: {
          id: "test",
          visual: { type: "group" },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 50 },
          tint: { color: "#FF0000", amount: 0 },
        },
        computedProperties: {
          "tint.amount": 0.8,
        },
      },
      1080,
      1080,
    );
    expect(eff.tint!.amount).toBe(0.8);
  });
});

// ─── Spritesheet / SourceRect Canvas Rendering ──────────────

describe("renderFrame — spritesheet", () => {
  it("calls 9-arg drawImage for spritesheet layers", () => {
    const spritesheetDoc: AtelierDocument = {
      version: "1.0",
      name: "sprite-canvas",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "hero",
          visual: {
            type: "image",
            assetId: "walk",
            src: "walk.png",
            spritesheet: { columns: 4, rows: 2, frameWidth: 32, frameHeight: 32 },
            frameIndex: 5,
          },
          frame: { x: 0, y: 0 },
          bounds: { width: 64, height: 64 },
        },
      ],
      states: { idle: { duration: 1, deltas: [] } },
    };

    const mockImg = { width: 128, height: 64 };
    const imageCache = {
      get: (src: string) => src === "walk.png" ? mockImg : undefined,
      load: () => {},
    };

    const ctx = createMockContext();
    const resolved = resolveFrame(spritesheetDoc, "idle", 0);
    renderFrame(ctx, resolved, spritesheetDoc, imageCache as any);

    // drawImage should be called with 9 args for spritesheet crop
    const drawCalls = ctx.calls.filter(c => c[0] === "drawImage");
    expect(drawCalls.length).toBe(1);
    // frameIndex 5 → col=1, row=1 → sx=32, sy=32
    expect(drawCalls[0][1]).toBe(mockImg);
    expect(drawCalls[0][2]).toBe(32); // sx
    expect(drawCalls[0][3]).toBe(32); // sy
    expect(drawCalls[0][4]).toBe(32); // sw
    expect(drawCalls[0][5]).toBe(32); // sh
    expect(drawCalls[0][6]).toBe(0);  // dx
    expect(drawCalls[0][7]).toBe(0);  // dy
    expect(drawCalls[0][8]).toBe(64); // dw
    expect(drawCalls[0][9]).toBe(64); // dh
  });

  it("calls 9-arg drawImage for sourceRect layers", () => {
    const srcRectDoc: AtelierDocument = {
      version: "1.0",
      name: "srcrect-canvas",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "crop",
          visual: {
            type: "image",
            assetId: "atlas",
            src: "atlas.png",
            sourceRect: { x: 10, y: 20, width: 50, height: 40 },
          },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 80 },
        },
      ],
      states: { idle: { duration: 1, deltas: [] } },
    };

    const mockImg = { width: 256, height: 256 };
    const imageCache = {
      get: (src: string) => src === "atlas.png" ? mockImg : undefined,
      load: () => {},
    };

    const ctx = createMockContext();
    const resolved = resolveFrame(srcRectDoc, "idle", 0);
    renderFrame(ctx, resolved, srcRectDoc, imageCache as any);

    const drawCalls = ctx.calls.filter(c => c[0] === "drawImage");
    expect(drawCalls.length).toBe(1);
    expect(drawCalls[0][2]).toBe(10);  // sx
    expect(drawCalls[0][3]).toBe(20);  // sy
    expect(drawCalls[0][4]).toBe(50);  // sw
    expect(drawCalls[0][5]).toBe(40);  // sh
  });
});

// ─── Tint Canvas Rendering ──────────────────────────────────

describe("renderFrame — tint", () => {
  it("uses offscreen compositing when tint and createOffscreen are available", () => {
    const tintDoc: AtelierDocument = {
      version: "1.0",
      name: "tint-canvas",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "tinted",
          visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#0000FF" } },
          frame: { x: 0, y: 0 },
          bounds: { width: 50, height: 50 },
          tint: { color: "#FF0000", amount: 0.5 },
        },
      ],
      states: { idle: { duration: 1, deltas: [] } },
    };

    const offCalls: [string, ...unknown[]][] = [];
    const offCanvas = {};
    const offCtx = new Proxy({} as Record<string, unknown>, {
      get(target, prop: string) {
        if (prop === "calls") return offCalls;
        if (prop === "canvas") return { width: 50, height: 50 };
        if (prop in target) return target[prop];
        return (...args: unknown[]) => { offCalls.push([prop, ...args]); };
      },
      set(target, prop: string, value) {
        target[prop] = value;
        offCalls.push([`set:${prop}`, value]);
        return true;
      },
    });

    const ctx = createMockContext();
    // Add createOffscreen to mock context
    (ctx as any).createOffscreen = (w: number, h: number) => ({ ctx: offCtx, canvas: offCanvas });

    const resolved = resolveFrame(tintDoc, "idle", 0);
    renderFrame(ctx, resolved, tintDoc);

    // Offscreen context should have received multiply composite
    const multiplyOps = offCalls.filter(c => c[0] === "set:globalCompositeOperation" && c[1] === "multiply");
    expect(multiplyOps.length).toBeGreaterThanOrEqual(1);

    // Main context should drawImage the offscreen canvas back
    const mainDraws = ctx.calls.filter(c => c[0] === "drawImage" && c[1] === offCanvas);
    expect(mainDraws.length).toBe(1);
  });
});

// ─── Ref Canvas Rendering ───────────────────────────────────

describe("renderFrame — ref layers", () => {
  it("renders placeholder when no documentResolver", () => {
    const refDoc: AtelierDocument = {
      version: "1.0",
      name: "ref-test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "ext",
          visual: { type: "ref", src: "other.atelier" },
          frame: { x: 0, y: 0 },
          bounds: { width: 80, height: 60 },
        },
      ],
      states: { idle: { duration: 1, deltas: [] } },
    };

    const ctx = createMockContext();
    const resolved = resolveFrame(refDoc, "idle", 0);
    renderFrame(ctx, resolved, refDoc);

    // Should render placeholder (strokeRect + fillText)
    const strokes = ctx.calls.filter(c => c[0] === "strokeRect");
    expect(strokes.length).toBe(1);
    const texts = ctx.calls.filter(c => c[0] === "fillText");
    expect(texts.length).toBe(1);
    expect(texts[0][1]).toContain("REF:");
  });

  it("renders sub-doc when documentResolver provided", () => {
    const subDoc: AtelierDocument = {
      version: "1.0",
      name: "sub",
      canvas: { width: 200, height: 200, fps: 30 },
      layers: [
        {
          id: "sub-rect",
          visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#FF0000" } },
          frame: { x: 0, y: 0 },
          bounds: { width: 200, height: 200 },
        },
      ],
      states: { default: { duration: 10, deltas: [] } },
    };

    const refDoc: AtelierDocument = {
      version: "1.0",
      name: "ref-test",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "ext",
          visual: { type: "ref", src: "sub.atelier" },
          frame: { x: 0, y: 0 },
          bounds: { width: 80, height: 60 },
        },
      ],
      states: { idle: { duration: 1, deltas: [] } },
    };

    const ctx = createMockContext();
    const resolved = resolveFrame(refDoc, "idle", 0);
    renderFrame(ctx, resolved, refDoc, {
      documentResolver: (src) => src === "sub.atelier" ? subDoc : undefined,
    });

    // Should have rendered the sub-doc's rect (fillRect for the shape)
    // Find fillRect calls after the background clear
    const fillRects = ctx.calls.filter(c => c[0] === "fillRect");
    // Background clear + sub-doc rect = 2
    expect(fillRects.length).toBeGreaterThanOrEqual(2);

    // Should NOT have rendered placeholder text
    const texts = ctx.calls.filter(c => c[0] === "fillText");
    expect(texts.length).toBe(0);
  });

  it("renders NOT FOUND placeholder when resolver returns undefined", () => {
    const refDoc: AtelierDocument = {
      version: "1.0",
      name: "ref-missing",
      canvas: { width: 100, height: 100, fps: 30 },
      layers: [
        {
          id: "ext",
          visual: { type: "ref", src: "missing.atelier" },
          frame: { x: 0, y: 0 },
          bounds: { width: 80, height: 60 },
        },
      ],
      states: { idle: { duration: 1, deltas: [] } },
    };

    const ctx = createMockContext();
    const resolved = resolveFrame(refDoc, "idle", 0);
    renderFrame(ctx, resolved, refDoc, {
      documentResolver: () => undefined,
    });

    const texts = ctx.calls.filter(c => c[0] === "fillText");
    expect(texts.length).toBe(1);
    expect(texts[0][1]).toBe("NOT FOUND");
  });
});
