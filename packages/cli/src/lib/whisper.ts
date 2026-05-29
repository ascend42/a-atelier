import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { homedir, tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { VideoTranscript } from "@a-company/atelier-types";

/**
 * Whisper model selection (size/quality tradeoff).
 *
 * The set mirrors whisper.cpp's published model registry on HuggingFace
 * (https://huggingface.co/ggerganov/whisper.cpp). Quantized variants and
 * the v3-turbo line are first-class — creators get the best local-quality
 * tradeoff without needing to know the model-zoo URL by heart.
 *
 * Note: the type is intentionally open to `string` via the fallback union so a
 * creator can pass a future model name (e.g. a new quant variant) without us
 * having to ship a code change. `resolveWhisperModelPath` will attempt to
 * resolve any string against the cache + HuggingFace registry.
 */
export type WhisperModel =
  | "tiny" | "tiny.en"
  | "base" | "base.en"
  | "small" | "small.en"
  | "medium" | "medium.en"
  | "large-v3"
  | "large-v3-turbo"
  | "large-v3-turbo-q5_0"
  | "large-v3-q5_0"
  | (string & {});

export interface WhisperOptions {
  /** Model size (default: "base.en") */
  model?: WhisperModel;
  /** BCP-47 language hint (omit for autodetect) */
  language?: string;
  /** Explicit path to the model file — overrides model lookup by name */
  modelPath?: string;
  /**
   * Optional progress callback for model download (bytes received, total bytes
   * when known). Surfaced as a one-time download on first use of any model name.
   */
  onProgress?: (received: number, total: number | null) => void;
}

/** Backend that produced a transcript run */
export type WhisperBackend = "whisper-cpp" | "openai-api" | "none";

/**
 * Probe which Whisper backend is available on this machine.
 * - "whisper-cpp" if `whisper-cli` is on PATH
 * - "openai-api" if OPENAI_API_KEY is set and --use-api requested
 * - "none" otherwise — caller throws with install guidance
 */
export async function probeWhisper(): Promise<WhisperBackend> {
  if (await commandExists("whisper-cli")) return "whisper-cpp";
  if (process.env.OPENAI_API_KEY) return "openai-api";
  return "none";
}

/**
 * Standard whisper.cpp cache directory — `~/.cache/whisper.cpp/models/`.
 * Matches the convention upstream tools (`whisper.cpp/models/download-ggml-model.sh`)
 * use, so a model cached by one tool is found by another.
 */
export function whisperCacheDir(): string {
  return join(homedir(), ".cache", "whisper.cpp", "models");
}

/** Build the canonical cache path for a model name. */
export function modelCachePath(model: string): string {
  return join(whisperCacheDir(), `ggml-${model}.bin`);
}

/**
 * Resolve a `WhisperModel` value to an absolute file path on disk.
 *
 * Lookup order:
 *   1. Absolute path → return as-is if it exists.
 *   2. Model name → `~/.cache/whisper.cpp/models/ggml-<name>.bin` → return if present.
 *   3. Missing → invoke `downloadWhisperModel` (HuggingFace public registry),
 *      stream into cache, return resolved path.
 *
 * Local-only at runtime after the first download. No online service is
 * called per-invocation. Per TD-2026-05-27-723 (local-only by default).
 */
export async function resolveWhisperModelPath(
  model: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<string> {
  // (1) Absolute path passthrough — supports a creator overriding the default
  // cache location (e.g. shared models on a mounted drive).
  if (isAbsolute(model)) {
    if (!existsSync(model)) {
      throw new Error(`whisper model file not found at absolute path: ${model}`);
    }
    return model;
  }

  // (2) Try the standard cache path.
  const cached = modelCachePath(model);
  if (existsSync(cached)) return cached;

  // (3) Download from HuggingFace, surface progress, then return cache path.
  await downloadWhisperModel(model, onProgress);
  if (!existsSync(cached)) {
    throw new Error(
      `whisper model download appeared to succeed but the file is missing at ${cached}`,
    );
  }
  return cached;
}

/**
 * Download a whisper.cpp model from the HuggingFace public registry into the
 * local cache. Uses `fetch` + streaming pipeline (no new top-level dep).
 *
 * Source: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<model>.bin
 * — the canonical public mirror upstream whisper.cpp tooling targets. No auth
 * required, no telemetry — a single one-shot fetch on first use.
 */
export async function downloadWhisperModel(
  model: string,
  onProgress?: (received: number, total: number | null) => void,
): Promise<string> {
  const dir = whisperCacheDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dest = modelCachePath(model);
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${model}.bin`;

  // Use a .part file then rename, so an aborted download doesn't masquerade
  // as a complete cached model on the next run.
  const partPath = `${dest}.part`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `failed to download whisper model "${model}" (HTTP ${res.status} ${res.statusText}) ` +
      `from ${url} — check the model name`,
    );
  }
  if (!res.body) {
    throw new Error(`whisper model download produced no body (model: ${model})`);
  }

  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? parseInt(totalHeader, 10) : null;

  let received = 0;
  // Wrap the WHATWG ReadableStream into a Node Readable for pipeline. Tap the
  // stream for progress accounting via a small Transform-ish pass-through.
  const nodeStream = Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream);
  nodeStream.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (onProgress) onProgress(received, total);
  });

  await pipeline(nodeStream, createWriteStream(partPath));

  // Atomic-ish rename so a partial file never has the canonical name.
  // Cross-platform rename through fs (synchronous since the file just closed).
  const { renameSync, unlinkSync } = await import("node:fs");
  if (existsSync(dest)) {
    try { unlinkSync(dest); } catch { /* swallow */ }
  }
  renameSync(partPath, dest);

  return dest;
}

/**
 * Run whisper.cpp on a source file and return the raw JSON stdout.
 * Caller passes to parseWhisperCppJson() to get a VideoTranscript.
 *
 * Note: whisper-cli writes JSON to stdout when given --output-json and "-"
 * as the output destination. Some builds always write to a file with the
 * `.json` suffix appended to the input path; we handle both.
 *
 * Model resolution: if `options.modelPath` is set, it's passed through. Else
 * `options.model` (default `base.en`) is resolved via `resolveWhisperModelPath`,
 * downloading from the HuggingFace public registry on first use. Once the
 * model is cached, no network call is made.
 */
export async function runWhisperCpp(
  sourcePath: string,
  options: WhisperOptions = {},
): Promise<string> {
  const modelName = options.modelPath ?? options.model ?? "base.en";
  // resolveWhisperModelPath handles: absolute path passthrough, cache lookup,
  // and one-time download. Always pass the RESULT to whisper-cli as an
  // explicit path so we don't depend on whisper-cli's own model resolution.
  const resolvedModelPath = await resolveWhisperModelPath(modelName, options.onProgress);

  // whisper.cpp can only ingest WAV. For any other container (mp4/mov/webm/m4a/...)
  // we pre-extract to a 16kHz mono PCM WAV via ffmpeg (the format whisper expects).
  // Pure local; no online dependency. ffmpeg is a separate install (brew install ffmpeg).
  const { audioPath, tempDir } = await extractAudioForWhisper(sourcePath);

  try {
    const args = [
      audioPath,
      "--model", resolvedModelPath,
      "--output-json-full",   // word-level timestamps in the JSON output
      "--word-thold", "0.01",
      "--print-progress", "false",
    ];
    if (options.language) {
      args.push("--language", options.language);
    }

    const stdout = await runCaptureStdout("whisper-cli", args);

    // whisper-cli historically writes the JSON to a file (<input>.json),
    // not stdout. If the sidecar file exists, prefer it; otherwise fall back
    // to stdout (some forks/options emit there).
    const jsonSidecar = `${audioPath}.json`;
    if (existsSync(jsonSidecar)) {
      return readFileSync(jsonSidecar, "utf-8");
    }
    return stdout;
  } finally {
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* swallow */ }
    }
  }
}

/**
 * Ensure we hand whisper-cli a WAV file. If the source is already WAV, pass through.
 * Otherwise extract via ffmpeg into a tempdir we control + cleanup ourselves.
 * Local-only — ffmpeg is the system tool, no network.
 */
async function extractAudioForWhisper(
  sourcePath: string,
): Promise<{ audioPath: string; tempDir: string | null }> {
  const lower = sourcePath.toLowerCase();
  if (lower.endsWith(".wav")) return { audioPath: sourcePath, tempDir: null };

  if (!(await commandExists("ffmpeg"))) {
    throw new Error(
      `ffmpeg not found on PATH. Whisper.cpp only ingests WAV; non-WAV sources ` +
      `(${sourcePath}) need ffmpeg to extract audio. Install with: brew install ffmpeg.`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), "atelier-whisper-"));
  const audioPath = join(tempDir, "audio.wav");

  // 16kHz mono PCM s16le — exactly what whisper.cpp expects internally.
  // `-y` overwrites if a stale file somehow exists; `-loglevel error` keeps stderr quiet.
  await runOk("ffmpeg", [
    "-loglevel", "error",
    "-y",
    "-i", sourcePath,
    "-ar", "16000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    audioPath,
  ]);

  return { audioPath, tempDir };
}

/** Run a command, throw on non-zero exit. Stdout/stderr discarded. */
async function runOk(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim() || "(no stderr)"}`));
    });
  });
}

