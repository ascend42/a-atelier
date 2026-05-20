import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { History } from "./history.js";
import { NumberInput } from "./controls/number-input.js";
import { ColorPicker } from "./controls/color-picker.js";
import { SliderInput } from "./controls/slider-input.js";
import { SelectInput } from "./controls/select-input.js";
import type { AtelierDocument } from "@a-company/atelier-types";
import { createGifEncoder } from "./export/gif-encoder.js";
import { supportsWebCodecs, supportsWebM, supportsGifExport } from "./export/video-exporter.js";

// ─── History ──────────────────────────────────────────────────

describe("History", () => {
  let history: History;

  beforeEach(() => {
    history = new History();
  });

  it("starts with nothing to undo or redo", () => {
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("can undo after a snapshot", () => {
    history.snapshot('{"v":1}');
    expect(history.canUndo).toBe(true);

    const restored = history.undo('{"v":2}');
    expect(restored).toBe('{"v":1}');
    expect(history.canUndo).toBe(false);
  });

  it("can redo after an undo", () => {
    history.snapshot('{"v":1}');
    history.undo('{"v":2}');

    expect(history.canRedo).toBe(true);
    const restored = history.redo('{"v":1}');
    expect(restored).toBe('{"v":2}');
    expect(history.canRedo).toBe(false);
  });

  it("clears redo stack on new snapshot", () => {
    history.snapshot('{"v":1}');
    history.undo('{"v":2}');
    expect(history.canRedo).toBe(true);

    history.snapshot('{"v":3}');
    expect(history.canRedo).toBe(false);
  });

  it("respects max size (50)", () => {
    for (let i = 0; i < 60; i++) {
      history.snapshot(JSON.stringify({ v: i }));
    }
    // Only 50 kept
    let count = 0;
    while (history.canUndo) {
      history.undo("current");
      count++;
    }
    expect(count).toBe(50);
  });

  it("clear() resets both stacks", () => {
    history.snapshot('{"v":1}');
    history.snapshot('{"v":2}');
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});

// ─── NumberInput ──────────────────────────────────────────────

describe("NumberInput", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
  });

  it("creates an input element with correct initial value", () => {
    new NumberInput(parent, {
      label: "X",
      value: 42,
      onChange: () => {},
    });
    const input = parent.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe("number");
    expect(input.value).toBe("42");
  });

  it("sets step and min attributes", () => {
    new NumberInput(parent, {
      label: "W",
      value: 100,
      step: 5,
      min: 0,
      onChange: () => {},
    });
    const input = parent.querySelector("input") as HTMLInputElement;
    expect(input.step).toBe("5");
    expect(input.min).toBe("0");
  });

  it("calls onChange on input event", () => {
    let received = 0;
    new NumberInput(parent, {
      label: "Y",
      value: 10,
      onChange: (v) => { received = v; },
    });
    const input = parent.querySelector("input") as HTMLInputElement;
    input.value = "25";
    input.dispatchEvent(new Event("input"));
    expect(received).toBe(25);
  });
});

// ─── ColorPicker ──────────────────────────────────────────────

describe("ColorPicker", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
  });

  it("creates a color input with normalized hex", () => {
    new ColorPicker(parent, {
      label: "Fill",
      value: "#ff0000",
      onChange: () => {},
    });
    const input = parent.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("#ff0000");
  });

  it("normalizes short hex to 6-char", () => {
    new ColorPicker(parent, {
      label: "Stroke",
      value: "#f00",
      onChange: () => {},
    });
    const input = parent.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input.value).toBe("#ff0000");
  });

  it("calls onChange on input event", () => {
    let received = "";
    new ColorPicker(parent, {
      label: "Color",
      value: "#000000",
      onChange: (v) => { received = v; },
    });
    const input = parent.querySelector('input[type="color"]') as HTMLInputElement;
    input.value = "#abcdef";
    input.dispatchEvent(new Event("input"));
    expect(received).toBe("#abcdef");
  });
});

