import { createDocument, expandPreset } from "@atelier/core";
import type { AtelierDocument, Preset } from "@atelier/types";
import type { Example } from "./index.js";

export const presetsExamples: Example[] = [
  {
    id: "presets-fade-in",
    name: "Fade In Preset",
    description:
      "A reusable fade-in preset applied to three layers with staggered timing — consistent behavior across elements",
    category: "Presets",
    create: (): AtelierDocument => {
      const fadeIn: Preset = {
        description: "Fade in with upward slide",
        deltas: [
          { property: "opacity", offset: [0, 30], from: 0, to: 1, easing: "ease-out" },
          { property: "frame.y", offset: [0, 30], from: 20, to: 0, easing: "ease-out" },
        ],
      };

      const builder = createDocument("Fade In Preset", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#141420",
      });

      // Register the preset on the document
      builder.preset("fade-in", fadeIn);

      // Three cards to demonstrate the preset
      const cards = [
        { id: "card-0", x: 70, y: 150, color: "#e94560", label: "Card A" },
        { id: "card-1", x: 240, y: 150, color: "#0ea5e9", label: "Card B" },
        { id: "card-2", x: 410, y: 150, color: "#22c55e", label: "Card C" },
      ];

      for (const card of cards) {
        builder.addLayer({
          id: card.id,
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 12 },
            fill: { type: "solid", color: card.color },
          },
          frame: { x: card.x, y: card.y },
          bounds: { width: 120, height: 100 },
          opacity: 0,
        });

        builder.addLayer({
          id: `${card.id}-label`,
          visual: {
            type: "text",
            content: card.label,
            style: {
              fontFamily: "sans-serif",
              fontSize: 14,
              fontWeight: "bold",
              color: "#ffffff",
              textAlign: "center",
            },
          },
          frame: { x: card.x + 20, y: card.y + 40 },
          bounds: { width: 80, height: 24 },
          opacity: 0,
        });
      }

      builder.addState("enter", { duration: 150 });

      // Expand the preset for each card with staggered start times
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const startFrame = 10 + i * 25;

        // Expand preset for the card shape
        const cardDeltas = expandPreset(fadeIn, card.id, startFrame, 30);
        for (const delta of cardDeltas) {
          // Adjust the "from" for frame.y — it's relative in the preset, make it absolute
          if (delta.property === "frame.y") {
            delta.from = cards[i].y + 20;
            delta.to = cards[i].y;
          }
          builder.addDelta("enter", delta);
        }

        // Expand preset for the label (slightly later)
        const labelDeltas = expandPreset(fadeIn, `${card.id}-label`, startFrame + 10, 30);
        for (const delta of labelDeltas) {
          if (delta.property === "frame.y") {
            delta.from = cards[i].y + 50;
            delta.to = cards[i].y + 40;
          }
          builder.addDelta("enter", delta);
        }
      }

      return builder.build();
    },
  },
  {
    id: "presets-slide-up",
    name: "Slide Up Preset",
    description:
      "A slide-up entrance preset applied to a title, subtitle, and button — showing reusable motion patterns",
    category: "Presets",
    create: (): AtelierDocument => {
      const slideUp: Preset = {
        description: "Slide up from below with fade",
        deltas: [
          { property: "opacity", offset: [0, 25], from: 0, to: 1, easing: "ease-out" },
          { property: "frame.y", offset: [0, 35], from: 40, to: 0, easing: "ease-out" },
        ],
      };

      const builder = createDocument("Slide Up Preset", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#141420",
      });

      builder.preset("slide-up", slideUp);

      // Title
      builder.addLayer({
        id: "title",
        visual: {
          type: "text",
          content: "Welcome to Atelier",
          style: {
            fontFamily: "sans-serif",
            fontSize: 28,
            fontWeight: "bold",
            color: "#ffffff",
            textAlign: "center",
          },
        },
        frame: { x: 150, y: 120 },
        bounds: { width: 300, height: 40 },
        opacity: 0,
      });

      // Subtitle
      builder.addLayer({
        id: "subtitle",
        visual: {
          type: "text",
          content: "Motion design, defined in code",
          style: {
            fontFamily: "sans-serif",
            fontSize: 16,
            color: "#0ea5e9",
            textAlign: "center",
          },
        },
        frame: { x: 150, y: 175 },
        bounds: { width: 300, height: 30 },
        opacity: 0,
      });

      // Button
      builder.addLayer({
        id: "button-bg",
        visual: {
          type: "shape",
          shape: { type: "rect", cornerRadius: 20 },
          fill: {
            type: "linear-gradient",
            angle: 90,
            stops: [
              { offset: 0, color: "#e94560" },
              { offset: 1, color: "#533483" },
            ],
          },
        },
        frame: { x: 225, y: 230 },
        bounds: { width: 150, height: 40 },
        opacity: 0,
      });

      builder.addLayer({
        id: "button-text",
        visual: {
          type: "text",
          content: "Get Started",
          style: {
            fontFamily: "sans-serif",
            fontSize: 14,
            fontWeight: "bold",
            color: "#ffffff",
            textAlign: "center",
          },
        },
        frame: { x: 250, y: 240 },
        bounds: { width: 100, height: 20 },
        opacity: 0,
      });

      builder.addState("enter", { duration: 150 });

      // Apply slide-up to each element with stagger
      const elements = [
        { id: "title", y: 120, start: 10 },
        { id: "subtitle", y: 175, start: 30 },
        { id: "button-bg", y: 230, start: 50 },
        { id: "button-text", y: 240, start: 55 },
      ];

      for (const el of elements) {
        const deltas = expandPreset(slideUp, el.id, el.start, 35);
        for (const delta of deltas) {
          if (delta.property === "frame.y") {
            delta.from = el.y + 40;
            delta.to = el.y;
          }
          builder.addDelta("enter", delta);
        }
      }

      return builder.build();
    },
  },
];
