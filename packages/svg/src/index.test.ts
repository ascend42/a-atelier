import { describe, it, expect } from "vitest";
import type { AtelierDocument } from "@a-company/atelier-types";
import { renderFrameSVG, escapeXml, buildTransform } from "./index.js";
import type { EffectiveLayer } from "@a-company/atelier-canvas";

// ── Test Documents ─────────────────────────────────────────

const basicDoc: AtelierDocument = {
  version: "1.0",
  name: "svg-test",
  canvas: { width: 200, height: 200, fps: 30, background: "#FFFFFF" },
  layers: [
    {
      id: "rect",
      visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#FF0000" } },
      frame: { x: 10, y: 20 },
      bounds: { width: 50, height: 30 },
    },
  ],
  states: {
    default: {
      duration: 1,
      deltas: [],
    },
  },
};

// ── renderFrameSVG ─────────────────────────────────────────

describe("renderFrameSVG", () => {
  it("renders basic SVG structure", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="200"');
    expect(svg).toContain("</svg>");
  });

  it("includes viewBox by default", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0);
    expect(svg).toContain('viewBox="0 0 200 200"');
  });

  it("can omit viewBox", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0, { viewBox: false });
    expect(svg).not.toContain("viewBox");
  });

  it("includes XML declaration when requested", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0, { xmlDeclaration: true });
    expect(svg).toContain('<?xml version="1.0"');
  });

  it("renders background rect", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0);
    expect(svg).toContain('fill="#FFFFFF"');
  });

  it("skips background when transparent", () => {
    const noBackground: AtelierDocument = {
      ...basicDoc,
      canvas: { ...basicDoc.canvas, background: undefined },
    };
    const svg = renderFrameSVG(noBackground, "default", 0);
    // Should not have a full-size background rect before layers
    const lines = svg.split("\n");
    const bgRects = lines.filter(l => l.includes('width="200" height="200" fill='));
    expect(bgRects.length).toBe(0);
  });

  it("renders rect shape with fill", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0);
    expect(svg).toContain("<rect");
    expect(svg).toContain('fill="#FF0000"');
    expect(svg).toContain('width="50"');
    expect(svg).toContain('height="30"');
  });

  it("renders ellipse shape", () => {
    const ellipseDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "circle",
        visual: { type: "shape", shape: { type: "ellipse" }, fill: { type: "solid", color: "#00FF00" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 80 },
      }],
    };
    const svg = renderFrameSVG(ellipseDoc, "default", 0);
    expect(svg).toContain("<ellipse");
    expect(svg).toContain('cx="50"');
    expect(svg).toContain('cy="40"');
    expect(svg).toContain('rx="50"');
    expect(svg).toContain('ry="40"');
  });

  it("renders path shape", () => {
    const pathDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "path",
        visual: {
          type: "shape",
          shape: {
            type: "path",
            points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
            closed: true,
          },
          fill: { type: "solid", color: "#0000FF" },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      }],
    };
    const svg = renderFrameSVG(pathDoc, "default", 0);
    expect(svg).toContain("<path");
    expect(svg).toContain("M 0 0");
    expect(svg).toContain("L 100 0");
    expect(svg).toContain("Z");
  });

  it("renders stroke attributes", () => {
    const strokeDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "rect",
        visual: {
          type: "shape",
          shape: { type: "rect" },
          fill: { type: "solid", color: "#FF0000" },
          stroke: { color: "#000000", width: 2, lineCap: "round" },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      }],
    };
    const svg = renderFrameSVG(strokeDoc, "default", 0);
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("renders text layer", () => {
    const textDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "title",
        visual: {
          type: "text",
          content: "Hello World",
          style: { fontFamily: "Arial", fontSize: 24, color: "#000000" },
        },
        frame: { x: 10, y: 10 },
        bounds: { width: 200, height: 30 },
      }],
    };
    const svg = renderFrameSVG(textDoc, "default", 0);
    expect(svg).toContain("<text");
    expect(svg).toContain("Hello World");
    expect(svg).toContain('font-family="Arial"');
    expect(svg).toContain('font-size="24"');
  });

  it("renders opacity", () => {
    const opacityDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        ...basicDoc.layers[0],
        opacity: 0.5,
      }],
    };
    const svg = renderFrameSVG(opacityDoc, "default", 0);
    expect(svg).toContain('opacity="0.5"');
  });

  it("renders transform (translate)", () => {
    const svg = renderFrameSVG(basicDoc, "default", 0);
    expect(svg).toContain("translate(10, 20)");
  });

  it("renders linear gradient with defs", () => {
    const gradDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "rect",
        visual: {
          type: "shape",
          shape: { type: "rect" },
          fill: {
            type: "linear-gradient",
            angle: 90,
            stops: [
              { offset: 0, color: "#FF0000" },
              { offset: 1, color: "#0000FF" },
            ],
          },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      }],
    };
    const svg = renderFrameSVG(gradDoc, "default", 0);
    expect(svg).toContain("<defs>");
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("<stop");
    expect(svg).toContain('url(#grad-');
  });

  it("renders shadow as filter", () => {
    const shadowDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        ...basicDoc.layers[0],
        shadow: { color: "#000000", blur: 10, offsetX: 5, offsetY: 5 },
      }],
    };
    const svg = renderFrameSVG(shadowDoc, "default", 0);
    expect(svg).toContain("<filter");
    expect(svg).toContain("feDropShadow");
    expect(svg).toContain('filter="url(#filter-');
  });

  it("renders image layer", () => {
    const imageDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "img",
        visual: { type: "image", assetId: "logo", src: "https://example.com/logo.png" },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      }],
    };
    const svg = renderFrameSVG(imageDoc, "default", 0);
    expect(svg).toContain("<image");
    expect(svg).toContain('href="https://example.com/logo.png"');
  });

  it("skips invisible layers", () => {
    const hiddenDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        ...basicDoc.layers[0],
        visible: false,
      }],
    };
    const svg = renderFrameSVG(hiddenDoc, "default", 0);
    // The background rect exists, but no layer rect should be inside a <g> group
    expect(svg).not.toContain('<g><rect width="50"');
  });

  it("renders blend mode as mix-blend-mode", () => {
    const blendDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        ...basicDoc.layers[0],
        blendMode: "multiply",
      }],
    };
    const svg = renderFrameSVG(blendDoc, "default", 0);
    expect(svg).toContain("mix-blend-mode: multiply");
  });

  it("renders clip path", () => {
    const clipDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        ...basicDoc.layers[0],
        clipPath: { type: "ellipse" },
      }],
    };
    const svg = renderFrameSVG(clipDoc, "default", 0);
    expect(svg).toContain("<clipPath");
    expect(svg).toContain('clip-path="url(#clip-');
  });

  it("renders rounded rect", () => {
    const roundedDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "rect",
        visual: {
          type: "shape",
          shape: { type: "rect", cornerRadius: 10 },
          fill: { type: "solid", color: "#FF0000" },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      }],
    };
    const svg = renderFrameSVG(roundedDoc, "default", 0);
    expect(svg).toContain('rx="10"');
    expect(svg).toContain('ry="10"');
  });

  it("accepts pre-resolved frame", () => {
    const resolved = {
      frame: 0,
      stateName: "default",
      layers: basicDoc.layers.map(l => ({
        id: l.id,
        layer: l,
        computedProperties: {},
      })),
    };
    const svg = renderFrameSVG(basicDoc, resolved);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
  });

  it("renders complete multi-layer document", () => {
    const multiDoc: AtelierDocument = {
      version: "1.0",
      name: "multi-layer",
      canvas: { width: 400, height: 300, fps: 30, background: "#EEEEEE" },
      layers: [
        {
          id: "bg",
          visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#336699" } },
          frame: { x: 0, y: 0 },
          bounds: { width: 400, height: 300 },
        },
        {
          id: "circle",
          visual: { type: "shape", shape: { type: "ellipse" }, fill: { type: "solid", color: "#FF6633" } },
          frame: { x: 150, y: 100 },
          bounds: { width: 100, height: 100 },
          opacity: 0.8,
        },
        {
          id: "label",
          visual: {
            type: "text",
            content: "Test SVG",
            style: { fontFamily: "Helvetica", fontSize: 32, color: "#FFFFFF", textAlign: "center" },
          },
          frame: { x: 100, y: 250 },
          bounds: { width: 200, height: 40 },
        },
      ],
      states: {
        default: { duration: 1, deltas: [] },
      },
    };
    const svg = renderFrameSVG(multiDoc, "default", 0);
    expect(svg).toContain("</svg>");
    // Should have 3 layer groups (bg rect, circle, text)
    expect(svg).toContain("<rect");
    expect(svg).toContain("<ellipse");
    expect(svg).toContain("<text");
    expect(svg).toContain("Test SVG");
  });

  it("renders image with sourceRect using viewBox crop", () => {
    const srcRectDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "img",
        visual: {
          type: "image",
          assetId: "atlas",
          src: "https://example.com/atlas.png",
          sourceRect: { x: 32, y: 0, width: 32, height: 32 },
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 64, height: 64 },
      }],
    };
    const svg = renderFrameSVG(srcRectDoc, "default", 0);
    expect(svg).toContain('viewBox="32 0 32 32"');
    expect(svg).toContain("<image");
  });

  it("renders spritesheet image using viewBox crop with full sheet dimensions", () => {
    const spritesheetDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "sprite",
        visual: {
          type: "image",
          assetId: "walk",
          src: "https://example.com/walk.png",
          spritesheet: { columns: 4, rows: 2, frameWidth: 32, frameHeight: 32 },
          frameIndex: 5,
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 64, height: 64 },
      }],
    };
    const svg = renderFrameSVG(spritesheetDoc, "default", 0);
    // frameIndex 5 on 4-column grid: col=1, row=1 → viewBox="32 32 32 32"
    expect(svg).toContain('viewBox="32 32 32 32"');
    expect(svg).toContain("<image");
    // Inner image should use full spritesheet dimensions (4*32=128, 2*32=64)
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="64"');
  });

  it("renders tint filter", () => {
    const tintDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        ...basicDoc.layers[0],
        tint: { color: "#FF0000", amount: 0.5 },
      }],
    };
    const svg = renderFrameSVG(tintDoc, "default", 0);
    expect(svg).toContain("<filter");
    expect(svg).toContain("feFlood");
    expect(svg).toContain("feBlend");
    expect(svg).toContain('flood-color="#FF0000"');
  });

  it("omits invisible layers from SVG output", () => {
    const visDoc: AtelierDocument = {
      ...basicDoc,
      layers: [
        {
          ...basicDoc.layers[0],
          visible: false,
        },
      ],
    };
    const svg = renderFrameSVG(visDoc, "default", 0);
    // Layer with visible: false should not produce any <g> group
    expect(svg).not.toContain("<g");
  });

  it("renders ref placeholder without documentResolver", () => {
    const refDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "ext",
        visual: { type: "ref", src: "other.atelier" },
        frame: { x: 0, y: 0 },
        bounds: { width: 80, height: 60 },
      }],
    };
    const svg = renderFrameSVG(refDoc, "default", 0);
    expect(svg).toContain('stroke="#999"');
    expect(svg).toContain('stroke-dasharray="4 2"');
  });

  it("renders ref sub-doc with documentResolver", () => {
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
      states: { default: { duration: 1, deltas: [] } },
    };

    const refDoc: AtelierDocument = {
      ...basicDoc,
      layers: [{
        id: "ext",
        visual: { type: "ref", src: "sub.atelier" },
        frame: { x: 0, y: 0 },
        bounds: { width: 80, height: 60 },
      }],
    };

    const svg = renderFrameSVG(refDoc, "default", 0, {
      documentResolver: (src) => src === "sub.atelier" ? subDoc : undefined,
    });

    // Should contain a nested <svg> with viewBox for the sub-doc
    expect(svg).toContain('viewBox="0 0 200 200"');
    // Should contain the sub-doc's rect
    expect(svg).toContain('fill="#FF0000"');
    // Should NOT contain the placeholder stroke
    expect(svg).not.toContain('stroke="#999"');
  });
});