// ─── SliderInput ──────────────────────────────────────────────

describe("SliderInput", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
  });

  it("creates a range input with correct attributes", () => {
    new SliderInput(parent, {
      label: "Opacity",
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: () => {},
    });
    const input = parent.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.min).toBe("0");
    expect(input.max).toBe("1");
    expect(input.step).toBe("0.01");
    expect(input.value).toBe("0.5");
  });

  it("displays formatted value text", () => {
    new SliderInput(parent, {
      label: "Opacity",
      value: 0.75,
      min: 0,
      max: 1,
      onChange: () => {},
    });
    const display = parent.querySelector(".atel-slider-input__value");
    expect(display?.textContent).toBe("0.75");
  });

  it("gates onChange to commit: a drag (input ticks) fires onInput only; onChange fires once on change", () => {
    const inputs: number[] = [];
    const changes: number[] = [];
    new SliderInput(parent, {
      label: "Opacity",
      value: 0,
      min: 0,
      max: 1,
      step: 0.01,
      onInput: (v) => inputs.push(v),
      onChange: (v) => changes.push(v),
    });
    const input = parent.querySelector('input[type="range"]') as HTMLInputElement;

    // Simulate a drag: several `input` ticks, no commit yet.
    for (const v of [0.2, 0.5, 0.8]) {
      input.value = String(v);
      input.dispatchEvent(new Event("input"));
    }
    // Live preview fired per tick; history/host notification (onChange) did NOT.
    expect(inputs).toEqual([0.2, 0.5, 0.8]);
    expect(changes).toEqual([]);

    // Commit (pointerup / blur → DOM `change`): exactly one onChange.
    input.value = "0.8";
    input.dispatchEvent(new Event("change"));
    expect(changes).toEqual([0.8]);
  });
});

// ─── SelectInput ──────────────────────────────────────────────

describe("SelectInput", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
  });

  it("renders all options", () => {
    new SelectInput(parent, {
      label: "Align",
      value: "center",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
      onChange: () => {},
    });
    const options = parent.querySelectorAll("option");
    expect(options.length).toBe(3);
    expect(options[1].selected).toBe(true);
  });

  it("calls onChange on change event", () => {
    let received = "";
    new SelectInput(parent, {
      label: "Shape",
      value: "rect",
      options: [
        { label: "Rect", value: "rect" },
        { label: "Ellipse", value: "ellipse" },
      ],
      onChange: (v) => { received = v; },
    });
    const select = parent.querySelector("select") as HTMLSelectElement;
    select.value = "ellipse";
    select.dispatchEvent(new Event("change"));
    expect(received).toBe("ellipse");
  });
});

// ─── LayerPanel ───────────────────────────────────────────────

function makeTestDoc(): AtelierDocument {
  return {
    version: "1.0",
    name: "test-doc",
    canvas: { width: 400, height: 300, fps: 30 },
    layers: [
      {
        id: "rect-1",
        visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#ff0000" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
        opacity: 1,
      },
      {
        id: "text-1",
        visual: { type: "text", content: "Hello", style: { fontFamily: "Inter", fontSize: 24, color: "#ffffff" } },
        frame: { x: 50, y: 50 },
        bounds: { width: 200, height: 40 },
        opacity: 1,
      },
    ],
    states: {
      default: {
        duration: 60,
        deltas: [],
      },
    },
  };
}

