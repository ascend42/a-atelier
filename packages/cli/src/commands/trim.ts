import type { Command } from "commander";
import type { CutEntry } from "@a-company/atelier-types";
import {
  loadVideoProject,
  readCutList,
  writeCutList,
  readComposition,
  writeComposition,
  rewriteCutLayers,
} from "../lib/video-project.js";
import {
  probeSilencedetect,
  probeDuration,
  runSilenceDetect,
} from "../lib/silence-detect.js";
import {
  invertToSpeechIntervals,
  buildInitialCuts,
  resolveOverlaps,
  clampBoundaries,
  mergeWithExisting,
  applyGlobalPadding,
  DEFAULT_PADDING_PRE,
  DEFAULT_PADDING_POST,
} from "../lib/cut-model.js";

export interface TrimOptions {
  /** silencedetect noise threshold, e.g. "-30dB" */
  noise?: string;
  /** Minimum silence duration to register, in seconds */
  minSilence?: number;
  /** Default leading padding for new cuts, in seconds */
  padPre?: number;
  /** Default trailing padding for new cuts, in seconds */
  padPost?: number;
  /** Re-detect match tolerance for preserving user padding, in seconds */
  matchTolerance?: number;
  /** Global tighten across all cuts, in milliseconds (positive number) */
  tightenMs?: number;
  /** Global loosen across all cuts, in milliseconds (positive number) */
  loosenMs?: number;
  /** Apply --pad-pre / --pad-post to one specific cut index only */
  cutIndex?: number;
  /** Discard existing padding; full fresh detect with default padding */
  reset?: boolean;
  /** Don't write files; return result */
  dryRun?: boolean;
}

export interface TrimResult {
  projectDir: string;
  duration: number;
  cuts: CutEntry[];
  layerCount: number;
}

/**
 * Run the silence-trim pipeline on a VideoProject folder.
 *
 * Pipeline:
 *   1. Probe ffmpeg has silencedetect filter
 *   2. ffprobe source duration
 *   3. Run silencedetect → silence intervals
 *   4. Invert to speech intervals
 *   5. Build fresh CutEntry[] with default (or recipe) padding
 *   6. Merge with existing cuts (preserves user padding) unless --reset
 *   7. Apply --tighten / --loosen / --cut overrides
 *   8. Resolve overlaps at silence midpoints
 *   9. Clamp boundaries to [0, duration]
 *   10. Write cuts.json + rewrite silence-trim layers in project.atelier
 */
export async function trimProject(
  projectDir: string,
  options: TrimOptions = {},
): Promise<TrimResult> {
  const project = loadVideoProject(projectDir);

  await probeSilencedetect();
  const duration = await probeDuration(project.sourcePath);

  const silences = await runSilenceDetect(project.sourcePath, {
    noise: options.noise,
    minSilence: options.minSilence,
  });
  const speech = invertToSpeechIntervals(silences, duration);

  const padPre = options.padPre ?? DEFAULT_PADDING_PRE;
  const padPost = options.padPost ?? DEFAULT_PADDING_POST;
  let cuts = buildInitialCuts(speech, padPre, padPost);

  // Re-run preservation — keep user padding on matching raw boundaries
  if (!options.reset) {
    const existing = readCutList(project);
    cuts = mergeWithExisting(cuts, existing.cuts, options.matchTolerance);
  }

  // Global tighten/loosen — applied to current padding (preserves overrides)
  if (typeof options.tightenMs === "number") {
    applyGlobalPadding(cuts, -options.tightenMs / 1000);
  }
  if (typeof options.loosenMs === "number") {
    applyGlobalPadding(cuts, options.loosenMs / 1000);
  }

  // Single-cut override
  if (typeof options.cutIndex === "number") {
    if (options.cutIndex < 0 || options.cutIndex >= cuts.length) {
      throw new Error(
        `--cut ${options.cutIndex} out of range (have ${cuts.length} cuts)`,
      );
    }
    if (options.padPre !== undefined) cuts[options.cutIndex].paddingPre = options.padPre;
    if (options.padPost !== undefined) cuts[options.cutIndex].paddingPost = options.padPost;
  }

  resolveOverlaps(cuts);
  clampBoundaries(cuts, duration);

  const result: TrimResult = {
    projectDir: project.dir,
    duration,
    cuts,
    layerCount: cuts.length,
  };

  if (options.dryRun) return result;

  writeCutList(project, {
    version: "1.1",
    source: project.manifest.source,
    cuts,
  });

  const doc = readComposition(project);
  const updated = rewriteCutLayers(doc, cuts, project.manifest.source, duration);
  writeComposition(project, updated);

  return result;
}

