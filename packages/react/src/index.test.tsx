import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import type { AtelierDocument } from "@atelier/types";
import { Animation } from "./Animation.js";
import { AnimationPlayer } from "./player.js";

// ── Mock canvas context ───────────────────────────────────

function createMockCanvas(): HTMLCanvasElement {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    ellipse: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "",
    textAlign: "left",
    textBaseline: "top",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineDashOffset: 0,
    canvas: { width: 100, height: 100 },
  };

  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return canvas;
}

// ── Test document ─────────────────────────────────────────

const testDoc: AtelierDocument = {
  version: "1.0",
  name: "react-test",
  canvas: { width: 200, height: 200, fps: 30 },
  layers: [
    {
      id: "rect",
      visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#FF0000" } },
      frame: { x: 0, y: 0 },
      bounds: { width: 100, height: 100 },
    },
  ],
  states: {
    intro: {
      duration: 30,
      deltas: [
        {
          layer: "rect",
          property: "opacity",
          range: [0, 29] as [number, number],
          from: 0,
          to: 1,
        },
      ],
    },
    hover: {
      duration: 15,
      deltas: [],
    },
  },
};

// ── Mock requestAnimationFrame ────────────────────────────

let rafCallbacks: Array<(time: number) => void> = [];
let rafId = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: (time: number) => void) => {
    rafCallbacks.push(cb);
    return ++rafId;
  });
  vi.stubGlobal("cancelAnimationFrame", (_id: number) => {
    // Just clear callbacks
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Animation Component ──────────────────────────────────

describe("Animation component", () => {
  it("renders a canvas element", () => {
    const { container } = render(<Animation document={testDoc} autoplay={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeDefined();
    expect(canvas!.width).toBe(200);
    expect(canvas!.height).toBe(200);
  });

  it("accepts custom width and height", () => {
    const { container } = render(<Animation document={testDoc} width={400} height={300} autoplay={false} />);
    const canvas = container.querySelector("canvas");
    expect(canvas!.width).toBe(400);
    expect(canvas!.height).toBe(300);
  });

  it("accepts className and style", () => {
    const { container } = render(
      <Animation document={testDoc} className="my-anim" style={{ border: "1px solid red" }} autoplay={false} />
    );
    const canvas = container.querySelector("canvas");
    expect(canvas!.className).toBe("my-anim");
    expect(canvas!.style.border).toBe("1px solid red");
  });

  it("unmounts cleanly", () => {
    const { unmount } = render(<Animation document={testDoc} autoplay={false} />);
    expect(() => unmount()).not.toThrow();
  });
});

// ── AnimationPlayer ──────────────────────────────────────

describe("AnimationPlayer", () => {
  it("creates with correct initial state", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false });
    expect(player.currentFrame).toBe(0);
    expect(player.isPlaying).toBe(false);
    expect(player.duration).toBe(30);
    expect(player.currentState).toBe("intro");
    expect(player.stateNames).toEqual(["intro", "hover"]);
    player.destroy();
  });

  it("autoplays by default", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas);
    expect(player.isPlaying).toBe(true);
    player.destroy();
  });

  it("play and pause", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false });
    expect(player.isPlaying).toBe(false);
    player.play();
    expect(player.isPlaying).toBe(true);
    player.pause();
    expect(player.isPlaying).toBe(false);
    player.destroy();
  });

  it("seek clamps to valid range", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false });
    player.seek(10);
    expect(player.currentFrame).toBe(10);
    player.seek(100);
    expect(player.currentFrame).toBe(29); // duration - 1
    player.seek(-5);
    expect(player.currentFrame).toBe(0);
    player.destroy();
  });

  it("setState switches to a different state", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false });
    player.setState("hover");
    expect(player.currentState).toBe("hover");
    expect(player.currentFrame).toBe(0);
    expect(player.duration).toBe(15);
    player.destroy();
  });

  it("setState throws for nonexistent state", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false });
    expect(() => player.setState("nonexistent")).toThrow("not found");
    player.destroy();
  });

  it("calls onFrame callback", () => {
    const canvas = createMockCanvas();
    const onFrame = vi.fn();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: true, onFrame });

    // Trigger first rAF
    if (rafCallbacks.length > 0) {
      rafCallbacks[0](0);
    }
    expect(onFrame).toHaveBeenCalledWith(0);
    player.destroy();
  });

  it("calls onComplete when animation ends", () => {
    const canvas = createMockCanvas();
    const onComplete = vi.fn();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false, onComplete });

    player.seek(29); // last frame
    player.play();

    // First tick: renders at frame 29
    if (rafCallbacks.length > 0) {
      rafCallbacks[rafCallbacks.length - 1](0);
    }
    // Second tick: tries to advance past end
    if (rafCallbacks.length > 0) {
      rafCallbacks[rafCallbacks.length - 1](100);
    }

    expect(onComplete).toHaveBeenCalled();
    expect(player.isPlaying).toBe(false);
    player.destroy();
  });

  it("loops when loop option is set", () => {
    const canvas = createMockCanvas();
    const onFrame = vi.fn();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false, loop: true, onFrame });

    player.seek(29); // last frame
    player.play();

    // First tick
    if (rafCallbacks.length > 0) {
      rafCallbacks[rafCallbacks.length - 1](0);
    }
    // Second tick: should loop to 0
    if (rafCallbacks.length > 0) {
      rafCallbacks[rafCallbacks.length - 1](100);
    }

    expect(player.currentFrame).toBe(0);
    expect(player.isPlaying).toBe(true);
    player.destroy();
  });

  it("renderCurrentFrame does not throw", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas, { autoplay: false });
    expect(() => player.renderCurrentFrame()).not.toThrow();
    player.destroy();
  });

  it("destroy stops playback", () => {
    const canvas = createMockCanvas();
    const player = new AnimationPlayer(testDoc, canvas);
    expect(player.isPlaying).toBe(true);
    player.destroy();
    expect(player.isPlaying).toBe(false);
  });
});