describe("LayerPanel", async () => {
  // Dynamic import to avoid issues with CSS import in studio.ts
  const { LayerPanel } = await import("./panels/layer-panel.js");

  let parent: HTMLElement;
  let selectedId: string | null;
  let docChanged: number;

  beforeEach(() => {
    parent = document.createElement("div");
    selectedId = null;
    docChanged = 0;
  });

  function createPanel(doc: AtelierDocument) {
    const panel = new LayerPanel(parent, {
      onSelectLayer: (id) => { selectedId = id; },
      onDocumentChange: () => { docChanged++; },
    });
    panel.loadDocument(doc);
    return panel;
  }

  it("renders layer items for each layer", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    const items = parent.querySelectorAll(".atel-layer-item");
    expect(items.length).toBe(2);
  });

  it("selects a layer on click", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    const items = parent.querySelectorAll(".atel-layer-item");
    (items[0] as HTMLElement).click();
    expect(selectedId).toBe("rect-1");
  });

  // Helper: click + Add, then click a menu option by label.
  function clickAddMenuOption(label: string): void {
    const addBtn = Array.from(parent.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Add")) as HTMLButtonElement | undefined;
    expect(addBtn).toBeTruthy();
    addBtn!.click();
    const menuItems = Array.from(parent.querySelectorAll(".atel-layer-add-menu__item")) as HTMLButtonElement[];
    expect(menuItems.length).toBeGreaterThan(0);
    const target = menuItems.find((i) => i.textContent?.includes(label));
    expect(target, `menu option "${label}" should exist`).toBeTruthy();
    target!.click();
  }

  it("adds a new shape layer via Add → Shape (preserves default-rect path)", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    clickAddMenuOption("Shape");
    expect(doc.layers.length).toBe(3);
    const added = doc.layers[2];
    expect(added.visual.type).toBe("shape");
    expect(docChanged).toBeGreaterThan(0);
  });

  it("adds a Text layer via the menu with Inter 32px centered style", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    clickAddMenuOption("Text");
    expect(doc.layers.length).toBe(3);
    const added = doc.layers[2];
    expect(added.visual.type).toBe("text");
    if (added.visual.type === "text") {
      expect(added.visual.content).toBe("Text");
      expect(added.visual.style.fontFamily).toBe("Inter");
      expect(added.visual.style.fontSize).toBe(32);
      expect(added.visual.style.textAlign).toBe("center");
      expect(added.visual.style.color).toBe("#F5F5F7");
    }
    expect(added.anchorPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(selectedId).toBe(added.id);
  });

  it("opens a file picker (does NOT immediately add a layer) when Add → Image is clicked", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    const initialCount = doc.layers.length;
    clickAddMenuOption("Image");
    // No layer is appended synchronously — the user must pick a file
    // first, which routes through the createImageLayerFromFile helper
    // (covered separately in the ImageDrop suite below). Cancelling
    // the picker is a no-op.
    expect(doc.layers.length).toBe(initialCount);
    // The file picker is a hidden <input> attached to document.body;
    // confirm it's there and accepts images.
    const picker = document.body.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(picker).toBeTruthy();
    expect(picker!.accept).toBe("image/*");
    picker!.remove();
  });

  it("adds a Handle layer via the menu with tags:['overlay']", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    clickAddMenuOption("Handle");
    const added = doc.layers[doc.layers.length - 1];
    expect(added.visual.type).toBe("text");
    expect(added.tags).toEqual(["overlay"]);
    if (added.visual.type === "text") {
      expect(added.visual.content).toBe("@username");
      expect(added.visual.style.fontWeight).toBe(600);
      expect(added.visual.style.fontSize).toBe(24);
    }
  });

  it("adds a Page Number layer via the menu with tags:['overlay']", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    clickAddMenuOption("Page Number");
    const added = doc.layers[doc.layers.length - 1];
    expect(added.visual.type).toBe("text");
    expect(added.tags).toEqual(["overlay"]);
    if (added.visual.type === "text") {
      expect(added.visual.content).toBe("01/05");
      expect(added.visual.style.fontSize).toBe(18);
      expect(added.visual.style.color).toBe("#9CA3AF");
    }
  });
});

// ─── ImageDrop helper ─────────────────────────────────────────
//
// Pure-function tests for the headline image-drop pipeline. The full
// async createImageLayerFromFile path is covered by manual browser
// testing (happy-dom doesn't decode Image.src=dataUrl) — these tests
// exercise the synchronous building blocks: fit math + layer/asset
// construction + background replacement.