// ── Utility functions ──────────────────────────────────────

describe("escapeXml", () => {
  it("escapes XML special characters", () => {
    expect(escapeXml('Hello "World" & <Friends>')).toBe("Hello &quot;World&quot; &amp; &lt;Friends&gt;");
  });
});

describe("buildTransform", () => {
  it("returns empty string for identity", () => {
    const eff = {
      x: 0, y: 0,
      rotation: 0, motionPathAngle: 0,
      scaleX: 1, scaleY: 1,
      anchorX: 0, anchorY: 0,
      width: 100, height: 100,
    } as EffectiveLayer;
    expect(buildTransform(eff)).toBe("");
  });

  it("builds translate", () => {
    const eff = {
      x: 50, y: 30,
      rotation: 0, motionPathAngle: 0,
      scaleX: 1, scaleY: 1,
      anchorX: 0, anchorY: 0,
      width: 100, height: 100,
    } as EffectiveLayer;
    expect(buildTransform(eff)).toBe("translate(50, 30)");
  });

  it("builds translate + rotate", () => {
    const eff = {
      x: 50, y: 30,
      rotation: 45, motionPathAngle: 0,
      scaleX: 1, scaleY: 1,
      anchorX: 0, anchorY: 0,
      width: 100, height: 100,
    } as EffectiveLayer;
    const transform = buildTransform(eff);
    expect(transform).toContain("translate(50, 30)");
    expect(transform).toContain("rotate(45)");
  });
});
