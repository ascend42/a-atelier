import { createDocument } from "@atelier/core";
import type { AtelierDocument } from "@atelier/types";
import type { Example } from "./index.js";

export const templatesExamples: Example[] = [
  {
    id: "templates-branded-title",
    name: "Branded Title Card",
    description:
      "A polished title card animation with template variables for title text and brand color — swap values to rebrand instantly",
    category: "Templates",
    create: (): AtelierDocument => {
      // Template variables define the customizable slots
      const titleText = "Atelier Studio";
      const brandColor = "#C75B39";
      const accentColor = "#4A7C91";

      return createDocument("Branded Title Card", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        // Register template variables so consumers know what to customize
        .variable("title", {
          type: "string",
          default: titleText,
          description: "Main title text displayed on the card",
        })
        .variable("brandColor", {
          type: "color",
          default: brandColor,
          description: "Primary brand color for the accent bar and title",
        })
        .variable("accentColor", {
          type: "color",
          default: accentColor,
          description: "Secondary accent color for the subtitle",
        })
        // Accent line at top
        .addLayer({
          id: "accent-line",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 2 },
            fill: { type: "solid", color: brandColor },
          },
          frame: { x: 200, y: 130 },
          bounds: { width: 0, height: 4 },
        })
        // Title text
        .addLayer({
          id: "title",
          visual: {
            type: "text",
            content: titleText,
            style: {
              fontFamily: "sans-serif",
              fontSize: 36,
              fontWeight: "bold",
              color: "#F5F0EB",
              textAlign: "center",
            },
          },
          frame: { x: 100, y: 155 },
          bounds: { width: 400, height: 50 },
          opacity: 0,
        })
        // Subtitle
        .addLayer({
          id: "subtitle",
          visual: {
            type: "text",
            content: "Motion Design System",
            style: {
              fontFamily: "sans-serif",
              fontSize: 16,
              color: accentColor,
              textAlign: "center",
            },
          },
          frame: { x: 175, y: 215 },
          bounds: { width: 250, height: 24 },
          opacity: 0,
        })
        // Decorative corner shapes
        .addLayer({
          id: "corner-tl",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: brandColor },
          },
          frame: { x: 120, y: 110 },
          bounds: { width: 24, height: 2 },
          opacity: 0,
        })
        .addLayer({
          id: "corner-tl-v",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: brandColor },
          },
          frame: { x: 120, y: 110 },
          bounds: { width: 2, height: 24 },
          opacity: 0,
        })
        .addLayer({
          id: "corner-br",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: brandColor },
          },
          frame: { x: 456, y: 248 },
          bounds: { width: 24, height: 2 },
          opacity: 0,
        })
        .addLayer({
          id: "corner-br-v",
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: brandColor },
          },
          frame: { x: 478, y: 226 },
          bounds: { width: 2, height: 24 },
          opacity: 0,
        })
        .addState("intro", { duration: 180 })
        // Accent line draws in
        .addDelta("intro", {
          layer: "accent-line",
          property: "bounds.width",
          range: [0, 50],
          from: 0,
          to: 200,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "accent-line",
          property: "frame.x",
          range: [0, 50],
          from: 300,
          to: 200,
          easing: "ease-out",
        })
        // Title fades in
        .addDelta("intro", {
          layer: "title",
          property: "opacity",
          range: [30, 65],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "title",
          property: "frame.y",
          range: [30, 65],
          from: 170,
          to: 155,
          easing: "ease-out",
        })
        // Subtitle fades in
        .addDelta("intro", {
          layer: "subtitle",
          property: "opacity",
          range: [55, 90],
          from: 0,
          to: 1,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "subtitle",
          property: "frame.y",
          range: [55, 90],
          from: 230,
          to: 215,
          easing: "ease-out",
        })
        // Corner decorations appear
        .addDelta("intro", {
          layer: "corner-tl",
          property: "opacity",
          range: [70, 100],
          from: 0,
          to: 0.6,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "corner-tl-v",
          property: "opacity",
          range: [70, 100],
          from: 0,
          to: 0.6,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "corner-br",
          property: "opacity",
          range: [80, 110],
          from: 0,
          to: 0.6,
          easing: "ease-out",
        })
        .addDelta("intro", {
          layer: "corner-br-v",
          property: "opacity",
          range: [80, 110],
          from: 0,
          to: 0.6,
          easing: "ease-out",
        })
        .build();
    },
  },
  {
    id: "templates-notification",
    name: "Notification Banner",
    description:
      "A reusable notification animation template with variables for message text, icon color, and type",
    category: "Templates",
    create: (): AtelierDocument => {
      const message = "Changes saved successfully";
      const iconColor = "#7A8B6F";

      return createDocument("Notification Banner", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .variable("message", {
          type: "string",
          default: message,
          description: "Notification message text",
        })
        .variable("iconColor", {
          type: "color",
          default: iconColor,
          description: "Status icon color (green=success, red=error, amber=warning)",
        })
        // Banner background
        .addLayer({
          id: "banner",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 12 },
            fill: { type: "solid", color: "#363636" },
            stroke: { color: "#3A5A6B", width: 1 },
          },
          frame: { x: 100, y: -60 },
          bounds: { width: 400, height: 56 },
        })
        // Status icon (circle)
        .addLayer({
          id: "icon",
          visual: {
            type: "shape",
            shape: { type: "ellipse" },
            fill: { type: "solid", color: iconColor },
          },
          frame: { x: 120, y: -45 },
          bounds: { width: 26, height: 26 },
        })
        // Checkmark indicator (small rect as visual shorthand)
        .addLayer({
          id: "check",
          visual: {
            type: "shape",
            shape: { type: "rect", cornerRadius: 2 },
            fill: { type: "solid", color: "#F5F0EB" },
          },
          frame: { x: 127, y: -37 },
          bounds: { width: 12, height: 12 },
          opacity: 0.9,
        })
        // Message text
        .addLayer({
          id: "message",
          visual: {
            type: "text",
            content: message,
            style: {
              fontFamily: "sans-serif",
              fontSize: 14,
              color: "#F5F0EB",
              textAlign: "left",
            },
          },
          frame: { x: 160, y: -40 },
          bounds: { width: 320, height: 24 },
        })
        .addState("show", { duration: 180 })
        // Slide down into view
        .addDelta("show", {
          layer: "banner",
          property: "frame.y",
          range: [10, 50],
          from: -60,
          to: 30,
          easing: { type: "spring", mass: 1, stiffness: 200, damping: 15 },
        })
        .addDelta("show", {
          layer: "icon",
          property: "frame.y",
          range: [10, 50],
          from: -45,
          to: 45,
          easing: { type: "spring", mass: 1, stiffness: 200, damping: 15 },
        })
        .addDelta("show", {
          layer: "check",
          property: "frame.y",
          range: [10, 50],
          from: -37,
          to: 53,
          easing: { type: "spring", mass: 1, stiffness: 200, damping: 15 },
        })
        .addDelta("show", {
          layer: "message",
          property: "frame.y",
          range: [10, 50],
          from: -40,
          to: 47,
          easing: { type: "spring", mass: 1, stiffness: 200, damping: 15 },
        })
        // Slide back up after a pause
        .addDelta("show", {
          layer: "banner",
          property: "frame.y",
          range: [130, 170],
          from: 30,
          to: -60,
          easing: "ease-in",
        })
        .addDelta("show", {
          layer: "icon",
          property: "frame.y",
          range: [130, 170],
          from: 45,
          to: -45,
          easing: "ease-in",
        })
        .addDelta("show", {
          layer: "check",
          property: "frame.y",
          range: [130, 170],
          from: 53,
          to: -37,
          easing: "ease-in",
        })
        .addDelta("show", {
          layer: "message",
          property: "frame.y",
          range: [130, 170],
          from: 47,
          to: -40,
          easing: "ease-in",
        })
        .build();
    },
  },
];
