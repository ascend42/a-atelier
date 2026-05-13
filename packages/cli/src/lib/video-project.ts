import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import type { AtelierDocument, Layer } from "@a-company/atelier-types";
import type {
  CutEntry,
  VideoCutList,
  VideoTranscript,
  VideoProjectManifest,
} from "@a-company/atelier-types";

export const VIDEO_PROJECT_VERSION = "1.0";
export const VIDEO_CUTLIST_VERSION = "1.1";
export const VIDEO_TRANSCRIPT_VERSION = "1.1";

/**
 * Compute the effective in/out span for a cut, clamped to source bounds.
 * `start = max(0, rawStart - paddingPre)`, `end = min(duration, rawEnd + paddingPost)`.
 */
export function effectiveSpan(
  cut: CutEntry,
  duration: number,
): { start: number; end: number } {
  return {
    start: Math.max(0, cut.rawStart - cut.paddingPre),
    end: Math.min(duration, cut.rawEnd + cut.paddingPost),
  };
}

/** Resolved absolute paths for all files in a VideoProject folder */
export interface VideoProject {
  /** Absolute path to the project folder */
  dir: string;
  /** Absolute path to source video file */
  sourcePath: string;
  /** Absolute path to project.atelier composition */
  compositionPath: string;
  /** Absolute path to transcript.json */
  transcriptPath: string;
  /** Absolute path to cuts.json */
  cutsPath: string;
  /** Absolute path to export/ directory */
  exportDir: string;
  /** Manifest metadata */
  manifest: VideoProjectManifest;
}

/**
 * Scaffold a new VideoProject folder from a source video file.
 *
 * Creates the folder at `destDir` (defaults to same directory as source,
 * named after the video file without extension). Copies the source video
 * into the folder as "source<ext>". Writes an empty draft project.atelier,
 * an empty cuts.json, and creates the export/ directory.
 *
 * Does NOT run metadata extraction — the caller (`atelier edit`, T-005)
 * probes duration/fps via ffprobe and fills in videoMeta before saving.
 */
export async function createVideoProject(
  srcPath: string,
  destDir?: string,
): Promise<VideoProject> {
  const absSrc = resolve(srcPath);
  const ext = extname(absSrc);
  const stem = basename(absSrc, ext);

  const projectDir = destDir ? resolve(destDir) : join(resolve(absSrc, ".."), stem);

  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  const sourceFilename = `source${ext}`;
  const sourcePath = join(projectDir, sourceFilename);

  // Copy source only if not already in place (idempotent re-init)
  if (!existsSync(sourcePath)) {
    copyFileSync(absSrc, sourcePath);
  }

  const compositionPath = join(projectDir, "project.atelier");
  const transcriptPath = join(projectDir, "transcript.json");
  const cutsPath = join(projectDir, "cuts.json");
  const exportDir = join(projectDir, "export");

  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true });
  }

  const manifest: VideoProjectManifest = {
    source: sourceFilename,
    composition: "project.atelier",
    transcript: "transcript.json",
    cuts: "cuts.json",
    exportDir: "export/",
    createdAt: new Date().toISOString(),
    version: VIDEO_PROJECT_VERSION,
  };

  // Draft composition — caller fills in canvas dimensions and videoMeta after probing
  const draft: AtelierDocument = {
    version: "1.0",
    name: stem,
    canvas: { width: 1920, height: 1080, fps: 30 },
    assets: {
      src: {
        type: "video",
        src: sourceFilename,
        description: `Source: ${basename(absSrc)}`,
      },
    },
    layers: [
      {
        id: "clip-0",
        visual: {
          type: "video",
          assetId: "src",
          src: sourceFilename,
          startFrame: 0,
          sourceOffset: 0,
          playbackRate: 1.0,
          objectFit: "contain",
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 1920, height: 1080 },
      },
    ],
    states: {
      default: {
        duration: 0,
        deltas: [],
      },
    },
  };

  if (!existsSync(compositionPath)) {
    writeFileSync(compositionPath, JSON.stringify(draft, null, 2), "utf-8");
  }

  const initialCuts: VideoCutList = {
    version: VIDEO_CUTLIST_VERSION,
    source: sourceFilename,
    cuts: [],
  };

  if (!existsSync(cutsPath)) {
    writeFileSync(cutsPath, JSON.stringify(initialCuts, null, 2), "utf-8");
  }

  return {
    dir: projectDir,
    sourcePath,
    compositionPath,
    transcriptPath,
    cutsPath,
    exportDir,
    manifest,
  };
}

/**
 * Load an existing VideoProject from a folder path.
 * Does not validate that the composition or cut list are well-formed —
 * callers that need that should use lintFile() after loading.
 */
export function loadVideoProject(dir: string): VideoProject {
  const projectDir = resolve(dir);

  // Detect source file (source.mp4, source.mov, etc.)
  const possibleExts = [".mp4", ".mov", ".webm", ".mkv", ".avi"];
  let sourceFilename = "source.mp4";
  for (const ext of possibleExts) {
    if (existsSync(join(projectDir, `source${ext}`))) {
      sourceFilename = `source${ext}`;
      break;
    }
  }

  const manifest: VideoProjectManifest = {
    source: sourceFilename,
    composition: "project.atelier",
    transcript: "transcript.json",
    cuts: "cuts.json",
    exportDir: "export/",
    createdAt: new Date().toISOString(),
    version: VIDEO_PROJECT_VERSION,
  };

  return {
    dir: projectDir,
    sourcePath: join(projectDir, sourceFilename),
    compositionPath: join(projectDir, "project.atelier"),
    transcriptPath: join(projectDir, "transcript.json"),
    cutsPath: join(projectDir, "cuts.json"),
    exportDir: join(projectDir, "export"),
    manifest,
  };
}

