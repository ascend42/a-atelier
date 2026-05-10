import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import type { AtelierDocument } from "@a-company/atelier-types";
import type {
  VideoCutList,
  VideoTranscript,
  VideoProjectManifest,
} from "@a-company/atelier-types";

export const VIDEO_PROJECT_VERSION = "1.0";

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

/** Read and parse the cuts.json from a VideoProject */
export function readCutList(project: VideoProject): VideoCutList {
  if (!existsSync(project.cutsPath)) {
    return { source: project.manifest.source, cuts: [] };
  }
  return JSON.parse(readFileSync(project.cutsPath, "utf-8")) as VideoCutList;
}

/** Write cuts.json to a VideoProject */
export function writeCutList(project: VideoProject, cuts: VideoCutList): void {
  writeFileSync(project.cutsPath, JSON.stringify(cuts, null, 2), "utf-8");
}

/** Read and parse transcript.json from a VideoProject */
export function readTranscript(project: VideoProject): VideoTranscript | null {
  if (!existsSync(project.transcriptPath)) return null;
  return JSON.parse(readFileSync(project.transcriptPath, "utf-8")) as VideoTranscript;
}

/** Write transcript.json to a VideoProject */
export function writeTranscript(project: VideoProject, transcript: VideoTranscript): void {
  writeFileSync(project.transcriptPath, JSON.stringify(transcript, null, 2), "utf-8");
}

/** Read and parse project.atelier from a VideoProject */
export function readComposition(project: VideoProject): AtelierDocument {
  return JSON.parse(readFileSync(project.compositionPath, "utf-8")) as AtelierDocument;
}

/** Write project.atelier to a VideoProject */
export function writeComposition(project: VideoProject, doc: AtelierDocument): void {
  writeFileSync(project.compositionPath, JSON.stringify(doc, null, 2), "utf-8");
}