describe("ImageDrop helpers", async () => {
  const { fitImageToCanvas, buildImageLayer } = await import("./utils/image-drop.js");

  it("fits a landscape image into a square canvas at canvas width with preserved aspect", () => {
    const fit = fitImageToCanvas(
      { width: 1080, height: 1080 },
      { naturalWidth: 3000, naturalHeight: 2000 },
    );
    expect(fit.bounds.width).toBe(1080);
    expect(fit.bounds.height).toBe(720);
    expect(fit.frame).toEqual({ x: 540, y: 540 });
  });

  it("fits a portrait image into a square canvas at canvas height with preserved aspect", () => {
    const fit = fitImageToCanvas(
      { width: 1080, height: 1080 },
      { naturalWidth: 2000, naturalHeight: 3000 },
    );
    expect(fit.bounds.width).toBe(720);
    expect(fit.bounds.height).toBe(1080);
    expect(fit.frame).toEqual({ x: 540, y: 540 });
  });

  it("buildImageLayer creates an ImageVisual layer with the data URL as src and a 0.5/0.5 anchor", () => {
    const doc = makeTestDoc();
    const dataUrl = "data:image/png;base64,iVBORw0AAA";
    const layer = buildImageLayer(doc, {
      dataUrl,
      naturalWidth: 200,
      naturalHeight: 200,
    });
    expect(layer.visual.type).toBe("image");
    if (layer.visual.type === "image") {
      expect(layer.visual.src).toBe(dataUrl);
      expect(layer.visual.assetId.length).toBeGreaterThan(0);
    }
    expect(layer.anchorPoint).toEqual({ x: 0.5, y: 0.5 });
    // Unshifted onto the layers array — bottom of z-stack (behind overlays).
    expect(doc.layers[0]).toBe(layer);
  });

  it("buildImageLayer registers a matching entry in doc.assets keyed by the layer's assetId", () => {
    const doc = makeTestDoc();
    expect(doc.assets).toBeUndefined();
    const dataUrl = "data:image/png;base64,iVBORw0AAA";
    const layer = buildImageLayer(doc, {
      dataUrl,
      naturalWidth: 100,
      naturalHeight: 100,
    });
    expect(doc.assets).toBeDefined();
    if (layer.visual.type === "image") {
      const asset = doc.assets![layer.visual.assetId];
      expect(asset).toBeDefined();
      expect(asset.type).toBe("image");
      expect(asset.src).toBe(dataUrl);
    }
  });

  it("buildImageLayer with replaceBackground:true swaps the welcome scaffold's background layer in place", () => {
    const doc = makeTestDoc();
    // Simulate the welcome.atelier scaffold: layer[0] is a placeholder
    // named "background" — the dropped image should fill it in.
    doc.layers.unshift({
      id: "background",
      visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#333" } },
      frame: { x: 0, y: 0 },
      bounds: { width: doc.canvas.width, height: doc.canvas.height },
      opacity: 1,
    });
    const initialCount = doc.layers.length;

    const layer = buildImageLayer(doc, {
      dataUrl: "data:image/png;base64,iVBORw0AAA",
      naturalWidth: 100,
      naturalHeight: 100,
      replaceBackground: true,
    });

    // Same count (swap, not insert) and the new layer occupies slot 0.
    expect(doc.layers.length).toBe(initialCount);
    expect(doc.layers[0]).toBe(layer);
    expect(doc.layers[0].id).not.toBe("background");
    // No leftover "background" layer anywhere.
    expect(doc.layers.find((l) => l.id === "background")).toBeUndefined();
  });
});

// ─── PropertyPanel ────────────────────────────────────────────

