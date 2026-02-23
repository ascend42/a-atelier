import { createDocument } from "@a-company/atelier-core";
import type { AtelierDocument } from "@a-company/atelier-types";
import type { Example } from "./index.js";

export const easingExamples: Example[] = [
  {
    id: "easing-race",
    name: "Easing Race",
    description:
      "Seven circles race across the screen, each with a different easing function for direct comparison",
    category: "Easing",
    create: (): AtelierDocument => {
      const rows = [
        { id: "linear", label: "linear", color: "#C75B39", easing: { type: "linear" as const } },
        { id: "ease-in", label: "ease-in", color: "#4A7C91", easing: "ease-in" as const },
        { id: "ease-out", label: "ease-out", color: "#7A8B6F", easing: "ease-out" as const },
        { id: "ease-in-out", label: "ease-in-out", color: "#D4A574", easing: "ease-in-out" as const },
        {
          id: "cubic-bezier",
          label: "cubic-bezier",
          color: "#5B4A6F",
          easing: { type: "cubic-bezier" as const, x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 },
        },
        {
          id: "spring",
          label: "spring",
          color: "#3A5A6B",
          easing: { type: "spring" as const, mass: 1, stiffness: 100, damping: 10 },
        },
        {
          id: "step",
          label: "step",
          color: "#F5F0EB",
          easing: { type: "step" as const, steps: 8 },
        },
      ];

      const startY = 45;
      const rowHeight = 46;
      const builder = createDocument("Easing Race", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      });

      // Add title
      builder.addLayer({
        id: "title",
        visual: {
          type: "text",
          content: "Easing Comparison",
          style: {
            fontFamily: "sans-serif",
            fontSize: 20,
            fontWeight: "bold",
            color: "#F5F0EB",
            textAlign: "center",
          },
        },
        frame: { x: 200, y: 10 },
        bounds: { width: 200, height: 30 },
      });

      // Add label and circle for each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const y = startY + i * rowHeight;

        builder.addLayer({
          id: `label-${row.id}`,
          visual: {
            type: "text",
            content: row.label,
            style: {
              fontFamily: "monospace",
              fontSize: 12,
              color: row.color,
              textAlign: "right",
            },
          },
          frame: { x: 10, y: y + 5 },
          bounds: { width: 120, height: 20 },
        });

        builder.addLayer({
          id: `dot-${row.id}`,
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: row.color },
          },
          frame: { x: 150, y },
          bounds: { width: 24, height: 24 },
        });

        // Add a track line for visual reference
        builder.addLayer({
          id: `track-${row.id}`,
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 1 },
            fill: { type: "solid", color: "#F5F0EB" },
          },
          frame: { x: 150, y: y + 10 },
          bounds: { width: 400, height: 2 },
          opacity: 0.15,
        });
      }

      builder.addState("race", { duration: 200 });

      // Add movement deltas for each dot
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        builder.addDelta("race", {
          layer: `dot-${row.id}`,
          property: "frame.x",
          range: [20, 170],
          from: 150,
          to: 530,
          easing: row.easing,
        });
      }

      return builder.build();
    },
  },
  {
    id: "easing-bounce-spring",
    name: "Bounce & Spring",
    description:
      "Side-by-side drop: ease-in-out vs spring physics — notice the spring overshoot",
    category: "Easing",
    create: (): AtelierDocument => {
      return createDocument("Bounce & Spring", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "label-eased",
          visual: {
            type: "text",
            content: "ease-in-out",
            style: {
              fontFamily: "monospace",
              fontSize: 14,
              color: "#4A7C91",
              textAlign: "center",
            },
          },
          frame: { x: 110, y: 40 },
          bounds: { width: 120, height: 24 },
        })
        .addLayer({
          id: "label-spring",
          visual: {
            type: "text",
            content: "spring",
            style: {
              fontFamily: "monospace",
              fontSize: 14,
              color: "#C75B39",
              textAlign: "center",
            },
          },
          frame: { x: 370, y: 40 },
          bounds: { width: 120, height: 24 },
        })
        .addLayer({
          id: "ball-eased",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#4A7C91" },
          },
          frame: { x: 140, y: 80 },
          bounds: { width: 60, height: 60 },
        })
        .addLayer({
          id: "ball-spring",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#C75B39" },
          },
          frame: { x: 400, y: 80 },
          bounds: { width: 60, height: 60 },
        })
        .addLayer({
          id: "floor",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: "#F5F0EB" },
          },
          frame: { x: 50, y: 340 },
          bounds: { width: 500, height: 2 },
          opacity: 0.3,
        })
        .addState("drop", { duration: 180 })
        .addDelta("drop", {
          layer: "ball-eased",
          property: "frame.y",
          range: [10, 120],
          from: 80,
          to: 280,
          easing: "ease-in-out",
        })
        .addDelta("drop", {
          layer: "ball-spring",
          property: "frame.y",
          range: [10, 120],
          from: 80,
          to: 280,
          easing: {
            type: "spring",
            mass: 1,
            stiffness: 120,
            damping: 8,
          },
        })
        .addDelta("drop", {
          layer: "ball-eased",
          property: "scale.x",
          range: [100, 140],
          from: 1,
          to: 1.15,
          easing: "ease-out",
        })
        .addDelta("drop", {
          layer: "ball-eased",
          property: "scale.y",
          range: [100, 140],
          from: 1,
          to: 0.85,
          easing: "ease-out",
        })
        .build();
    },
  },
];
