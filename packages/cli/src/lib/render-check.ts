import { spawn } from "node:child_process";

/**
 * Render check: read a rendered video with ffmpeg and print the numbers a
 * motion review needs, instead of letting an agent certify its own render.
 *
 * Gates (fail = fixed, not argued):
 *   G0 render exists  — decodes, has video, is not blank, moves at all,
 *                       duration matches the plan (--expect), audio present
 *                       and not silent when planned (--expect-audio)
 *   G2 no dead frames — no frozen run longer than maxFlatFrames frames,
 *                       except holds the storyboard declares (--allow-hold)
 *   G3 short ending   — the final picture holds at most maxEndHold seconds,
 *                       and the last shot is at most maxFinalShot of the film
 *                       (only when the film has cuts)
 * Reported as a question, never a gate: motion density (mean frame-to-frame
 * luma change). Judged by eye and declared as such: proof readable, one hero
 * per frame, page chrome.
 *
 * Defaults come from launch-film measurements (atelier-produce
 * reference/motion.md); the brand cascade can override every threshold.
 */

export interface Interval {
  start: number;
  end: number;
}

export interface VideoProbe {
  duration: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface FilterReadings {
  freezes: Interval[];
  blacks: Interval[];
  cuts: number[];
  ydif: number[];
  meanVolumeDb: number | null;
}

export interface RenderCheckOptions {
  /** Planned length in seconds (G0) */
  expectSeconds?: number;
  /** Audio is planned: must exist and not be silent (G0) */
  expectAudio?: boolean;
  /** Declared designed holds, exempt from G2 */
  allowHolds?: Interval[];
  /** G2: longest allowed frozen run, in frames (default 3) */
  maxFlatFrames?: number;
  /** G3: longest allowed end hold, in seconds (default 1.4) */
  maxEndHold?: number;
  /** G3: largest allowed share of the film for the last shot (default 0.25) */
  maxFinalShot?: number;
}

export type GateStatus = "pass" | "fail";

export interface GateResult {
  id: "G0" | "G2" | "G3";
  name: string;
  status: GateStatus;
  numbers: Record<string, number | string | boolean | null>;
  problems: string[];
}

export interface RenderCheckReport {
  file: string;
  probe: VideoProbe;
  gates: GateResult[];
  density: { meanFrameChange: number; band: string; question: string | null };
  endHold: { seconds: number; note: string | null };
  declaredHolds: Interval[];
  byEye: string[];
  passed: boolean;
}

export const DEFAULTS = { maxFlatFrames: 3, maxEndHold: 1.4, maxFinalShot: 0.25 } as const;
/** Human whole-film band: median 6.8, IQR 4.4-9.8 (motion.md section 5) */
export const DENSITY = { low: 3, high: 10, median: 6.8 } as const;
const BY_EYE = [
  "proof readable (UI text large enough, magnified by the camera)",
  "one hero per frame",
  "page chrome (corner labels, counters, timecodes) — tell motion-page-chrome",
];

// ── Parsers (pure; unit-tested) ──────────────────────────────────────

/** ffprobe -show_entries stream=codec_type,r_frame_rate:format=duration -of json */
export function parseProbe(json: string): VideoProbe {
  const data = JSON.parse(json) as {
    streams?: { codec_type?: string; r_frame_rate?: string }[];
    format?: { duration?: string };
  };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const [num, den] = (video?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    duration: Number(data.format?.duration ?? 0),
    fps: den ? num / den : 0,
    hasVideo: Boolean(video),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

/** Pair start/end lines in order; an unterminated interval runs to `duration`. */
function pairIntervals(stderr: string, startRe: RegExp, endRe: RegExp, duration: number): Interval[] {
  const out: Interval[] = [];
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = startRe.exec(line);
    if (s) { open = Number(s[1]); continue; }
    const e = endRe.exec(line);
    if (e && open !== null) { out.push({ start: open, end: Number(e[1]) }); open = null; }
  }
  if (open !== null) out.push({ start: open, end: duration });
  return out;
}

export function parseFilterOutput(stderr: string, duration: number): FilterReadings {
  const freezes = pairIntervals(
    stderr,
    /lavfi\.freezedetect\.freeze_start:\s*([\d.]+)/,
    /lavfi\.freezedetect\.freeze_end:\s*([\d.]+)/,
    duration,
  );
  const blacks: Interval[] = [];
  for (const m of stderr.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)) {
    blacks.push({ start: Number(m[1]), end: Number(m[2]) });
  }
  const cuts: number[] = [];
  for (const line of stderr.split("\n")) {
    if (!/Parsed_showinfo/.test(line)) continue;
    const m = /pts_time:\s*([\d.]+)/.exec(line);
    if (m) cuts.push(Number(m[1]));
  }
  const ydif = [...stderr.matchAll(/lavfi\.signalstats\.YDIF=([\d.]+)/g)].map((m) => Number(m[1]));
  const vol = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(stderr);
  const meanVolumeDb = vol ? (vol[1] === "-inf" ? -Infinity : Number(vol[1])) : null;
  return { freezes, blacks, cuts, ydif, meanVolumeDb };
}

/** "1.2-2.4" → { start: 1.2, end: 2.4 } */
export function parseHold(spec: string): Interval {
  const m = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/.exec(spec);
  if (!m || Number(m[2]) <= Number(m[1])) throw new Error(`--allow-hold expects "start-end" in seconds, got "${spec}"`);
  return { start: Number(m[1]), end: Number(m[2]) };
}

// ── Gates (pure; unit-tested) ────────────────────────────────────────

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const total = (xs: Interval[]) => xs.reduce((a, x) => a + (x.end - x.start), 0);

export function evaluate(
  file: string,
  probe: VideoProbe,
  r: FilterReadings,
  opts: RenderCheckOptions = {},
): RenderCheckReport {
  const maxFlat = opts.maxFlatFrames ?? DEFAULTS.maxFlatFrames;
  const maxEnd = opts.maxEndHold ?? DEFAULTS.maxEndHold;
  const maxShot = opts.maxFinalShot ?? DEFAULTS.maxFinalShot;
  const frame = probe.fps > 0 ? 1 / probe.fps : 1 / 30;
  const dur = probe.duration;

  // G0
  const g0: string[] = [];
  if (!probe.hasVideo || dur <= 0) g0.push("no decodable video stream");
  const blackShare = dur > 0 ? total(r.blacks) / dur : 0;
  const frozenShare = dur > 0 ? total(r.freezes) / dur : 0;
  if (blackShare >= 0.98) g0.push(`blank: ${round(blackShare * 100, 0)}% black`);
  if (frozenShare >= 0.98) g0.push(`does not move: ${round(frozenShare * 100, 0)}% frozen`);
  if (opts.expectSeconds !== undefined) {
    const tol = Math.max(0.5, opts.expectSeconds * 0.02);
    if (Math.abs(dur - opts.expectSeconds) > tol) g0.push(`length ${round(dur)} s, planned ${opts.expectSeconds} s`);
  }
  if (opts.expectAudio) {
    if (!probe.hasAudio) g0.push("audio planned but no audio stream");
    else if (r.meanVolumeDb === null || r.meanVolumeDb < -60) g0.push(`audio is silent (mean ${r.meanVolumeDb} dB)`);
  }

  // End hold: a freeze that runs to the last frame
  const last = r.freezes.find((f) => dur - f.end <= frame * 1.5);
  const endHold = last ? last.end - last.start : 0;

  // G2: frozen runs longer than maxFlat frames, minus the end hold (G3's job) and declared holds
  const allowed = opts.allowHolds ?? [];
  const covered = (f: Interval) => allowed.some((a) => f.start >= a.start - frame && f.end <= a.end + frame);
  const dead = r.freezes.filter(
    (f) => f !== last && (f.end - f.start) / frame > maxFlat + 0.5 && !covered(f),
  );
  const g2 = dead.map((f) => `frozen ${round(f.start)}-${round(f.end)} s (${Math.round((f.end - f.start) / frame)} frames)`);

  // G3
  const g3: string[] = [];
  if (endHold > maxEnd) g3.push(`end hold ${round(endHold)} s > ${maxEnd} s`);
  const lastCut = r.cuts.length ? Math.max(...r.cuts) : null;
  const finalShot = lastCut !== null && dur > 0 ? (dur - lastCut) / dur : null;
  if (finalShot !== null && finalShot > maxShot) g3.push(`last shot is ${round(finalShot * 100, 0)}% of the film > ${round(maxShot * 100, 0)}%`);

  const mean = r.ydif.length ? r.ydif.reduce((a, b) => a + b, 0) / r.ydif.length : 0;
  const band = mean < DENSITY.low ? "low" : mean > DENSITY.high ? "high" : "within the human band";
  const question =
    band === "high" ? "Above ~10: does the film breathe anywhere?"
    : band === "low" ? "Below ~3: does it exist? Is anything alive on the holds?"
    : null;

  const gates: GateResult[] = [
    { id: "G0", name: "render exists", status: g0.length ? "fail" : "pass",
      numbers: { duration_s: round(dur), fps: round(probe.fps), black_pct: round(blackShare * 100, 1),
                 frozen_pct: round(frozenShare * 100, 1), audio: probe.hasAudio,
                 mean_volume_db: r.meanVolumeDb === null ? null : round(r.meanVolumeDb, 1) },
      problems: g0 },
    { id: "G2", name: "no dead frames", status: g2.length ? "fail" : "pass",
      numbers: { max_flat_frames: maxFlat, frozen_runs: r.freezes.length, dead_runs: dead.length,
                 declared_holds: allowed.length },
      problems: g2 },
    { id: "G3", name: "short ending", status: g3.length ? "fail" : "pass",
      numbers: { end_hold_s: round(endHold), max_end_hold_s: maxEnd, cuts: r.cuts.length,
                 final_shot_pct: finalShot === null ? "no cuts" : round(finalShot * 100, 0) },
      problems: g3 },
  ];

  return {
    file,
    probe,
    gates,
    density: { meanFrameChange: round(mean), band, question },
    endHold: {
      seconds: round(endHold),
      note: endHold > 0 && endHold < 0.6 ? "ends almost mid-motion (under 0.6 s): fine if intended" : null,
    },
    declaredHolds: allowed,
    byEye: BY_EYE,
    passed: gates.every((g) => g.status === "pass"),
  };
}

// ── Runner ───────────────────────────────────────────────────────────

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => reject(new Error(`${cmd} not found (${e.message}). Install ffmpeg: brew install ffmpeg`)));
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

