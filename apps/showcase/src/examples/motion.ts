import { createDocument } from "@a-company/atelier-core";
import type { AtelierDocument } from "@a-company/atelier-types";
import type { Example } from "./index.js";

export const motionExamples: Example[] = [
  {
    id: "motion-slide",
    name: "Slide",
    description:
      "A rectangle slides across the screen left to right, pauses, then slides back",
    category: "Motion",
    create: (): AtelierDocument => {
      return createDocument("Slide", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "track",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 2 },
            fill: { type: "solid", color: "#F5F0EB" },
          },
          frame: { x: 50, y: 198 },
          bounds: { width: 500, height: 4 },
          opacity: 0.15,
        })
        .addLayer({
          id: "box",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 12 },
            fill: {
              type: "linear-gradient",
              angle: 135,
              stops: [
                { offset: 0, color: "#C75B39" },
                { offset: 1, color: "#5B4A6F" },
              ],
            },
          },
          frame: { x: 50, y: 160 },
          bounds: { width: 80, height: 80 },
        })
        .addState("slide", { duration: 200 })
        .addDelta("slide", {
          layer: "box",
          property: "frame.x",
          range: [10, 89],
          from: 50,
          to: 470,
          easing: "ease-in-out",
        })
        .addDelta("slide", {
          layer: "box",
          property: "frame.x",
          range: [110, 189],
          from: 470,
          to: 50,
          easing: "ease-in-out",
        })
        .build();
    },
  },
  {
    id: "motion-spin",
    name: "Spin",
    description:
      "A circle rotates 720 degrees with smooth ease-in-out acceleration",
    category: "Motion",
    create: (): AtelierDocument => {
      return createDocument("Spin", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "spinner",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#4A7C91" },
            stroke: { color: "#F5F0EB", width: 3 },
          },
          frame: { x: 240, y: 140 },
          bounds: { width: 120, height: 120 },
        })
        .addLayer({
          id: "marker",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#C75B39" },
          },
          frame: { x: 290, y: 148 },
          bounds: { width: 20, height: 20 },
        })
        .addState("spin", { duration: 180 })
        .addDelta("spin", {
          layer: "spinner",
          property: "rotation",
          range: [0, 180],
          from: 0,
          to: 720,
          easing: "ease-in-out",
        })
        .addDelta("spin", {
          layer: "marker",
          property: "rotation",
          range: [0, 180],
          from: 0,
          to: 720,
          easing: "ease-in-out",
        })
        .build();
    },
  },
  {
    id: "motion-scale-pulse",
    name: "Scale Pulse",
    description:
      "A shape scales up and down in a smooth breathing pattern",
    category: "Motion",
    create: (): AtelierDocument => {
      return createDocument("Scale Pulse", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "ring-outer",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#5B4A6F" },
          },
          frame: { x: 230, y: 130 },
          bounds: { width: 140, height: 140 },
          opacity: 0.3,
        })
        .addLayer({
          id: "pulse",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: {
              type: "radial-gradient",
              center: { x: 0.5, y: 0.5 },
              radius: 0.5,
              stops: [
                { offset: 0, color: "#7A8B6F" },
                { offset: 1, color: "#3A5A6B" },
              ],
            },
          },
          frame: { x: 250, y: 150 },
          bounds: { width: 100, height: 100 },
        })
        .addState("breathe", { duration: 180 })
        // Scale up
        .addDelta("breathe", {
          layer: "pulse",
          property: "scale.x",
          range: [0, 89],
          from: 0.6,
          to: 1.4,
          easing: "ease-in-out",
        })
        .addDelta("breathe", {
          layer: "pulse",
          property: "scale.y",
          range: [0, 89],
          from: 0.6,
          to: 1.4,
          easing: "ease-in-out",
        })
        // Scale down
        .addDelta("breathe", {
          layer: "pulse",
          property: "scale.x",
          range: [90, 180],
          from: 1.4,
          to: 0.6,
          easing: "ease-in-out",
        })
        .addDelta("breathe", {
          layer: "pulse",
          property: "scale.y",
          range: [90, 180],
          from: 1.4,
          to: 0.6,
          easing: "ease-in-out",
        })
        // Outer ring breathes with opacity
        .addDelta("breathe", {
          layer: "ring-outer",
          property: "opacity",
          range: [0, 89],
          from: 0.15,
          to: 0.5,
          easing: "ease-in-out",
        })
        .addDelta("breathe", {
          layer: "ring-outer",
          property: "opacity",
          range: [90, 180],
          from: 0.5,
          to: 0.15,
          easing: "ease-in-out",
        })
        .build();
    },
  },
];
