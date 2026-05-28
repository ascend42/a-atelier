#!/usr/bin/env node
/**
 * Spike: render creator/demo/vid.atelier through the v2 Hyperframes path.
 *
 * Inputs (hardcoded for the demo — the proper CLI verb lands in task #5):
 *   - Doc:    creator/demo/vid.atelier         (canvas dims, video src, duration)
 *   - Audio:  via the video element (Hyperframes muxes natively)
 *   - Caps:   creator/demo/transcripts/IMG_7346.json
 *   - Brand:  (skipped v0 — DESIGN.md scaffolding has TODO palette)
 *
 * Outputs:
 *   - Scaffolded HF project at /tmp/atelier-spike-<ts>/
 *   - Final MP4 at creator/demo/exports/demo-v2-spike-<ts>.mp4
 *
 * Run: node packages/hyperframes-adapter/scripts/spike-demo.mjs
 */

import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scaffoldHyperframesProject,
  runRender,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");

const docPath = join(REPO, "creator/demo/vid.atelier");
const transcriptPath = join(REPO, "creator/demo/transcripts/IMG_7346.json");
const exportsDir = join(REPO, "creator/demo/exports");
const ts = Date.now();
const outDir = mkdtempSync(join(tmpdir(), `atelier-spike-${ts}-`));
const outputMp4 = join(exportsDir, `demo-v2-spike-${ts}.mp4`);

console.log(`→ doc:        ${docPath}`);
console.log(`→ transcript: ${transcriptPath}`);
console.log(`→ scaffold:   ${outDir}`);
console.log(`→ render to:  ${outputMp4}`);
console.log();

const doc = JSON.parse(readFileSync(docPath, "utf8"));
const videoLayer = doc.layers.find((l) => l.visual?.type === "video");
if (!videoLayer) throw new Error("no video layer in doc");
const videoSrc = videoLayer.visual.src; // "media/IMG_7346.MOV"
const sourceFile = join(REPO, "creator/demo", videoSrc);
const filename = videoSrc.split("/").pop();
const durationS = videoLayer.visual.sourceEnd ?? (doc.states.default.duration / doc.canvas.fps);

const transcript = JSON.parse(readFileSync(transcriptPath, "utf8"));
// One overlay per transcript segment. Each segment carries its own
// start/end seconds — those map directly onto Hyperframes data-start /
// data-duration. Word-level alignment is ignored at v0; finer-grained
// per-word overlays will be a v1.0 follow-up once the technique-library
// has caption-style bindings.
const captions = (transcript.segments ?? []).map((seg) => ({
  start: seg.start,
  end: seg.end,
  text: seg.text,
}));

console.log(`Video: ${filename} (${durationS}s)`);
console.log(`Captions: ${captions.length} segments`);
console.log();

console.log("→ scaffolding Hyperframes project…");
const scaffold = scaffoldHyperframesProject({
  outDir,
  projectName: doc.name ?? "atelier-spike",
  storyboard: {
    width: doc.canvas.width,
    height: doc.canvas.height,
    videoFilename: filename,
    videoDurationSeconds: durationS,
    captions,
    // design left null — DESIGN.md still holds template placeholders;
    // when it ships real palette, plumb a parser here.
  },
  sourceFiles: [sourceFile],
});
console.log(`   index:  ${scaffold.indexHtmlPath}`);
console.log(`   meta:   ${scaffold.metaJsonPath}`);
console.log(`   assets: ${Object.values(scaffold.assetsInjected).join(", ")}`);
if (scaffold.assetsSkipped.length) {
  console.warn(`   SKIPPED: ${scaffold.assetsSkipped.join(", ")}`);
}
console.log();

console.log("→ running Hyperframes producer…");
const startedAt = Date.now();
const result = await runRender({
  projectDir: outDir,
  outputPath: outputMp4,
  width: doc.canvas.width,
  height: doc.canvas.height,
  fps: doc.canvas.fps,
  onProgress: ({ stage, percent, message }) => {
    process.stdout.write(`\r   [${stage}] ${percent}% — ${message}`.padEnd(120));
  },
});
process.stdout.write("\n");
console.log();
console.log(`✓ done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
console.log(`  output:    ${result.outputPath}`);
console.log(`  duration:  ${result.durationSeconds}s`);
console.log(`  frames:    ${result.totalFrames}`);
console.log();
console.log(`Scaffold preserved at: ${outDir}`);
console.log(`(open ${outDir}/index.html in a browser to inspect)`);
