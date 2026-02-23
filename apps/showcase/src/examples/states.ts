import { createDocument } from "@a-company/atelier-core";
import type { AtelierDocument } from "@a-company/atelier-types";
import type { Example } from "./index.js";

export const statesExamples: Example[] = [
  {
    id: "states-intro-outro",
    name: "Intro / Outro",
    description:
      "Two distinct states: 'intro' fades everything in with motion, 'outro' fades everything out — demonstrating state-based animation switching",
    category: "States",
    create: (): AtelierDocument => {
      return createDocument("Intro / Outro", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        // Decorative background shape
        .addLayer({
          id: "bg-shape",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 30 },
            fill: {
              type: "linear-gradient",
              angle: 135,
              stops: [
                { offset: 0, color: "#3A5A6B" },
                { offset: 1, color: "#363636" },
              ],
            },
          },
          frame: { x: 100, y: 60 },
          bounds: { width: 400, height: 280 },
          opacity: 0,
        })
        .addLayer({
          id: "heading",
          visual: {
            type: "text",
            content: "Hello, World",
            style: {
              fontFamily: "sans-serif",
              fontSize: 32,
              fontWeight: "bold",
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 150, y: 140 },
          bounds: { width: 300, height: 44 },
          opacity: 0,
        })
        .addLayer({
          id: "body",
          visual: {
            type: "text",
            content: "State-driven animations",
            style: {
              fontFamily: "sans-serif",
              fontSize: 16,
              color: "#4A7C91",
              textAlign: "center",
            },
          },
          frame: { x: 175, y: 195 },
          bounds: { width: 250, height: 24 },
          opacity: 0,
        })
        .addLayer({
          id: "dot-left",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#C75B39" },
          },
          frame: { x: 240, y: 240 },
          bounds: { width: 16, height: 16 },
          opacity: 0,
        })
        .addLayer({
          id: "dot-center",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#7A8B6F" },
          },
          frame: { x: 290, y: 240 },
          bounds: { width: 16, height: 16 },
          opacity: 0,
        })
        .addLayer({
          id: "dot-right",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#D4A574" },
          },
          frame: { x: 340, y: 240 },
          bounds: { width: 16, height: 16 },
          opacity: 0,
        })
        // INTRO state: everything fades in with motion
        .addState("intro", { duration: 120, description: "Entrance animation" })
        .addDelta("intro", {
          layer: "bg-shape",
          property: "opacity",
          range: [0, 40],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "bg-shape",
          property: "scale.x",
          range: [0, 40],
          from: 0.9,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "bg-shape",
          property: "scale.y",
          range: [0, 40],
          from: 0.9,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "heading",
          property: "opacity",
          range: [20, 50],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "heading",
          property: "frame.y",
          range: [20, 50],
          from: 155,
          to: 140,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "body",
          property: "opacity",
          range: [35, 65],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "body",
          property: "frame.y",
          range: [35, 65],
          from: 210,
          to: 195,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "dot-left",
          property: "opacity",
          range: [50, 70],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "dot-center",
          property: "opacity",
          range: [55, 75],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "dot-right",
          property: "opacity",
          range: [60, 80],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        // OUTRO state: everything fades out
        .addState("outro", { duration: 90, description: "Exit animation" })
        .addDelta("outro", {
          layer: "dot-left",
          property: "opacity",
          range: [0, 15],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "dot-center",
          property: "opacity",
          range: [5, 20],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "dot-right",
          property: "opacity",
          range: [10, 25],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "body",
          property: "opacity",
          range: [15, 40],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "body",
          property: "frame.y",
          range: [15, 40],
          from: 195,
          to: 180,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "heading",
          property: "opacity",
          range: [25, 50],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "heading",
          property: "frame.y",
          range: [25, 50],
          from: 140,
          to: 125,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "bg-shape",
          property: "opacity",
          range: [40, 70],
          from: 1,
          to: 0,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "bg-shape",
          property: "scale.x",
          range: [40, 70],
          from: 1,
          to: 0.9,
          easing: "ease-in",
        })
        .addDelta("outro", {
          layer: "bg-shape",
          property: "scale.y",
          range: [40, 70],
          from: 1,
          to: 0.9,
          easing: "ease-in",
        })
        .build();
    },
  },
  {
    id: "states-traffic-light",
    name: "Traffic Light",
    description:
      "Three states — red, yellow, green — each activates a different light while dimming the others",
    category: "States",
    create: (): AtelierDocument => {
      return createDocument("Traffic Light", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        // Housing
        .addLayer({
          id: "housing",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 20 },
            fill: { type: "solid", color: "#363636" },
            stroke: { color: "#3A5A6B", width: 2 },
          },
          frame: { x: 245, y: 30 },
          bounds: { width: 110, height: 340 },
        })
        // Red light
        .addLayer({
          id: "red-light",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#C75B39" },
          },
          frame: { x: 265, y: 55 },
          bounds: { width: 70, height: 70 },
          opacity: 0.2,
        })
        // Yellow light
        .addLayer({
          id: "yellow-light",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#D4A574" },
          },
          frame: { x: 265, y: 160 },
          bounds: { width: 70, height: 70 },
          opacity: 0.2,
        })
        // Green light
        .addLayer({
          id: "green-light",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: "#7A8B6F" },
          },
          frame: { x: 265, y: 265 },
          bounds: { width: 70, height: 70 },
          opacity: 0.2,
        })
        // Label
        .addLayer({
          id: "state-label",
          visual: {
            type: "text",
            content: "STOP",
            style: {
              fontFamily: "monospace",
              fontSize: 18,
              fontWeight: "bold",
              color: "#C75B39",
              textAlign: "center",
            },
          },
          frame: { x: 130, y: 190 },
          bounds: { width: 80, height: 28 },
          opacity: 0,
        })
        // State: RED — red is bright, others dim
        .addState("red", { duration: 120, description: "Red light active — stop" })
        .addDelta("red", {
          layer: "red-light",
          property: "opacity",
          range: [0, 30],
          from: 0.2,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("red", {
          layer: "yellow-light",
          property: "opacity",
          range: [0, 20],
          from: 0.6,
          to: 0.2,
          easing: "ease-out",
        })
        .addDelta("red", {
          layer: "green-light",
          property: "opacity",
          range: [0, 20],
          from: 0.6,
          to: 0.2,
          easing: "ease-out",
        })
        .addDelta("red", {
          layer: "state-label",
          property: "opacity",
          range: [15, 40],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("red", {
          layer: "red-light",
          property: "scale.x",
          range: [0, 30],
          from: 0.9,
          to: 1.05,
          easing: "ease-out",
        })
        .addDelta("red", {
          layer: "red-light",
          property: "scale.y",
          range: [0, 30],
          from: 0.9,
          to: 1.05,
          easing: "ease-out",
        })
        // State: YELLOW — yellow is bright
        .addState("yellow", {
          duration: 90,
          description: "Yellow light active — caution",
        })
        .addDelta("yellow", {
          layer: "yellow-light",
          property: "opacity",
          range: [0, 25],
          from: 0.2,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("yellow", {
          layer: "red-light",
          property: "opacity",
          range: [0, 20],
          from: 1,
          to: 0.2,
          easing: "ease-out",
        })
        .addDelta("yellow", {
          layer: "green-light",
          property: "opacity",
          range: [0, 20],
          from: 0.6,
          to: 0.2,
          easing: "ease-out",
        })
        .addDelta("yellow", {
          layer: "yellow-light",
          property: "scale.x",
          range: [0, 25],
          from: 0.9,
          to: 1.05,
          easing: "ease-out",
        })
        .addDelta("yellow", {
          layer: "yellow-light",
          property: "scale.y",
          range: [0, 25],
          from: 0.9,
          to: 1.05,
          easing: "ease-out",
        })
        // State: GREEN — green is bright
        .addState("green", {
          duration: 120,
          description: "Green light active — go",
        })
        .addDelta("green", {
          layer: "green-light",
          property: "opacity",
          range: [0, 25],
          from: 0.2,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("green", {
          layer: "red-light",
          property: "opacity",
          range: [0, 20],
          from: 0.6,
          to: 0.2,
          easing: "ease-out",
        })
        .addDelta("green", {
          layer: "yellow-light",
          property: "opacity",
          range: [0, 20],
          from: 1,
          to: 0.2,
          easing: "ease-out",
        })
        .addDelta("green", {
          layer: "green-light",
          property: "scale.x",
          range: [0, 25],
          from: 0.9,
          to: 1.05,
          easing: "ease-out",
        })
        .addDelta("green", {
          layer: "green-light",
          property: "scale.y",
          range: [0, 25],
          from: 0.9,
          to: 1.05,
          easing: "ease-out",
        })
        .build();
    },
  },
];