/**
 * Read and parse cuts.json from a VideoProject.
 *
 * Migrates legacy 1.0 cuts (flat { start, end }) to 1.1 parametric form
 * (rawStart/rawEnd + zero padding) on the fly. Writers always emit 1.1.
 */
export function readCutList(project: VideoProject): VideoCutList {
  if (!existsSync(project.cutsPath)) {
    return { version: VIDEO_CUTLIST_VERSION, source: project.manifest.source, cuts: [] };
  }
  const raw = JSON.parse(readFileSync(project.cutsPath, "utf-8")) as {
    version?: string;
    source: string;
    cuts: Array<CutEntry | { start: number; end: number; label?: string }>;
  };

  const cuts: CutEntry[] = raw.cuts.map((entry) => {
    if ("rawStart" in entry) return entry;
    // Legacy 1.0 migration — stored start/end become rawStart/rawEnd with zero padding.
    return {
      rawStart: entry.start,
      rawEnd: entry.end,
      paddingPre: 0,
      paddingPost: 0,
      ...(entry.label !== undefined && { label: entry.label }),
    };
  });

  return {
    version: VIDEO_CUTLIST_VERSION,
    source: raw.source,
    cuts,
  };
}

/** Write cuts.json to a VideoProject (always at the current cut list version) */
export function writeCutList(project: VideoProject, cuts: VideoCutList): void {
  const payload: VideoCutList = { ...cuts, version: VIDEO_CUTLIST_VERSION };
  writeFileSync(project.cutsPath, JSON.stringify(payload, null, 2), "utf-8");
}

/**
 * Read and parse transcript.json from a VideoProject.
 *
 * Migrates legacy 1.0 transcripts (TranscriptWord had flat `word: string`)
 * to 1.1 (`detected` + `text` + flags) on the fly. Writers always emit 1.1.
 */
export function readTranscript(project: VideoProject): VideoTranscript | null {
  if (!existsSync(project.transcriptPath)) return null;
  const raw = JSON.parse(readFileSync(project.transcriptPath, "utf-8")) as {
    version?: string;
    language?: string;
    segments: Array<{
      text: string;
      start: number;
      end: number;
      words: Array<
        // 1.1 shape
        | { detected: string; text: string; start: number; end: number; confidence?: number; userEdited?: boolean; userAdded?: boolean; hidden?: boolean }
        // 1.0 legacy shape
        | { word: string; start: number; end: number; confidence?: number }
      >;
    }>;
  };

  const segments = raw.segments.map((seg) => ({
    text: seg.text,
    start: seg.start,
    end: seg.end,
    words: seg.words.map((w) => {
      if ("detected" in w) return w;
      // 1.0 migration — `word` becomes both detected and text
      return {
        detected: w.word,
        text: w.word,
        start: w.start,
        end: w.end,
        ...(w.confidence !== undefined && { confidence: w.confidence }),
      };
    }),
  }));

  return {
    version: VIDEO_TRANSCRIPT_VERSION,
    ...(raw.language !== undefined && { language: raw.language }),
    segments,
  };
}

/** Write transcript.json to a VideoProject (always at the current transcript version) */
export function writeTranscript(project: VideoProject, transcript: VideoTranscript): void {
  const payload: VideoTranscript = { ...transcript, version: VIDEO_TRANSCRIPT_VERSION };
  writeFileSync(project.transcriptPath, JSON.stringify(payload, null, 2), "utf-8");
}

/** Read and parse project.atelier from a VideoProject */
export function readComposition(project: VideoProject): AtelierDocument {
  return JSON.parse(readFileSync(project.compositionPath, "utf-8")) as AtelierDocument;
}

/** Write project.atelier to a VideoProject */
export function writeComposition(project: VideoProject, doc: AtelierDocument): void {
  writeFileSync(project.compositionPath, JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * Rewrite the silence-trim layers in a composition from a current cut list.
 *
 * Drops every layer tagged "silence-trim" then appends one VideoVisual layer
 * per cut, in temporal order, with cumulative startFrame computed from prior
 * clip durations. All other layers (user-authored, captions, overlays) are
 * preserved untouched — this is the tag-namespace isolation invariant.
 */
export function rewriteCutLayers(
  doc: AtelierDocument,
  cuts: CutEntry[],
  sourceFilename: string,
  sourceDuration: number,
  assetId = "src",
): AtelierDocument {
  const preserved = doc.layers.filter((l) => !(l.tags ?? []).includes("silence-trim"));
  const fps = doc.canvas.fps;

  let cumulativeFrame = 0;
  const trimLayers: Layer[] = cuts.map((cut, idx) => {
    const span = effectiveSpan(cut, sourceDuration);
    const sourceOffsetFrames = Math.floor(span.start * fps) / fps;
    const sourceEndFrames = Math.ceil(span.end * fps) / fps;
    const durationFrames = Math.max(1, Math.round((sourceEndFrames - sourceOffsetFrames) * fps));

    const layer: Layer = {
      id: `clip-trim-${idx}`,
      tags: ["silence-trim"],
      visual: {
        type: "video",
        assetId,
        src: sourceFilename,
        startFrame: cumulativeFrame,
        sourceOffset: sourceOffsetFrames,
        sourceEnd: sourceEndFrames,
        playbackRate: 1.0,
        objectFit: "contain",
      },
      frame: { x: 0, y: 0 },
      bounds: { width: doc.canvas.width, height: doc.canvas.height },
    };
    cumulativeFrame += durationFrames;
    return layer;
  });

  return { ...doc, layers: [...preserved, ...trimLayers] };
}
