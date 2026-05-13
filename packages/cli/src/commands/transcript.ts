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
  applyTextEdit,
  applyBatchReplace,
  applyHide,
  applyAdd,
  applyMerge,
  applySplit,
  flattenWords,
} from "../lib/transcript-model.js";
import { rewriteCaptionLayers } from "../lib/caption-builder.js";

/** Read the project's transcript; throws if none exists */
function loadOrThrow(projectDir: string): { project: ReturnType<typeof loadVideoProject>; transcript: VideoTranscript } {
  const project = loadVideoProject(projectDir);
  const transcript = readTranscript(project);
  if (!transcript) {
    throw new Error(
      `No transcript.json in ${projectDir}. Run \`atelier transcribe ${projectDir}\` first.`,
    );
  }
  return { project, transcript };
}

/** Save the transcript and optionally regenerate caption layers */
function save(
  project: ReturnType<typeof loadVideoProject>,
  transcript: VideoTranscript,
  noRegenerate: boolean,
): void {
  writeTranscript(project, transcript);
  if (!noRegenerate) {
    const doc = readComposition(project);
    const updated = rewriteCaptionLayers(doc, transcript);
    writeComposition(project, updated);
  }
}

/** Register the `atelier transcript` family of edit subcommands */
export function transcriptCommand(program: Command): void {
  const transcript = program
    .command("transcript")
    .description("Edit transcript.json — fix, add, delete, merge, split, list");

  transcript
    .command("fix <project>")
    .description("Apply text correction(s). Use --replace 'wrong=right' for batch, or --word <idx> --text '<correction>' for single edit.")
    .option("--replace <pair...>", "Batch find/replace, format: 'detected=replacement' (repeatable)")
    .option("--word <index>", "Single-word edit by index", (v) => parseInt(v, 10))
    .option("--text <text>", "Correction text (paired with --word)")
    .option("--no-regenerate", "Skip caption layer regeneration after edit")
    .action(async (
      projectDir: string,
      opts: { replace?: string[]; word?: number; text?: string; regenerate: boolean },
    ) => {
      try {
        const { project, transcript } = loadOrThrow(projectDir);
        let updated = transcript;

        if (opts.replace?.length) {
          for (const pair of opts.replace) {
            const [find, repl] = pair.split("=");
            if (!find || repl === undefined) {
              throw new Error(`Invalid --replace pair: "${pair}". Use 'detected=replacement'.`);
            }
            updated = applyBatchReplace(updated, find, repl);
          }
        }

        if (typeof opts.word === "number") {
          if (opts.text === undefined) {
            throw new Error("--word requires --text <correction>");
          }
          updated = applyTextEdit(updated, opts.word, opts.text);
        }

        if (!opts.replace?.length && opts.word === undefined) {
          throw new Error("Provide --replace 'wrong=right' or --word <idx> --text '...'");
        }

        save(project, updated, !opts.regenerate);
        console.log(`Updated transcript in ${project.dir}`);
      } catch (err) {
        console.error(`atelier transcript fix: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  transcript
    .command("add <project>")
    .description("Insert a user-added word after the anchor word.")
    .requiredOption("--after-word <index>", "Anchor word index", (v) => parseInt(v, 10))
    .requiredOption("--text <text>", "Text of the new word")
    .option("--duration <seconds>", "Word duration in seconds (default: 0.15)", (v) => parseFloat(v), 0.15)
    .option("--no-regenerate", "Skip caption layer regeneration")
    .action(async (
      projectDir: string,
      opts: { afterWord: number; text: string; duration: number; regenerate: boolean },
    ) => {
      try {
        const { project, transcript } = loadOrThrow(projectDir);
        const updated = applyAdd(transcript, opts.afterWord, opts.text, opts.duration);
        save(project, updated, !opts.regenerate);
        console.log(`Inserted "${opts.text}" after word ${opts.afterWord} in ${project.dir}`);
      } catch (err) {
        console.error(`atelier transcript add: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  transcript
    .command("delete <project>")
    .description("Hide a word (excluded from captions, kept in transcript).")
    .requiredOption("--word <index>", "Word index", (v) => parseInt(v, 10))
    .option("--no-regenerate", "Skip caption layer regeneration")
    .action(async (
      projectDir: string,
      opts: { word: number; regenerate: boolean },
    ) => {
      try {
        const { project, transcript } = loadOrThrow(projectDir);
        const updated = applyHide(transcript, opts.word);
        save(project, updated, !opts.regenerate);
        console.log(`Hidden word ${opts.word} in ${project.dir}`);
      } catch (err) {
        console.error(`atelier transcript delete: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  transcript
    .command("merge <project>")
    .description("Merge two adjacent words at indices i and i+1.")
    .requiredOption("--word <index>", "First of the two words to merge", (v) => parseInt(v, 10))
    .option("--no-regenerate", "Skip caption layer regeneration")
    .action(async (
      projectDir: string,
      opts: { word: number; regenerate: boolean },
    ) => {
      try {
        const { project, transcript } = loadOrThrow(projectDir);
        const updated = applyMerge(transcript, opts.word);
        save(project, updated, !opts.regenerate);
        console.log(`Merged words ${opts.word} and ${opts.word + 1} in ${project.dir}`);
      } catch (err) {
        console.error(`atelier transcript merge: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  transcript
    .command("split <project>")
    .description("Split one word at a fractional point.")
    .requiredOption("--word <index>", "Word to split", (v) => parseInt(v, 10))
    .requiredOption("--at <fraction>", "Split point (0–1)", (v) => parseFloat(v))
    .option("--first <text>", "Override text for first half")
    .option("--second <text>", "Override text for second half")
    .option("--no-regenerate", "Skip caption layer regeneration")
    .action(async (
      projectDir: string,
      opts: { word: number; at: number; first?: string; second?: string; regenerate: boolean },
    ) => {
      try {
        const { project, transcript } = loadOrThrow(projectDir);
        const updated = applySplit(transcript, opts.word, opts.at, opts.first, opts.second);
        save(project, updated, !opts.regenerate);
        console.log(`Split word ${opts.word} at ${opts.at} in ${project.dir}`);
      } catch (err) {
        console.error(`atelier transcript split: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  transcript
    .command("list <project>")
    .description("Print all words with their indices for reference.")
    .option("--json", "Output as JSON")
    .action(async (projectDir: string, opts: { json?: boolean }) => {
      try {
        const { transcript } = loadOrThrow(projectDir);
        const words = flattenWords(transcript);
        if (opts.json) {
          console.log(JSON.stringify(words.map((w, i) => ({ index: i, ...w })), null, 2));
        } else {
          for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const flags: string[] = [];
            if (w.userEdited) flags.push("edited");
            if (w.userAdded) flags.push("added");
            if (w.hidden) flags.push("hidden");
            const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
            const editedDisplay = w.text !== w.detected ? ` ← "${w.detected}"` : "";
            console.log(
              `  [${i.toString().padStart(4)}]  ${w.start.toFixed(2).padStart(7)}s  ` +
              `"${w.text}"${editedDisplay}${flagStr}`,
            );
          }
        }
      } catch (err) {
        console.error(`atelier transcript list: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
