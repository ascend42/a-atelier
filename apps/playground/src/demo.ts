import { createDocument } from "@a-company/atelier-core";
import type { AtelierDocument } from "@a-company/atelier-types";

/**
 * Create a demo animation that showcases Atelier's capabilities:
 * shapes, text, movement, rotation, opacity fades, and easing.
 */
export function createDemoAnimation(): AtelierDocument {
  return createDocument("Atelier Demo", {
    width: 800,
    height: 600,
    fps: 60,
    background: "#1a1a2e",
  })
    .description("Showcase animation with shapes, colors, and motion")

    // Background rectangle
    .addLayer({
      id: "bg",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: "#1a1a2e" },
      },
      frame: { x: 0, y: 0 },
      bounds: { width: 800, height: 600 },
    })

    // Title text
    .addLayer({
      id: "title",
      visual: {
        type: "text",
        content: "Atelier",
        style: {
          fontFamily: "sans-serif",
          fontSize: 72,
          fontWeight: "bold",
          color: "#ffffff",
          textAlign: "center",
        },
      },
      frame: { x: 400, y: 100 },
      bounds: { width: 400, height: 100 },
      opacity: 0,
    })

    // Animated circle
    .addLayer({
      id: "circle",
      visual: {
        type: "shape",
        shape: { type: "ellipse" },
        fill: { type: "solid", color: "#e94560" },
      },
      frame: { x: 100, y: 300 },
      bounds: { width: 100, height: 100 },
      opacity: 0,
    })

    // Animated rectangle
    .addLayer({
      id: "box",
      visual: {
        type: "shape",
        shape: { type: "rect", cornerRadius: 16 },
        fill: { type: "solid", color: "#0f3460" },
      },
      frame: { x: 350, y: 250 },
      bounds: { width: 120, height: 120 },
      opacity: 0,
    })

    // State: "intro" — 3 seconds at 60fps = 180 frames
    .addState("intro", { duration: 180, description: "Intro animation" })

    // Title fade in (0-60)
    .addDelta("intro", {
      layer: "title",
      property: "opacity",
      range: [0, 60],
      from: 0,
      to: 1,
      easing: "ease-out",
    })

    // Circle appears and moves (30-120)
    .addDelta("intro", {
      layer: "circle",
      property: "opacity",
      range: [30, 60],
      from: 0,
      to: 1,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "circle",
      property: "frame.x",
      range: [30, 120],
      from: 100,
      to: 600,
      easing: "ease-in-out",
    })

    // Box appears and rotates (60-150)
    .addDelta("intro", {
      layer: "box",
      property: "opacity",
      range: [60, 90],
      from: 0,
      to: 1,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "box",
      property: "rotation",
      range: [60, 150],
      from: 0,
      to: 360,
      easing: "ease-in-out",
    })

    // Circle bounces back (120-180)
    .addDelta("intro", {
      layer: "circle",
      property: "frame.x",
      range: [120, 180],
      from: 600,
      to: 350,
      easing: "ease-in-out",
    })

    .build();
}