describe("PropertyPanel", async () => {
  const { PropertyPanel } = await import("./panels/property-panel.js");

  let parent: HTMLElement;
  let changed: number;

  beforeEach(() => {
    parent = document.createElement("div");
    changed = 0;
  });

  it("shows 'Select a layer' when no layer selected", () => {
    const panel = new PropertyPanel(parent, {
      onPropertyChange: () => { changed++; },
    });
    panel.loadDocument(makeTestDoc(), "default");
    panel.selectLayer(null);
    expect(parent.textContent).toContain("Select a layer");
  });

  it("renders property sections when a layer is selected", () => {
    const panel = new PropertyPanel(parent, {
      onPropertyChange: () => { changed++; },
    });
    panel.loadDocument(makeTestDoc(), "default");
    panel.selectLayer("rect-1");
    const sections = parent.querySelectorAll(".atel-prop-section__title");
    const titles = Array.from(sections).map((s) => s.textContent);
    expect(titles).toContain("Position");
    expect(titles).toContain("Size");
    expect(titles).toContain("Transform");
    expect(titles).toContain("Visual");
  });
});

// ─── Export: capability checks ───────────────────────────────

describe("supportsWebCodecs", () => {
  it("returns a boolean", () => {
    // happy-dom doesn't have VideoEncoder, so expect false
    expect(typeof supportsWebCodecs()).toBe("boolean");
  });

  it("returns false in happy-dom (no WebCodecs)", () => {
    expect(supportsWebCodecs()).toBe(false);
  });
});

describe("supportsWebM", () => {
  it("returns false in happy-dom (no WebCodecs)", () => {
    expect(supportsWebM()).toBe(false);
  });
});

describe("supportsGifExport", () => {
  it("always returns true", () => {
    expect(supportsGifExport()).toBe(true);
  });
});

// ─── GifEncoder ──────────────────────────────────────────────

describe("GifEncoder", () => {
  it("produces bytes starting with GIF89a header", () => {
    const enc = createGifEncoder(2, 2);
    // 2x2 red frame
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      pixels[i * 4] = 255;     // R
      pixels[i * 4 + 1] = 0;   // G
      pixels[i * 4 + 2] = 0;   // B
      pixels[i * 4 + 3] = 255; // A
    }
    enc.addFrame(pixels, 10);
    const bytes = enc.finish();

    expect(bytes.length).toBeGreaterThan(13);
    // GIF89a magic
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe("GIF89a");
    // Trailer
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it("creates a valid multi-frame GIF", () => {
    const enc = createGifEncoder(4, 4);
    const pixelCount = 4 * 4 * 4;

    // Frame 1: blue
    const blue = new Uint8ClampedArray(pixelCount);
    for (let i = 0; i < 16; i++) {
      blue[i * 4 + 2] = 255;
      blue[i * 4 + 3] = 255;
    }
    enc.addFrame(blue, 5);

    // Frame 2: green
    const green = new Uint8ClampedArray(pixelCount);
    for (let i = 0; i < 16; i++) {
      green[i * 4 + 1] = 255;
      green[i * 4 + 3] = 255;
    }
    enc.addFrame(green, 5);

    const bytes = enc.finish();
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe("GIF89a");
    // Should contain NETSCAPE2.0 extension for looping
    const text = new TextDecoder("ascii").decode(bytes);
    expect(text).toContain("NETSCAPE2.0");
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it("handles finish() with no frames", () => {
    const enc = createGifEncoder(1, 1);
    const bytes = enc.finish();
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe("GIF89a");
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });
});

// ─── CanvasPanel: autoplay ───────────────────────────────────
//
// Regression guard for the "open file slams play / editing fights the scrubber"
// bug. The play button textContent reflects the current player state:
//   "▶"           → paused (the right-pointing triangle, U+25B6)
//   "❚❚"     → playing (two vertical bars, U+275A x2)
//
// happy-dom's HTMLCanvasElement.getContext returns null, so the panel's
// renderAt() would crash on `ctx.fillStyle = ...`. We stub a minimal 2D
// context (only the methods touched on the test path) by monkey-patching
// HTMLCanvasElement.prototype.getContext for the duration of this suite.

describe("CanvasPanel autoplay", async () => {
  const { CanvasPanel } = await import("./panels/canvas-panel.js");

  let parent: HTMLElement;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    parent = document.createElement("div");
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const stubCtx: Partial<CanvasRenderingContext2D> = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      rect: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      drawImage: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: () => ({ width: 0 } as TextMetrics),
      setTransform: () => {},
      resetTransform: () => {},
      transform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} } as unknown as CanvasGradient),
      createRadialGradient: () => ({ addColorStop: () => {} } as unknown as CanvasGradient),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData),
      putImageData: () => {},
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
      font: "",
      textAlign: "left" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
      lineCap: "butt" as CanvasLineCap,
      lineJoin: "miter" as CanvasLineJoin,
      miterLimit: 10,
      globalCompositeOperation: "source-over" as GlobalCompositeOperation,
      shadowBlur: 0,
      shadowColor: "",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    };
    HTMLCanvasElement.prototype.getContext = function (type: string) {
      if (type === "2d") return stubCtx as CanvasRenderingContext2D;
      return null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("does NOT autoplay by default — loadDocument leaves player paused", () => {
    const panel = new CanvasPanel(parent, {});
    panel.loadDocument(makeTestDoc());
    const btn = parent.querySelector(".atel-playback__btn") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    // Paused glyph
    expect(btn.textContent).toBe("▶");
    panel.destroy();
  });

  it("does NOT autoplay when autoplay:false is passed explicitly", () => {
    const panel = new CanvasPanel(parent, { autoplay: false });
    panel.loadDocument(makeTestDoc());
    const btn = parent.querySelector(".atel-playback__btn") as HTMLButtonElement;
    expect(btn.textContent).toBe("▶");
    panel.destroy();
  });

  it("autoplays when autoplay:true is opted into (Showcase behavior)", () => {
    const panel = new CanvasPanel(parent, { autoplay: true });
    panel.loadDocument(makeTestDoc());
    const btn = parent.querySelector(".atel-playback__btn") as HTMLButtonElement;
    // Playing glyph (two vertical bars)
    expect(btn.textContent).toBe("❚❚");
    panel.destroy();
  });
});

