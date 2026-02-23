import { createDocument } from "@a-company/atelier-core";
import type { AtelierDocument } from "@a-company/atelier-types";
import type { Example } from "./index.js";

export const shapesExamples: Example[] = [
  {
    id: "shapes-primitives",
    name: "Primitives",
    description:
      "Rectangle, ellipse, and rounded rect — the three shape types appear sequentially",
    category: "Shapes",
    create: (): AtelierDocument => {
      return createDocument("Shape Primitives", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "rect",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: "#C75B39" },
          },
          frame: { x: 80, y: 150 },
          bounds: { width: 120, height: 120 },
          opacity: 0,
        })
        .addLayer({
          id: "ellipse",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#4A7C91" },
          },
          frame: { x: 240, y: 150 },
          bounds: { width: 120, height: 120 },
          opacity: 0,
        })
        .addLayer({
          id: "rounded",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 24 },
            fill: { type: "solid", color: "#7A8B6F" },
          },
          frame: { x: 400, y: 150 },
          bounds: { width: 120, height: 120 },
          opacity: 0,
        })
        .addLayer({
          id: "label",
          visual: {
            type: "text",
            content: "Shape Primitives",
            style: {
              fontFamily: "sans-serif",
              fontSize: 24,
              fontWeight: "bold",
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 200, y: 50 },
          bounds: { width: 200, height: 40 },
          opacity: 0,
        })
        .addState("show", { duration: 180 })
        .addDelta("show", {
          layer: "label",
          property: "opacity",
          range: [0, 30],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "rect",
          property: "opacity",
          range: [20, 50],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "rect",
          property: "frame.y",
          range: [20, 50],
          from: 200,
          to: 150,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "ellipse",
          property: "opacity",
          range: [40, 70],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "ellipse",
          property: "frame.y",
          range: [40, 70],
          from: 200,
          to: 150,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "rounded",
          property: "opacity",
          range: [60, 90],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "rounded",
          property: "frame.y",
          range: [60, 90],
          from: 200,
          to: 150,
          easing: "ease-out",
        })
        .build();
    },
  },
  {
    id: "shapes-path",
    name: "Path Drawing",
    description: "A diamond path shape with animated rotation and scale",
    category: "Shapes",
    create: (): AtelierDocument => {
      return createDocument("Path Drawing", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "diamond",
          visual: {
            type: "shape",
            shape: {
              type: "path",
              points: [
                { x: 60, y: 0 },
                { x: 120, y: 60 },
                { x: 60, y: 120 },
                { x: 0, y: 60 },
              ],
              closed: true,
            },
            fill: { type: "solid", color: "#5B4A6F" },
            stroke: { color: "#C75B39", width: 2 },
          },
          frame: { x: 240, y: 140 },
          bounds: { width: 120, height: 120 },
          opacity: 0,
          rotation: 0,
        })
        .addState("show", { duration: 180 })
        .addDelta("show", {
          layer: "diamond",
          property: "opacity",
          range: [0, 40],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "diamond",
          property: "rotation",
          range: [0, 180],
          from: 0,
          to: 360,
          easing: "ease-in-out",
        })
        .addDelta("show", {
          layer: "diamond",
          property: "scale.x",
          range: [40, 119],
          from: 0.5,
          to: 1.2,
          easing: "ease-in-out",
        })
        .addDelta("show", {
          layer: "diamond",
          property: "scale.y",
          range: [40, 119],
          from: 0.5,
          to: 1.2,
          easing: "ease-in-out",
        })
        .addDelta("show", {
          layer: "diamond",
          property: "scale.x",
          range: [120, 180],
          from: 1.2,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("show", {
          layer: "diamond",
          property: "scale.y",
          range: [120, 180],
          from: 1.2,
          to: 1,
          easing: "ease-out",
        })
        .build();
    },
  },
  {
    id: "shapes-corner-radius",
    name: "Corner Radius",
    description:
      "Animated corner radius morphing a square into a circle and back",
    category: "Shapes",
    create: (): AtelierDocument => {
      return createDocument("Corner Radius", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "shape",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 0 },
            fill: { type: "solid", color: "#D4A574" },
          },
          frame: { x: 225, y: 125 },
          bounds: { width: 150, height: 150 },
        })
        .addState("morph", { duration: 180 })
        .addDelta("morph", {
          layer: "shape",
          property: "visual.shape.cornerRadius",
          range: [0, 89],
          from: 0,
          to: 75,
          easing: "ease-in-out",
        })
        .addDelta("morph", {
          layer: "shape",
          property: "visual.shape.cornerRadius",
          range: [90, 180],
          from: 75,
          to: 0,
          easing: "ease-in-out",
        })
        .addDelta("morph", {
          layer: "shape",
          property: "rotation",
          range: [0, 180],
          from: 0,
          to: 180,
          easing: "ease-in-out",
        })
        .build();
    },
  },
];