/**
 * Parse whisper.cpp --output-json output into a VideoTranscript.
 *
 * whisper.cpp emits a structure like:
 *   {
 *     "result": { "language": "en" },
 *     "transcription": [
 *       {
 *         "timestamps": { "from": "00:00:00,000", "to": "00:00:02,300" },
 *         "offsets":    { "from": 0,                "to": 2300 },
 *         "text": " Hello world",
 *         "tokens": [ ... ]   // optional per-token detail
 *       }
 *     ]
 *   }
 *
 * Token-level word timestamps come via the "tokens" array on each segment
 * when --output-json-full is used. With --output-json (lighter), only
 * segment-level boundaries are present and we synthesize word timing by
 * even split across the segment.
 *
 * Exported for unit testing.
 */
export function parseWhisperCppJson(jsonStr: string): VideoTranscript {
  const raw = JSON.parse(jsonStr) as {
    result?: { language?: string };
    transcription?: Array<{
      offsets?: { from: number; to: number };
      timestamps?: { from: string; to: string };
      text: string;
      tokens?: Array<{
        text: string;
        offsets?: { from: number; to: number };
        timestamps?: { from: string; to: string };
        p?: number;  // probability/confidence
      }>;
    }>;
  };

  const segments = (raw.transcription ?? []).map((seg) => {
    const segStart = (seg.offsets?.from ?? 0) / 1000;
    const segEnd = (seg.offsets?.to ?? 0) / 1000;
    const segText = seg.text.trim();

    let words;
    if (seg.tokens && seg.tokens.length > 0) {
      // Token-level detail available — emit one word per non-special token
      words = seg.tokens
        .filter((t) => t.text.trim().length > 0 && !t.text.startsWith("[_"))
        .map((t) => ({
          detected: t.text.trim(),
          text: t.text.trim(),
          start: (t.offsets?.from ?? segStart * 1000) / 1000,
          end: (t.offsets?.to ?? segEnd * 1000) / 1000,
          ...(t.p !== undefined && { confidence: t.p }),
        }));
    } else {
      // Fall back to even-split across segment
      const tokens = segText.split(/\s+/).filter((t) => t.length > 0);
      const span = segEnd - segStart;
      const per = tokens.length > 0 ? span / tokens.length : 0;
      words = tokens.map((tok, i) => ({
        detected: tok,
        text: tok,
        start: segStart + i * per,
        end: segStart + (i + 1) * per,
      }));
    }

    return {
      text: segText,
      start: segStart,
      end: segEnd,
      words,
    };
  });

  return {
    version: "1.1",
    ...(raw.result?.language !== undefined && { language: raw.result.language }),
    segments,
  };
}

// ─── subprocess plumbing ─────────────────────────────────────────

/** Check whether a binary is callable on PATH (cross-platform-ish via `which` / `where`) */
export async function commandExists(name: string): Promise<boolean> {
  // If user passed an absolute path, just check the file
  if (name.startsWith("/") || name.match(/^[A-Z]:\\/)) {
    return existsSync(name);
  }
  return new Promise((resolve) => {
    const probe = spawn(process.platform === "win32" ? "where" : "which", [name], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

function runCaptureStdout(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.stderr.on("data", (b) => (stderr += b.toString()));
    proc.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(new Error(
          `${cmd} not found on PATH. Install whisper.cpp (brew install whisper-cpp) ` +
          `or run \`pnpm add @xenova/transformers\` for the ONNX fallback.`,
        ));
      } else {
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited ${code}\n${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

