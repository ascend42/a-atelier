import { createDocument } from "@atelier/core";
import type { AtelierDocument } from "@atelier/types";
import type { Example } from "./index.js";

export const compositionExamples: Example[] = [
  {
    id: "composition-stagger",
    name: "Stagger Entrance",
    description:
      "Five rectangles enter from the bottom with staggered timing, creating a wave effect",
    category: "Composition",
    create: (): AtelierDocument => {
      const colors = ["#e94560", "#0ea5e9", "#22c55e", "#f59e0b", "#533483"];
      const builder = createDocument("Stagger Entrance", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#141420",
      });

      // Create 5 bars
      for (let i = 0; i < 5; i++) {
        builder.addLayer({
          id: `bar-${i}`,
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 8 },
            fill: { type: "solid", color: colors[i] },
          },
          frame: { x: 80 + i * 100, y: 400 },
          bounds: { width: 60, height: 180 },
          opacity: 0,
        });
      }

      builder.addState("enter", { duration: 180 });

      // Staggered entrance — each bar delayed by 15 frames
      for (let i = 0; i < 5; i++) {
        const start = 10 + i * 15;
        const end = start + 50;

        builder.addDelta("enter", {
          layer: `bar-${i}`,
          property: "frame.y",
          range: [start, end],
          from: 400,
          to: 120,
          easing: "ease-out",
        });

        builder.addDelta("enter", {
          layer: `bar-${i}`,
          property: "opacity",
          range: [start, end],
          from: 0,
          to: 1,
          easing: "ease-out",
        });
      }

      return builder.build();
    },
  },
  {
    id: "composition-choreography",
    name: "Choreography",
    description:
      "Multiple shapes execute a coordinated sequence: slide, rotate, scale, and fade in concert",
    category: "Composition",
    create: (): AtelierDocument => {
      return createDocument("Choreography", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#141420",
      })
        // Central circle
        .addLayer({
          id: "center",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#0ea5e9" },
          },
          frame: { x: 270, y: 170 },
          bounds: { width: 60, height: 60 },
          opacity: 0,
        })
        // Top-left rect
        .addLayer({
          id: "tl",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 4 },
            fill: { type: "solid", color: "#e94560" },
          },
          frame: { x: 300, y: 200 },
          bounds: { width: 40, height: 40 },
          opacity: 0,
        })
        // Top-right rect
        .addLayer({
          id: "tr",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 4 },
            fill: { type: "solid", color: "#22c55e" },
          },
          frame: { x: 300, y: 200 },
          bounds: { width: 40, height: 40 },
          opacity: 0,
        })
        // Bottom-left rect
        .addLayer({
          id: "bl",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 4 },
            fill: { type: "solid", color: "#f59e0b" },
          },
          frame: { x: 300, y: 200 },
          bounds: { width: 40, height: 40 },
          opacity: 0,
        })
        // Bottom-right rect
        .addLayer({
          id: "br",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 4 },
            fill: { type: "solid", color: "#533483" },
          },
          frame: { x: 300, y: 200 },
          bounds: { width: 40, height: 40 },
          opacity: 0,
        })
        .addState("dance", { duration: 240 })

        // Phase 1: Center circle appears and scales up (0-40)
        .addDelta("dance", {
          layer: "center",
          property: "opacity",
          range: [0, 30],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "center",
          property: "scale.x",
          range: [0, 40],
          from: 0.2,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "center",
          property: "scale.y",
          range: [0, 40],
          from: 0.2,
          to: 1,
          easing: "ease-out",
        })

        // Phase 2: Four rects appear and spread outward (30-80)
        .addDelta("dance", {
          layer: "tl",
          property: "opacity",
          range: [30, 50],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "tl",
          property: "frame.x",
          range: [30, 80],
          from: 300,
          to: 160,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "tl",
          property: "frame.y",
          range: [30, 80],
          from: 200,
          to: 100,
          easing: "ease-out",
        })

        .addDelta("dance", {
          layer: "tr",
          property: "opacity",
          range: [35, 55],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "tr",
          property: "frame.x",
          range: [35, 85],
          from: 300,
          to: 400,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "tr",
          property: "frame.y",
          range: [35, 85],
          from: 200,
          to: 100,
          easing: "ease-out",
        })

        .addDelta("dance", {
          layer: "bl",
          property: "opacity",
          range: [40, 60],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "bl",
          property: "frame.x",
          range: [40, 90],
          from: 300,
          to: 160,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "bl",
          property: "frame.y",
          range: [40, 90],
          from: 200,
          to: 280,
          easing: "ease-out",
        })

        .addDelta("dance", {
          layer: "br",
          property: "opacity",
          range: [45, 65],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "br",
          property: "frame.x",
          range: [45, 95],
          from: 300,
          to: 400,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "br",
          property: "frame.y",
          range: [45, 95],
          from: 200,
          to: 280,
          easing: "ease-out",
        })

        // Phase 3: Everything rotates together (100-180)
        .addDelta("dance", {
          layer: "tl",
          property: "rotation",
          range: [100, 180],
          from: 0,
          to: 180,
          easing: "ease-in-out",
        })
        .addDelta("dance", {
          layer: "tr",
          property: "rotation",
          range: [100, 180],
          from: 0,
          to: 180,
          easing: "ease-in-out",
        })
        .addDelta("dance", {
          layer: "bl",
          property: "rotation",
          range: [100, 180],
          from: 0,
          to: 180,
          easing: "ease-in-out",
        })
        .addDelta("dance", {
          layer: "br",
          property: "rotation",
          range: [100, 180],
          from: 0,
          to: 180,
          easing: "ease-in-out",
        })
        .addDelta("dance", {
          layer: "center",
          property: "rotation",
          range: [100, 180],
          from: 0,
          to: 360,
          easing: "ease-in-out",
        })

        // Phase 4: Scale pulse on center (180-240)
        .addDelta("dance", {
          layer: "center",
          property: "scale.x",
          range: [180, 210],
          from: 1,
          to: 1.5,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "center",
          property: "scale.y",
          range: [180, 210],
          from: 1,
          to: 1.5,
          easing: "ease-out",
        })
        .addDelta("dance", {
          layer: "center",
          property: "scale.x",
          range: [211, 240],
          from: 1.5,
          to: 1,
          easing: "ease-in",
        })
        .addDelta("dance", {
          layer: "center",
          property: "scale.y",
          range: [211, 240],
          from: 1.5,
          to: 1,
          easing: "ease-in",
        })
        .build();
    },
  },
];