/** Format a TrimResult for human-readable terminal output */
function formatResult(result: TrimResult): string {
  const lines: string[] = [];
  lines.push(`Trimmed ${result.projectDir}`);
  lines.push(`  source duration:  ${result.duration.toFixed(2)}s`);
  lines.push(`  cuts:             ${result.cuts.length}`);
  for (let i = 0; i < result.cuts.length; i++) {
    const c = result.cuts[i];
    const effStart = Math.max(0, c.rawStart - c.paddingPre);
    const effEnd = Math.min(result.duration, c.rawEnd + c.paddingPost);
    const dur = effEnd - effStart;
    lines.push(
      `    [${i}] ${effStart.toFixed(2)}s → ${effEnd.toFixed(2)}s ` +
      `(${dur.toFixed(2)}s, pad ${c.paddingPre.toFixed(2)}/${c.paddingPost.toFixed(2)})` +
      (c.label ? `  "${c.label}"` : ""),
    );
  }
  return lines.join("\n");
}

/** Register `atelier trim` on the Commander program */
export function trimCommand(program: Command): void {
  program
    .command("trim <project>")
    .description(
      "Detect silence and rewrite project.atelier with parametric cuts " +
      "(silence-trim tagged layers). Preserves user padding overrides on re-run.",
    )
    .option("--noise <dB>", "Silence threshold (default: -30dB)", "-30dB")
    .option(
      "--min-silence <seconds>",
      "Minimum silence duration to register (default: 0.35)",
      (v) => parseFloat(v),
      0.35,
    )
    .option(
      "--pad-pre <seconds>",
      `Default leading padding (default: ${DEFAULT_PADDING_PRE})`,
      (v) => parseFloat(v),
    )
    .option(
      "--pad-post <seconds>",
      `Default trailing padding (default: ${DEFAULT_PADDING_POST})`,
      (v) => parseFloat(v),
    )
    .option("--tighten <ms>", "Reduce all current padding by N ms", (v) => parseInt(v, 10))
    .option("--loosen <ms>", "Increase all current padding by N ms", (v) => parseInt(v, 10))
    .option(
      "--cut <index>",
      "Apply --pad-pre / --pad-post to one specific cut only",
      (v) => parseInt(v, 10),
    )
    .option("--reset", "Discard existing padding; re-detect from scratch")
    .option("--dry-run", "Print computed cuts; don't write files")
    .option("--json", "Output result as JSON for piping")
    .action(async (
      project: string,
      opts: {
        noise: string;
        minSilence: number;
        padPre?: number;
        padPost?: number;
        tighten?: number;
        loosen?: number;
        cut?: number;
        reset?: boolean;
        dryRun?: boolean;
        json?: boolean;
      },
    ) => {
      try {
        const result = await trimProject(project, {
          noise: opts.noise,
          minSilence: opts.minSilence,
          padPre: opts.padPre,
          padPost: opts.padPost,
          tightenMs: opts.tighten,
          loosenMs: opts.loosen,
          cutIndex: opts.cut,
          reset: opts.reset,
          dryRun: opts.dryRun,
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatResult(result));
          if (opts.dryRun) console.log("(dry-run — no files written)");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`atelier trim: ${msg}`);
        process.exit(1);
      }
    });
}
