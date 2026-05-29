import { describe, it, expect } from "vitest";
import { computeLetterboxFit } from "./canvas-panel.js";

// ─── computeLetterboxFit ─────────────────────────────────────────
//
// Pure helper extracted from CanvasPanel.applyLetterboxFit so the
// scaling math can be tested without a DOM. Picks the smaller of
// the two parent/canvas ratios so the canvas always fits and the
// aspect ratio is preserved.

describe("computeLetterboxFit", () => {
  it("portrait canvas fits inside a wider-than-tall parent", () => {
    // 1080×1920 portrait into 800×1000 parent.
    // scale = min(800/1080, 1000/1920) = min(0.7407, 0.5208) = 0.5208
    const fit = computeLetterboxFit(1080, 1920, 800, 1000);
    expect(fit.scale).toBeCloseTo(1000 / 1920, 5);
    expect(fit.width).toBeCloseTo(1080 * (1000 / 1920), 3);
    expect(fit.height).toBeCloseTo(1000, 3);
  });

  it("landscape canvas in a smaller parent is width-bound when width is the tighter axis", () => {
    // 1920×1080 landscape into 800×600 parent.
    // 800/1920 = 0.4166…, 600/1080 = 0.5555… → width-bound.
    const fit = computeLetterboxFit(1920, 1080, 800, 600);
    expect(fit.scale).toBeCloseTo(800 / 1920, 5);
    expect(fit.width).toBeCloseTo(800, 3);
    expect(fit.height).toBeCloseTo(1080 * (800 / 1920), 3); // ~450
  });

  it("square canvas in a portrait parent fits to width", () => {
    // 1080×1080 square into 600×800 parent.
    // scale = min(600/1080, 800/1080) = 600/1080 → width-bound; the
    // resulting display is 600×600 (still square because we preserve
    // aspect — height shrinks to match the width-bound scale).
    const fit = computeLetterboxFit(1080, 1080, 600, 800);
    expect(fit.scale).toBeCloseTo(600 / 1080, 5);
    expect(fit.width).toBeCloseTo(600, 3);
    expect(fit.height).toBeCloseTo(600, 3);
  });

  it("canvas larger than parent in both dims is scaled down preserving aspect", () => {
    const fit = computeLetterboxFit(2000, 1000, 400, 400);
    // 400/2000 = 0.2, 400/1000 = 0.4 → width-bound, scale = 0.2
    expect(fit.scale).toBeCloseTo(0.2, 5);
    expect(fit.width).toBeCloseTo(400, 3);
    expect(fit.height).toBeCloseTo(200, 3);
    expect(fit.width / fit.height).toBeCloseTo(2000 / 1000, 5);
  });

  it("canvas smaller than parent in both dims is scaled UP preserving aspect (no minimum clamp)", () => {
    // 100×200 inside 800×800 parent → 800/100=8, 800/200=4 → height-bound, scale=4.
    const fit = computeLetterboxFit(100, 200, 800, 800);
    expect(fit.scale).toBeCloseTo(4, 5);
    expect(fit.width).toBeCloseTo(400, 3);
    expect(fit.height).toBeCloseTo(800, 3);
    expect(fit.width / fit.height).toBeCloseTo(100 / 200, 5);
  });

  it("zero canvas width collapses to zeros", () => {
    expect(computeLetterboxFit(0, 100, 800, 600)).toEqual({ width: 0, height: 0, scale: 0 });
  });

  it("zero canvas height collapses to zeros", () => {
    expect(computeLetterboxFit(100, 0, 800, 600)).toEqual({ width: 0, height: 0, scale: 0 });
  });

  it("zero parent width collapses to zeros", () => {
    expect(computeLetterboxFit(100, 100, 0, 600)).toEqual({ width: 0, height: 0, scale: 0 });
  });

  it("zero parent height collapses to zeros", () => {
    expect(computeLetterboxFit(100, 100, 800, 0)).toEqual({ width: 0, height: 0, scale: 0 });
  });

  it("negative canvas dimension collapses to zeros", () => {
    expect(computeLetterboxFit(-100, 100, 800, 600)).toEqual({ width: 0, height: 0, scale: 0 });
  });

  it("negative parent dimension collapses to zeros", () => {
    expect(computeLetterboxFit(100, 100, -800, 600)).toEqual({ width: 0, height: 0, scale: 0 });
  });

  it("exact-fit (parent matches canvas) yields scale=1", () => {
    const fit = computeLetterboxFit(800, 600, 800, 600);
    expect(fit.scale).toBeCloseTo(1, 6);
    expect(fit.width).toBeCloseTo(800, 6);
    expect(fit.height).toBeCloseTo(600, 6);
  });

  it("preserves aspect ratio under non-trivial scaling", () => {
    const fit = computeLetterboxFit(1920, 1080, 1234, 789);
    expect(fit.width / fit.height).toBeCloseTo(1920 / 1080, 5);
  });
});
