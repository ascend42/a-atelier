/**
 * storyboard-to-html — produce a minimal Hyperframes `index.html` from a
 * doc-shaped composition + a transcript.
 *
 * v0 input (this spike): just the source media + transcript segments. The
 * full Storyboard → HTML emitter (v1.0) will take a StoryboardArtifact with
 * shots / beats / windows / technique refs and emit per-beat scenes; the
 * v0 shape is "one <video> + N caption divs" so we can prove the
 * Hyperframes integration end-to-end before layering the storyboard model.
 *
 * Hyperframes timing model: every element with `data-start` /
 * `data-duration` gets composited into the timeline at those frame-time
 * offsets. The producer's compile stage scans these attributes when
 * building the render plan.
 *
 * Asset paths are RELATIVE to the project root (e.g. `assets/video.mp4`)
 * because Hyperframes' file server serves the project dir as its web
 * root. The asset-injector populates the actual files there.
 */

import { designToCss, type DesignBrandSlice } from "./design-to-css.js";

export interface TranscriptSegment {
  start: number;    // seconds
  end: number;      // seconds
  text: string;
}

export interface StoryboardInput {
  /** Output canvas dimensions (drives Hyperframes resolution). */
  width: number;
  height: number;
  /** Source video — gets a `<video>` at t=0 covering the full duration. */
  videoFilename: string;          // "IMG_7346.MOV" → served as assets/IMG_7346.MOV
  videoDurationSeconds: number;   // for data-duration; the audio also runs the full span
  /** Transcript segments → caption overlays with sequential timing. */
  captions: TranscriptSegment[];
  /** DESIGN brand block → :root CSS vars. Optional; emitter accepts null. */
  design?: DesignBrandSlice | null;
}

/**
 * Render the index.html. Pure function; no I/O.
 *
 * Layout:
 *   <head>
 *     - meta charset + viewport
 *     - <style> with :root brand vars (from designToCss)
 *     - <style> with caption base styles
 *   <body>
 *     - <video> at (0,0) covering the full canvas with native audio
 *     - <div class="caption" data-start data-duration> per transcript segment
 */
export function storyboardToHtml(input: StoryboardInput): string {
  const brandStyle = designToCss(input.design ?? null);
  const captionDivs = input.captions
    .map((c) => renderCaption(c))
    .join("\n      ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Atelier composition</title>
  ${brandStyle}
  <style>
    /* Layout: the document is sized to the doc canvas. Hyperframes captures
       at this resolution; the producer scales encoder output to match. */
    html, body {
      margin: 0;
      padding: 0;
      background: var(--brand-palette-paper, #000);
      width: ${input.width}px;
      height: ${input.height}px;
      overflow: hidden;
      font-family: var(--brand-font-body, system-ui, sans-serif);
    }
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
    }
    /* Source video — full-canvas, object-fit:contain so non-matching
       aspects letterbox rather than crop. */
    .stage > video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    /* Caption layer — bottom third by default, brand-typography aware.
       Hyperframes only renders caption divs during their data-start +
       data-duration window. */
    .caption {
      position: absolute;
      left: 5%;
      right: 5%;
      bottom: 12%;
      text-align: center;
      font-family: var(--brand-font-display, var(--brand-font-body, system-ui, sans-serif));
      font-weight: 700;
      font-size: ${Math.round(input.height * 0.044)}px;
      line-height: 1.2;
      color: var(--brand-palette-paper, #fff);
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
      letter-spacing: 0.01em;
    }
  </style>
</head>
<body>
  <div class="stage">
    <video
      src="assets/${escapeAttr(input.videoFilename)}"
      data-start="0"
      data-duration="${input.videoDurationSeconds}"
      muted="false"
      playsinline
    ></video>
      ${captionDivs}
  </div>
</body>
</html>
`;
}

function renderCaption(c: TranscriptSegment): string {
  const duration = Math.max(0.05, c.end - c.start);
  return `<div class="caption" data-start="${c.start}" data-duration="${duration}">${escapeText(c.text)}</div>`;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
