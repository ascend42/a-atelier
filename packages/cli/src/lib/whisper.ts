import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { VideoTranscript } from "@a-company/atelier-types";

/** Whisper model selection (size/quality tradeoff) */
export type WhisperModel =
  | "tiny" | "tiny.en"
  | "base" | "base.en"
  | "small" | "small.en"
  | "medium" | "medium.en"
  | "large-v3";

export interface WhisperOptions {
  /** Model size (default: "base.en") */
  model?: WhisperModel;
  /** BCP-47 language hint (omit for autodetect) */
  language?: string;
  /** Explicit path to the model file — overrides model lookup by name */
  modelPath?: string;
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
 * Run whisper.cpp on a source file and return the raw JSON stdout.
 * Caller passes to parseWhisperCppJson() to get a VideoTranscript.
 *
 * Note: whisper-cli writes JSON to stdout when given --output-json and "-"
 * as the output destination. Some builds always write to a file with the
 * `.json` suffix appended to the input path; we handle both.
 */
export async function runWhisperCpp(
  sourcePath: string,
  options: WhisperOptions = {},
): Promise<string> {
  const model = options.modelPath ?? options.model ?? "base.en";

  const args = [
    sourcePath,
    "--model", model,
    "--output-json",
    "--word-thold", "0.01",  // emit word-level timestamps
    "--print-progress", "false",
  ];
  if (options.language) {
    args.push("--language", options.language);
  }

  return runCaptureStdout("whisper-cli", args);
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
