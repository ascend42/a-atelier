import { describe, it, expect } from "vitest";
import { CANVAS_SIZE_PRESETS, findPresetMatch } from "./canvas-size-presets.js";

describe("CANVAS_SIZE_PRESETS", () => {
  it("ships exactly 4 presets (v1 closed list)", () => {
    expect(CANVAS_SIZE_PRESETS).toHaveLength(4);
  });

  it("all presets have positive width and height", () => {
    for (const p of CANVAS_SIZE_PRESETS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });

  it("all preset labels are unique", () => {
    const labels = CANVAS_SIZE_PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("findPresetMatch", () => {
  it("returns the portrait preset for 1080×1920", () => {
    const p = findPresetMatch(1080, 1920);
    expect(p).toBeDefined();
    expect(p?.width).toBe(1080);
    expect(p?.height).toBe(1920);
    expect(p?.label).toMatch(/Portrait/);
  });

  it("returns the landscape preset for 1920×1080", () => {
    const p = findPresetMatch(1920, 1080);
    expect(p).toBeDefined();
    expect(p?.width).toBe(1920);
    expect(p?.height).toBe(1080);
    expect(p?.label).toMatch(/Landscape/);
  });

  it("returns the square preset for 1080×1080", () => {
    const p = findPresetMatch(1080, 1080);
    expect(p).toBeDefined();
    expect(p?.label).toMatch(/Square/);
  });

  it("returns the feed preset for 1080×1350", () => {
    const p = findPresetMatch(1080, 1350);
    expect(p).toBeDefined();
    expect(p?.label).toMatch(/Feed/);
  });

  it("returns undefined for non-preset dimensions (custom)", () => {
    expect(findPresetMatch(999, 999)).toBeUndefined();
    expect(findPresetMatch(800, 600)).toBeUndefined();
  });
});
