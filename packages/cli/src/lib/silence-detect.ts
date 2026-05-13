import { spawn } from "node:child_process";

/** A detected silence interval, in seconds from source start */
export interface SilenceInterval {
  start: number;
  end: number;
}

/** Options for the ffmpeg silencedetect filter */
export interface SilenceDetectOptions {
  /** Threshold below which audio counts as silence (default: "-30dB") */
  noise?: string;
  /** Minimum silence duration in seconds to register (default: 0.35) */
  minSilence?: number;
}

/**
 * Verify the local ffmpeg build has the silencedetect filter compiled in.
 * Fails loud and early if missing — some minimal builds disable filters.
 */
export async function probeSilencedetect(): Promise<void> {
  const stdout = await runCapture("ffmpeg", ["-hide_banner", "-filters"]);
  if (!/\bsilencedetect\b/.test(stdout)) {
    throw new Error(
      "Your ffmpeg build lacks the silencedetect filter. " +
      "Install a standard ffmpeg ≥ 4.0 (brew install ffmpeg / apt install ffmpeg).",
    );
  }
}

/**
 * Probe source video duration via ffprobe, in seconds.
 * Used for boundary clamping of the trailing cut.
 */
export async function probeDuration(sourcePath: string): Promise<number> {
  const stdout = await runCapture("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    sourcePath,
  ]);
  const n = parseFloat(stdout.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`ffprobe returned invalid duration for ${sourcePath}: "${stdout}"`);
  }
  return n;
}

/**
 * Run ffmpeg silencedetect on a source file, return list of silence intervals.
 *
 * silencedetect writes paired lines to stderr:
 *   [silencedetect @ 0x...] silence_start: 1.234
 *   [silencedetect @ 0x...] silence_end: 5.678 | silence_duration: 4.444
 *
 * Output to null muxer — no decoded frames, just the filter walking the audio.
 */
export async function runSilenceDetect(
  sourcePath: string,
  options: SilenceDetectOptions = {},
): Promise<SilenceInterval[]> {
  const noise = options.noise ?? "-30dB";
  const minSilence = options.minSilence ?? 0.35;
  const filter = `silencedetect=noise=${noise}:d=${minSilence}`;

  const stderr = await runCaptureStderr("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", sourcePath,
    "-af", filter,
    "-f", "null",
    "-",
  ]);

  return parseSilenceDetectStderr(stderr);
}

/**
 * Parse ffmpeg's silencedetect stderr output into intervals.
 * Pairs start/end lines in order; tolerates other filter chatter interleaved.
 * Exported for unit testing.
 */
export function parseSilenceDetectStderr(stderr: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  const startRe = /silence_start:\s*(-?[\d.]+)/;
  const endRe = /silence_end:\s*(-?[\d.]+)/;

  let pendingStart: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const sm = line.match(startRe);
    if (sm) {
      pendingStart = parseFloat(sm[1]);
      continue;
    }
    const em = line.match(endRe);
    if (em && pendingStart !== null) {
      const end = parseFloat(em[1]);
      // silencedetect can emit start <0 if audio starts in silence — clamp
      intervals.push({ start: Math.max(0, pendingStart), end });
      pendingStart = null;
    }
  }
  return intervals;
}

// ─── subprocess plumbing ─────────────────────────────────────────

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(new Error(`${cmd} not found on PATH. Install ffmpeg/ffprobe (brew install ffmpeg).`));
      } else {
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited ${code}`));
      else resolve(stdout);
    });
  });
}

function runCaptureStderr(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (b) => (stderr += b.toString()));
    proc.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(new Error(`${cmd} not found on PATH. Install ffmpeg (brew install ffmpeg).`));
      } else {
        reject(err);
      }
    });
    // null muxer always exits non-zero on EOF in some ffmpeg builds — accept any code
    proc.on("close", () => resolve(stderr));
  });
}
