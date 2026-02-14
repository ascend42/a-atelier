import { createDocument } from "@atelier/core";
import type { AtelierDocument } from "@atelier/types";
import type { Example } from "./index.js";

export const stylesExamples: Example[] = [
  {
    id: "styles-gradient-reveal",
    name: "Gradient Reveal",
    description:
      "A solid shape fades away to reveal a gradient shape underneath",
    category: "Styles",
    create: (): AtelierDocument => {
      return createDocument("Gradient Reveal", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "gradient-bg",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 20 },
            fill: {
              type: "linear-gradient",
              angle: 45,
              stops: [
                { offset: 0, color: "#C75B39" },
                { offset: 0.5, color: "#5B4A6F" },
                { offset: 1, color: "#4A7C91" },
              ],
            },
          },
          frame: { x: 150, y: 100 },
          bounds: { width: 300, height: 200 },
        })
        .addLayer({
          id: "cover",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 20 },
            fill: { type: "solid", color: "#363636" },
          },
          frame: { x: 150, y: 100 },
          bounds: { width: 300, height: 200 },
          opacity: 1,
        })
        .addLayer({
          id: "label",
          visual: {
            type: "text",
            content: "Gradient Reveal",
            style: {
              fontFamily: "sans-serif",
              fontSize: 22,
              fontWeight: "bold",
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 200, y: 185 },
          bounds: { width: 200, height: 30 },
          opacity: 0,
        })
        .addState("reveal", { duration: 180 })
        .addDelta("reveal", {
          layer: "cover",
          property: "opacity",
          range: [20, 100],
          from: 1,
          to: 0,
          easing: "ease-in-out",
        })
        .addDelta("reveal", {
          layer: "label",
          property: "opacity",
          range: [80, 130],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("reveal", {
          layer: "label",
          property: "frame.y",
          range: [80, 130],
          from: 210,
          to: 185,
          easing: "ease-out",
        })
        .build();
    },
  },
  {
    id: "styles-stroke-width",
    name: "Stroke Animation",
    description:
      "Animated stroke width growing from hairline to bold on multiple shapes",
    category: "Styles",
    create: (): AtelierDocument => {
      return createDocument("Stroke Animation", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "circle",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            stroke: { color: "#4A7C91", width: 1 },
          },
          frame: { x: 100, y: 120 },
          bounds: { width: 140, height: 140 },
        })
        .addLayer({
          id: "rect",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            stroke: { color: "#C75B39", width: 1 },
          },
          frame: { x: 310, y: 120 },
          bounds: { width: 140, height: 140 },
        })
        .addLayer({
          id: "diamond",
          visual: {
            type: "shape",
            shape: {
              type: "path",
              points: [
                { x: 40, y: 0 },
                { x: 80, y: 40 },
                { x: 40, y: 80 },
                { x: 0, y: 40 },
              ],
              closed: true,
            },
            stroke: { color: "#7A8B6F", width: 1 },
          },
          frame: { x: 250, y: 300 },
          bounds: { width: 80, height: 80 },
          opacity: 0.7,
        })
        .addState("grow", { duration: 180 })
        // Circle stroke grows then shrinks
        .addDelta("grow", {
          layer: "circle",
          property: "visual.stroke.width",
          range: [0, 89],
          from: 1,
          to: 10,
          easing: "ease-in-out",
        })
        .addDelta("grow", {
          layer: "circle",
          property: "visual.stroke.width",
          range: [90, 180],
          from: 10,
          to: 1,
          easing: "ease-in-out",
        })
        // Rectangle stroke grows then shrinks (staggered)
        .addDelta("grow", {
          layer: "rect",
          property: "visual.stroke.width",
          range: [15, 104],
          from: 1,
          to: 10,
          easing: "ease-in-out",
        })
        .addDelta("grow", {
          layer: "rect",
          property: "visual.stroke.width",
          range: [105, 180],
          from: 10,
          to: 1,
          easing: "ease-in-out",
        })
        // Diamond stroke grows then shrinks (staggered more)
        .addDelta("grow", {
          layer: "diamond",
          property: "visual.stroke.width",
          range: [30, 109],
          from: 1,
          to: 8,
          easing: "ease-in-out",
        })
        .addDelta("grow", {
          layer: "diamond",
          property: "visual.stroke.width",
          range: [110, 180],
          from: 8,
          to: 1,
          easing: "ease-in-out",
        })
        .build();
    },
  },
  {
    id: "styles-stroke-trim",
    name: "Stroke Trim",
    description:
      "Draw-on effect using strokeStart/strokeEnd to reveal strokes progressively across shapes",
    category: "Styles",
    create: (): AtelierDocument => {
      return createDocument("Stroke Trim", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "circle",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            stroke: { color: "#4A7C91", width: 3, strokeEnd: 0 },
          },
          frame: { x: 60, y: 120 },
          bounds: { width: 140, height: 140 },
        })
        .addLayer({
          id: "rect",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 8 },
            stroke: { color: "#C75B39", width: 3, strokeEnd: 0 },
          },
          frame: { x: 230, y: 120 },
          bounds: { width: 140, height: 140 },
        })
        .addLayer({
          id: "star",
          visual: {
            type: "shape",
            shape: {
              type: "path",
              points: [
                { x: 70, y: 0 },
                { x: 90, y: 50 },
                { x: 140, y: 55 },
                { x: 102, y: 90 },
                { x: 115, y: 140 },
                { x: 70, y: 112 },
                { x: 25, y: 140 },
                { x: 38, y: 90 },
                { x: 0, y: 55 },
                { x: 50, y: 50 },
              ],
              closed: true,
            },
            stroke: { color: "#D4A574", width: 3, strokeEnd: 0 },
          },
          frame: { x: 400, y: 120 },
          bounds: { width: 140, height: 140 },
        })
        .addLayer({
          id: "label",
          visual: {
            type: "text",
            content: "Stroke Trim — Draw On",
            style: {
              fontFamily: "sans-serif",
              fontSize: 18,
              fontWeight: "bold",
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 150, y: 310 },
          bounds: { width: 300, height: 30 },
          opacity: 0,
        })
        .addState("draw", { duration: 240 })
        // Circle draws on
        .addDelta("draw", {
          layer: "circle",
          property: "visual.stroke.end",
          range: [0, 80],
          from: 0,
          to: 1,
          easing: "ease-in-out",
        })
        // Rect draws on (staggered)
        .addDelta("draw", {
          layer: "rect",
          property: "visual.stroke.end",
          range: [20, 100],
          from: 0,
          to: 1,
          easing: "ease-in-out",
        })
        // Star draws on (staggered more)
        .addDelta("draw", {
          layer: "star",
          property: "visual.stroke.end",
          range: [40, 120],
          from: 0,
          to: 1,
          easing: "ease-in-out",
        })
        // Label fades in
        .addDelta("draw", {
          layer: "label",
          property: "opacity",
          range: [90, 130],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        // Then wipe away — animate strokeStart to erase
        .addDelta("draw", {
          layer: "circle",
          property: "visual.stroke.start",
          range: [140, 210],
          from: 0,
          to: 1,
          easing: "ease-in-out",
        })
        .addDelta("draw", {
          layer: "rect",
          property: "visual.stroke.start",
          range: [155, 220],
          from: 0,
          to: 1,
          easing: "ease-in-out",
        })
        .addDelta("draw", {
          layer: "star",
          property: "visual.stroke.start",
          range: [170, 230],
          from: 0,
          to: 1,
          easing: "ease-in-out",
        })
        // Label fades out
        .addDelta("draw", {
          layer: "label",
          property: "opacity",
          range: [190, 230],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .build();
    },
  },
  {
    id: "styles-color-shift",
    name: "Color Shift",
    description:
      "A rectangle transitions through multiple fill colors in sequence",
    category: "Styles",
    create: (): AtelierDocument => {
      return createDocument("Color Shift", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({
          id: "swatch",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 16 },
            fill: { type: "solid", color: "#C75B39" },
          },
          frame: { x: 175, y: 100 },
          bounds: { width: 250, height: 160 },
        })
        .addLayer({
          id: "color-label",
          visual: {
            type: "text",
            content: "Color Shift",
            style: {
              fontFamily: "sans-serif",
              fontSize: 20,
              fontWeight: "bold",
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 225, y: 300 },
          bounds: { width: 150, height: 30 },
        })
        .addState("shift", { duration: 240 })
        // Red to cyan
        .addDelta("shift", {
          layer: "swatch",
          property: "visual.fill.color",
          range: [0, 59],
          from: "#C75B39",
          to: "#4A7C91",
          easing: "ease-in-out",
        })
        // Cyan to green
        .addDelta("shift", {
          layer: "swatch",
          property: "visual.fill.color",
          range: [60, 119],
          from: "#4A7C91",
          to: "#7A8B6F",
          easing: "ease-in-out",
        })
        // Green to amber
        .addDelta("shift", {
          layer: "swatch",
          property: "visual.fill.color",
          range: [120, 179],
          from: "#7A8B6F",
          to: "#D4A574",
          easing: "ease-in-out",
        })
        // Amber back to red
        .addDelta("shift", {
          layer: "swatch",
          property: "visual.fill.color",
          range: [180, 240],
          from: "#D4A574",
          to: "#C75B39",
          easing: "ease-in-out",
        })
        // Subtle corner radius animation for extra visual interest
        .addDelta("shift", {
          layer: "swatch",
          property: "visual.shape.cornerRadius",
          range: [0, 119],
          from: 16,
          to: 60,
          easing: "ease-in-out",
        })
        .addDelta("shift", {
          layer: "swatch",
          property: "visual.shape.cornerRadius",
          range: [120, 240],
          from: 60,
          to: 16,
          easing: "ease-in-out",
        })
        .build();
    },
  },
];
