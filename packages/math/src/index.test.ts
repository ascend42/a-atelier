import { describe, it, expect } from "vitest";
import {
  linear,
  cubicBezier,
  easeIn,
  easeOut,
  easeInOut,
  step,
  spring,
  lerp,
  clamp,
  lerpArray,
  remap,
  hexToRgba,
  rgbaToHex,
  lerpRgba,
  rgbaToHsla,
  hslaToRgba,
  lerpHsla,
} from "./index.js";

describe("easing", () => {
  it("linear returns t unchanged", () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
  });

  it("cubicBezier endpoints are 0 and 1", () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("easeIn starts slow", () => {
    expect(easeIn(0.5)).toBeLessThan(0.5);
  });

  it("easeOut ends slow", () => {
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it("easeInOut is symmetric around 0.5", () => {
    const v = easeInOut(0.5);
    expect(v).toBeCloseTo(0.5, 1);
  });

  it("step creates discrete jumps", () => {
    const s = step(4, "end");
    expect(s(0)).toBe(0);
    expect(s(0.24)).toBe(0);
    expect(s(0.25)).toBe(0.25);
    expect(s(0.5)).toBe(0.5);
    expect(s(1)).toBe(1);
  });

  it("step start position jumps immediately", () => {
    const s = step(4, "start");
    expect(s(0)).toBe(0.25);
    expect(s(0.01)).toBe(0.25);
  });
});

describe("spring", () => {
  it("returns 0 at t=0 and 1 at t=1", () => {
    const s = spring();
    expect(s(0)).toBe(0);
    expect(s(1)).toBe(1);
  });

  it("underdamped spring overshoots", () => {
    const s = spring({ mass: 1, stiffness: 100, damping: 5 });
    // Should overshoot past 1 at some point
    let maxVal = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      maxVal = Math.max(maxVal, s(t));
    }
    expect(maxVal).toBeGreaterThan(1);
  });

  it("overdamped spring does not overshoot", () => {
    const s = spring({ mass: 1, stiffness: 100, damping: 50 });
    for (let t = 0; t <= 1; t += 0.01) {
      expect(s(t)).toBeLessThanOrEqual(1.001); // small float tolerance
    }
  });
});

describe("lerp", () => {
  it("interpolates between two values", () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 1)).toBe(100);
  });

  it("clamp restricts range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("lerpArray interpolates element-wise", () => {
    expect(lerpArray([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
  });

  it("remap maps between ranges", () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, 0, 10, 100, 200)).toBe(100);
  });
});

describe("color", () => {
  it("hexToRgba parses 6-digit hex", () => {
    expect(hexToRgba("#FF0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it("hexToRgba parses 3-digit hex", () => {
    expect(hexToRgba("#F00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it("hexToRgba parses 8-digit hex with alpha", () => {
    const c = hexToRgba("#FF000080");
    expect(c.r).toBe(255);
    expect(c.a).toBeCloseTo(0.502, 2);
  });

  it("rgbaToHex converts back", () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000");
  });

  it("lerpRgba blends colors", () => {
    const a = { r: 0, g: 0, b: 0, a: 1 };
    const b = { r: 255, g: 255, b: 255, a: 1 };
    const mid = lerpRgba(a, b, 0.5);
    expect(mid.r).toBeCloseTo(127.5);
    expect(mid.g).toBeCloseTo(127.5);
  });

  it("RGBA <-> HSLA roundtrip", () => {
    const original = { r: 255, g: 0, b: 0, a: 1 };
    const hsla = rgbaToHsla(original);
    expect(hsla.h).toBeCloseTo(0);
    expect(hsla.s).toBeCloseTo(100);
    expect(hsla.l).toBeCloseTo(50);

    const back = hslaToRgba(hsla);
    expect(back.r).toBeCloseTo(255, 0);
    expect(back.g).toBeCloseTo(0, 0);
    expect(back.b).toBeCloseTo(0, 0);
  });

  it("lerpHsla takes shortest hue path", () => {
    const a = { h: 350, s: 100, l: 50, a: 1 };
    const b = { h: 10, s: 100, l: 50, a: 1 };
    const mid = lerpHsla(a, b, 0.5);
    // Should go through 0/360, not through 180
    expect(mid.h).toBeCloseTo(0, 0);
  });
});