// ─── AtelierStudio.applyMutation ─────────────────────────────
//
// Foundation for the live LLM↔human mutation bridge (task #10). Verifies the
// in-memory mutation channel: external callers can swap the rendered doc
// without round-tripping through onDocumentChange (which would echo the
// change back into the bridge as a "human" edit and loop).
//
// Requires the same canvas getContext stub as the CanvasPanel suite —
// AtelierStudio mounts a CanvasPanel internally.

describe("AtelierStudio.applyMutation", async () => {
  const { AtelierStudio } = await import("./studio.js");

  let container: HTMLElement;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const stubCtx: Partial<CanvasRenderingContext2D> = {
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      scale: () => {}, clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
      beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
      arc: () => {}, rect: () => {}, fill: () => {}, stroke: () => {}, clip: () => {},
      drawImage: () => {}, fillText: () => {}, strokeText: () => {},
      measureText: () => ({ width: 0 } as TextMetrics),
      setTransform: () => {}, resetTransform: () => {}, transform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} } as unknown as CanvasGradient),
      createRadialGradient: () => ({ addColorStop: () => {} } as unknown as CanvasGradient),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData),
      putImageData: () => {},
      fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, font: "",
      textAlign: "left" as CanvasTextAlign,
      textBaseline: "alphabetic" as CanvasTextBaseline,
      lineCap: "butt" as CanvasLineCap, lineJoin: "miter" as CanvasLineJoin,
      miterLimit: 10,
      globalCompositeOperation: "source-over" as GlobalCompositeOperation,
      shadowBlur: 0, shadowColor: "", shadowOffsetX: 0, shadowOffsetY: 0,
    };
    HTMLCanvasElement.prototype.getContext = function (type: string) {
      if (type === "2d") return stubCtx as CanvasRenderingContext2D;
      return null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function makeDocWithStates(): AtelierDocument {
    const doc = makeTestDoc();
    doc.states.hover = { duration: 60, deltas: [] };
    return doc;
  }

  it("updates the rendered doc when applied", () => {
    const studio = new AtelierStudio(container);
    const initial = makeTestDoc();
    studio.loadDocument(initial);

    const next = makeTestDoc();
    next.name = "after-llm-edit";
    next.canvas.width = 800;

    studio.applyMutation({ type: "doc:replace", doc: next, source: "llm" });

    const current = studio.getDocument();
    expect(current?.name).toBe("after-llm-edit");
    expect(current?.canvas.width).toBe(800);

    studio.destroy();
  });

  it("does NOT fire onDocumentChange for the LLM-side mutation", () => {
    let calls = 0;
    const studio = new AtelierStudio(container, {
      onDocumentChange: () => { calls++; },
    });
    studio.loadDocument(makeTestDoc());

    const next = makeTestDoc();
    next.name = "silent";
    studio.applyMutation({ type: "doc:replace", doc: next, source: "llm" });

    expect(calls).toBe(0);

    studio.destroy();
  });

  it("re-enables onDocumentChange for subsequent human edits (one-tick suppression)", async () => {
    let calls = 0;
    const studio = new AtelierStudio(container, {
      onDocumentChange: () => { calls++; },
    });
    studio.loadDocument(makeTestDoc());

    const next = makeTestDoc();
    next.name = "from-llm";
    studio.applyMutation({ type: "doc:replace", doc: next, source: "llm" });
    expect(calls).toBe(0);

    // Drain the microtask queue so suppressNotify clears.
    await Promise.resolve();

    // Now simulate a human edit by toggling the layer panel into adding a layer
    // — that invokes the same onDocChange path a real GUI edit would.
    const addBtn = Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Add")) as HTMLButtonElement | undefined;
    expect(addBtn).toBeTruthy();
    addBtn!.click();
    const menuItems = Array.from(container.querySelectorAll(".atel-layer-add-menu__item")) as HTMLButtonElement[];
    expect(menuItems.length).toBeGreaterThan(0);
    menuItems[0].click();

    expect(calls).toBeGreaterThan(0);

    studio.destroy();
  });

  it("preserves stateName when the state still exists in the new doc", () => {
    const studio = new AtelierStudio(container);
    studio.loadDocument(makeDocWithStates());

    // Select the "hover" state via the toolbar selector.
    const select = container.querySelector("select.atel-toolbar__select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    select.value = "hover";
    select.dispatchEvent(new Event("change"));

    // Apply an LLM mutation that still has the "hover" state.
    const next = makeDocWithStates();
    next.name = "still-has-hover";
    studio.applyMutation({ type: "doc:replace", doc: next, source: "llm" });

    // Toolbar selector should still read "hover".
    const selectAfter = container.querySelector("select.atel-toolbar__select") as HTMLSelectElement;
    expect(selectAfter.value).toBe("hover");

    studio.destroy();
  });

  it("preserves selected layer id when the layer still exists", () => {
    const studio = new AtelierStudio(container);
    studio.loadDocument(makeTestDoc());

    // Select "text-1" via the layer panel.
    const items = container.querySelectorAll(".atel-layer-item");
    expect(items.length).toBeGreaterThan(1);
    (items[1] as HTMLElement).click();

    // Apply an LLM mutation that keeps "text-1" present (we just rename).
    const next = makeTestDoc();
    next.name = "renamed";
    studio.applyMutation({ type: "doc:replace", doc: next, source: "llm" });

    // After mutation the same layer should still be highlighted as selected.
    const after = container.querySelectorAll(".atel-layer-item--selected");
    expect(after.length).toBe(1);
    // The selected item should still be the text-1 layer (second in the list).
    const allItems = container.querySelectorAll(".atel-layer-item");
    expect(allItems[1].classList.contains("atel-layer-item--selected")).toBe(true);

    studio.destroy();
  });
});