export async function renderCheck(file: string, opts: RenderCheckOptions = {}): Promise<RenderCheckReport> {
  const pr = await run("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_type,r_frame_rate:format=duration", "-of", "json", file,
  ]);
  if (pr.code !== 0) throw new Error(`ffprobe could not read ${file}: ${pr.stderr.trim()}`);
  const probe = parseProbe(pr.stdout);
  const fps = probe.fps > 0 ? probe.fps : 30;
  // freezedetect reports runs of at least d seconds: one frame more than allowed
  const d = ((opts.maxFlatFrames ?? DEFAULTS.maxFlatFrames) + 1) / fps - 0.001;
  const vf =
    `freezedetect=n=-60dB:d=${d.toFixed(3)},blackdetect=d=0.1:pix_th=0.10,` +
    `signalstats,metadata=print:key=lavfi.signalstats.YDIF,select='gt(scene\\,0.3)',showinfo`;
  const args = ["-hide_banner", "-nostats", "-i", file, "-vf", vf];
  if (probe.hasAudio) args.push("-af", "volumedetect");
  args.push("-f", "null", "-");
  const ff = await run("ffmpeg", args);
  if (ff.code !== 0) throw new Error(`ffmpeg failed on ${file}: ${ff.stderr.split("\n").slice(-3).join(" ")}`);
  return evaluate(file, probe, parseFilterOutput(ff.stderr, probe.duration), opts);
}
