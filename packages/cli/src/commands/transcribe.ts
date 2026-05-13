import type { Command } from "commander";
import type { VideoTranscript } from "@a-company/atelier-types";
import {
  loadVideoProject,
  readTranscript,
  writeTranscript,
  readComposition,
  writeComposition,
} from "../lib/video-project.js";
import {
  probeWhisper,
  runWhisperCpp,
  parseWhisperCppJson,
  type WhisperModel,
} from "../lib/whisper.js";
import { mergeTranscriptWithExisting } from "../lib/transcript-model.js";
import { rewriteCaptionLayers, type BuildCaptionsOptions } from "../lib/caption-builder.js";
import { loadRecipe, applyRecipeToTranscribeOptions } from "../lib/recipe.js";

export interface TranscribeOptions {
  /** Whisper model selection */
  model?: WhisperModel;
  /** BCP-47 language hint (omit for autodetect) */
  language?: string;
  /** Discard existing user edits; full fresh transcript */
  reset?: boolean;
  /** Skip caption layer generation; transcript.json only */
  noCaptions?: boolean;
  /** Don't write files; return result */
  dryRun?: boolean;
  /** Caption style + grouping overrides, typically supplied by a Studio Recipe */
  captionOptions?: BuildCaptionsOptions;
}

export interface TranscribeResult {
  projectDir: string;
  backend: string;
  transcript: VideoTranscript;
  wordCount: number;
  captionsGenerated: boolean;
}

/**
 * Run the transcription pipeline on a VideoProject folder.
 *
 * Pipeline:
 *   1. Probe Whisper backend (whisper-cpp / openai-api / none)
 *   2. Run Whisper → raw transcript JSON
 *   3. Parse into VideoTranscript shape
 *   4. Merge with existing transcript (preserves user edits) unless --reset
 *   5. Write transcript.json
 *   6. Unless --no-captions: rewriteCaptionLayers in project.atelier
 */
export async function transcribeProject(
  projectDir: string,
  options: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const project = loadVideoProject(projectDir);

  const backend = await probeWhisper();
  if (backend === "none") {
    throw new Error(
      "No Whisper backend available. Install whisper.cpp (brew install whisper-cpp) " +
      "or set OPENAI_API_KEY and pass --use-api.",
    );
  }
  if (backend === "openai-api") {
    // Reserved for the --use-api opt-in path; not implemented in this milestone
    throw new Error(
      "OpenAI API backend is not yet implemented. Install whisper.cpp for local transcription.",
    );
  }

  const rawJson = await runWhisperCpp(project.sourcePath, {
    model: options.model,
    language: options.language,
  });
  let transcript = parseWhisperCppJson(rawJson);

  // Re-run preservation — keep user edits on matching detected words
  if (!options.reset) {
    const existing = readTranscript(project);
    if (existing) {
      transcript = mergeTranscriptWithExisting(transcript, existing);
    }
  }

  const wordCount = transcript.segments.reduce((n, s) => n + s.words.length, 0);

  const result: TranscribeResult = {
    projectDir: project.dir,
    backend,
    transcript,
    wordCount,
    captionsGenerated: false,
  };

  if (options.dryRun) return result;

  writeTranscript(project, transcript);

  if (!options.noCaptions) {
    const doc = readComposition(project);
    const updated = rewriteCaptionLayers(doc, transcript, options.captionOptions);
    writeComposition(project, updated);
    result.captionsGenerated = true;
  }

  return result;
}

function formatResult(result: TranscribeResult): string {
  const lines: string[] = [];
  lines.push(`Transcribed ${result.projectDir} via ${result.backend}`);
  if (result.transcript.language) {
    lines.push(`  language:  ${result.transcript.language}`);
  }
  lines.push(`  segments:  ${result.transcript.segments.length}`);
  lines.push(`  words:     ${result.wordCount}`);
  if (result.captionsGenerated) {
    lines.push(`  captions:  written to project.atelier`);
  } else {
    lines.push(`  captions:  skipped`);
  }
  return lines.join("\n");
}

/** Register `atelier transcribe` on the Commander program */
export function transcribeCommand(program: Command): void {
  program
    .command("transcribe <project>")
    .description(
      "Transcribe source video via Whisper, write transcript.json, and " +
      "rewrite caption-tagged TextVisual layers in project.atelier. " +
      "Preserves user transcript edits on re-run.",
    )
    .option("--model <name>", "Whisper model: tiny|base|small|medium|large-v3", "base.en")
    .option("--language <code>", "BCP-47 language hint (omit for autodetect)")
    .option("--reset", "Discard existing user edits; full fresh transcript")
    .option("--no-captions", "Write transcript.json only; skip caption layer generation")
    .option("--recipe <name>", "Apply a Studio Recipe's caption_style + caption_grouping")
    .option("--dry-run", "Print transcript; don't write files")
    .option("--json", "Output result as JSON for piping")
    .action(async (
      project: string,
      opts: {
        model: WhisperModel;
        language?: string;
        reset?: boolean;
        captions: boolean;
        recipe?: string;
        dryRun?: boolean;
        json?: boolean;
      },
    ) => {
      try {
        let transcribeOpts: TranscribeOptions = {
          model: opts.model,
          language: opts.language,
          reset: opts.reset,
          noCaptions: !opts.captions,
          dryRun: opts.dryRun,
        };
        if (opts.recipe) {
          const { recipe } = loadRecipe(opts.recipe, project);
          transcribeOpts = applyRecipeToTranscribeOptions(recipe, transcribeOpts);
        }
        const result = await transcribeProject(project, transcribeOpts);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatResult(result));
          if (opts.dryRun) console.log("(dry-run — no files written)");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`atelier transcribe: ${msg}`);
        process.exit(1);
      }
    });
}
