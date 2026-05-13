import type {
  AtelierDocument,
  Layer,
  Delta,
  VideoTranscript,
} from "@a-company/atelier-types";
import { groupIntoPhrases, type CaptionPhrase } from "./transcript-model.js";

/** Default style for generated caption layers — overridable by Studio Recipe */
export interface CaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  color?: string;
  /** Relative vertical position 0–1 (0 = top, 1 = bottom). Default 0.85 — lower-third. */
  yRatio?: number;
  /** Horizontal width as ratio of canvas width. Default 0.9. */
  widthRatio?: number;
  /** Fade duration in seconds for opacity in/out. Default 0.05 (3 frames at 60fps). */
  fadeSeconds?: number;
}

const DEFAULT_STYLE: Required<CaptionStyle> = {
  fontFamily: "Inter",
  fontSize: 84,
  fontWeight: "bold" as const,
  textAlign: "center" as const,
  color: "#FFFFFF",
  yRatio: 0.85,
  widthRatio: 0.9,
  fadeSeconds: 0.05,
};

export interface BuildCaptionsOptions {
  style?: CaptionStyle;
  /** Phrase grouping — max words per caption phrase */
  maxWords?: number;
  /** Phrase grouping — pause gap in seconds that forces a phrase break */
  pauseGap?: number;
}

/**
 * Build caption-tagged TextVisual layers from a transcript + canvas dimensions.
 *
 * Each phrase becomes one Layer with:
 *  - tags: ["caption"]
 *  - TextVisual with merged style
 *  - opacity: 0 (default; deltas animate to 1 during the phrase)
 *  - positioned at canvas.width * 0.5, canvas.height * yRatio
 *
 * Caller is responsible for appending these to a state's deltas array
 * (returned alongside the layers as Delta[] keyed to layer id).
 */
export function buildCaptionLayers(
  transcript: VideoTranscript,
  canvas: AtelierDocument["canvas"],
  options: BuildCaptionsOptions = {},
): { layers: Layer[]; deltas: Delta[] } {
  const style = { ...DEFAULT_STYLE, ...options.style };
  const phrases = groupIntoPhrases(transcript, {
    maxWords: options.maxWords,
    pauseGap: options.pauseGap,
  });

  const layers: Layer[] = [];
  const deltas: Delta[] = [];
  const fps = canvas.fps;

  phrases.forEach((phrase, idx) => {
    const layerId = `caption-${idx}`;
    layers.push(buildPhraseLayer(layerId, phrase, canvas, style));
    deltas.push(...buildPhraseDeltas(layerId, phrase, style.fadeSeconds, fps));
  });

  return { layers, deltas };
}

/**
 * Drop caption-tagged layers + their deltas from a composition,
 * append fresh ones from the current transcript.
 *
 * Mirrors rewriteCutLayers' invariant: only caption-tagged layers touched;
 * all other layers (silence-trim, overlay, user-authored) preserved.
 *
 * Deltas are written into the default state (or first state if no "default").
 */
export function rewriteCaptionLayers(
  doc: AtelierDocument,
  transcript: VideoTranscript,
  options: BuildCaptionsOptions = {},
): AtelierDocument {
  const preserved = doc.layers.filter((l) => !(l.tags ?? []).includes("caption"));
  const { layers: captionLayers, deltas: captionDeltas } = buildCaptionLayers(
    transcript,
    doc.canvas,
    options,
  );
  const captionLayerIds = new Set(captionLayers.map((l) => l.id));

  // Pick the target state for caption deltas: prefer "default", else first
  const stateNames = Object.keys(doc.states);
  const targetStateName = stateNames.includes("default") ? "default" : stateNames[0];
  const states = { ...doc.states };

  if (targetStateName && states[targetStateName]) {
    const existing = states[targetStateName];
    // Drop deltas on caption layers we're rewriting; keep all others
    const preservedDeltas = existing.deltas.filter(
      (d) => !captionLayerIds.has(d.layer),
    );
    states[targetStateName] = {
      ...existing,
      deltas: [...preservedDeltas, ...captionDeltas],
    };
  }

  return {
    ...doc,
    layers: [...preserved, ...captionLayers],
    states,
  };
}

// ─── internals ───────────────────────────────────────────────────

function buildPhraseLayer(
  id: string,
  phrase: CaptionPhrase,
  canvas: AtelierDocument["canvas"],
  style: Required<CaptionStyle>,
): Layer {
  return {
    id,
    tags: ["caption"],
    visual: {
      type: "text",
      content: phrase.text,
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        color: style.color,
      },
    },
    frame: {
      x: canvas.width / 2,
      y: canvas.height * style.yRatio,
    },
    bounds: {
      width: canvas.width * style.widthRatio,
      height: Math.max(120, style.fontSize * 1.6),
    },
    anchorPoint: { x: 0.5, y: 0.5 },
    opacity: 0,
  };
}

function buildPhraseDeltas(
  layerId: string,
  phrase: CaptionPhrase,
  fadeSeconds: number,
  fps: number,
): Delta[] {
  const fadeFrames = Math.max(1, Math.round(fadeSeconds * fps));
  const startFrame = Math.floor(phrase.start * fps);
  const endFrame = Math.ceil(phrase.end * fps);
  const fadeOutStart = Math.max(startFrame + 1, endFrame - fadeFrames);

  return [
    // Fade in to visible at phrase start
    {
      layer: layerId,
      property: "opacity",
      range: [Math.max(0, startFrame - fadeFrames), startFrame],
      from: 0,
      to: 1,
      easing: "ease-out",
    },
    // Hold visible through the phrase
    // (no explicit delta needed — value persists between deltas)
    // Fade out at phrase end
    {
      layer: layerId,
      property: "opacity",
      range: [fadeOutStart, endFrame],
      from: 1,
      to: 0,
      easing: "ease-in",
    },
  ];
}
