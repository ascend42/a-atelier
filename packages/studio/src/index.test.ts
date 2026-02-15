import { describe, it, expect, beforeEach } from "vitest";
import { History } from "./history.js";
import { NumberInput } from "./controls/number-input.js";
import { ColorPicker } from "./controls/color-picker.js";
import { SliderInput } from "./controls/slider-input.js";
import { SelectInput } from "./controls/select-input.js";
import type { AtelierDocument } from "@atelier/types";
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
    canvas: { width: 400, height: 300 },
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
        visual: { type: "text", content: "Hello", style: { fontSize: 24, color: "#ffffff" } },
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
  } as AtelierDocument;
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

  it("adds a new layer via the add button", () => {
    const doc = makeTestDoc();
    createPanel(doc);
    const buttons = Array.from(parent.querySelectorAll("button"));
    const addBtn = buttons.find((b) => b.textContent?.includes("Add"))!;
    expect(addBtn).toBeTruthy();
    addBtn.click();
    expect(doc.layers.length).toBe(3);
    expect(docChanged).toBeGreaterThan(0);
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
