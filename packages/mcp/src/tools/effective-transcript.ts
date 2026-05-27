// @a-company/atelier-mcp — Effective transcript query.
//
// `atelier_get_effective_transcript` reads a project's raw transcript.json
// and cuts.json from disk, applies cuts in-memory, and returns the
// post-cut transcript. Pure read — never writes, never touches the
// document store.
//
// Dependency note: the canonical `applyCuts` pure function lives in the CLI
// package (`packages/cli/src/lib/transcript-model.ts`). MCP does NOT depend
// on the CLI package (avoids the cli↔mcp cycle), so the derivation is
// re-implemented here on top of @a-company/atelier-types. This mirrors the
// existing intentional duplication of the recipe overlay translator in
// recipes.ts and renderPageNumberFormat in overlays.ts.

import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  CutEntry,
  TranscriptDerivedFrom,
  TranscriptSegment,
  TranscriptWord,
  VideoTranscript,
} from "@a-company/atelier-types";
import type { DocumentStore } from "../store.js";

// ─── Response envelope (mirror mind-map.ts) ───────────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ─── Pure derivation (duplicated from cli/transcript-model.ts) ────

/**
 * Apply cuts to a raw transcript and return the effective (post-cut)
 * transcript. Drops words whose `start` falls outside any kept range; shifts
 * surviving timestamps by the cumulative offset of the previous kept ranges.
 *
 * Mirrors `applyCuts` in `packages/cli/src/lib/transcript-model.ts` —
 * keep these in sync if the semantics change.
 */
function applyCuts(
  transcript: VideoTranscript,
  cuts: CutEntry[],
  options: { transcriptName: string; cutsHash: string; derivedAt: string },
): VideoTranscript {
  const sortedCuts = [...cuts].sort((a, b) => a.rawStart - b.rawStart);
  const keepRanges = sortedCuts.map((c) => ({
    start: Math.max(0, c.rawStart - c.paddingPre),
    end: c.rawEnd + c.paddingPost,
  }));

  function mapTime(t: number): number | null {
    let cumulativeOffset = 0;
    for (const r of keepRanges) {
      if (t < r.start) return null;
      if (t <= r.end) return t - r.start + cumulativeOffset;
      cumulativeOffset += r.end - r.start;
    }
    return null;
  }

  const newSegments: TranscriptSegment[] = [];
  for (const seg of transcript.segments) {
    const newWords: TranscriptWord[] = [];
    for (const w of seg.words) {
      const ns = mapTime(w.start);
      const ne = mapTime(w.end);
      if (ns === null || ne === null) continue;
      newWords.push({ ...w, start: ns, end: ne });
    }
    if (newWords.length === 0) continue;
    newSegments.push({
      text: seg.text,
      start: newWords[0].start,
      end: newWords[newWords.length - 1].end,
      words: newWords,
    });
  }

  const totalCutDurationS = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0);

  const derived_from: TranscriptDerivedFrom = {
    transcriptName: options.transcriptName,
    cutsHash: options.cutsHash,
    derivedAt: options.derivedAt,
    cutsApplied: sortedCuts.length,
    totalCutDurationS,
  };

  return {
    version: transcript.version,
    ...(transcript.language !== undefined && { language: transcript.language }),
    segments: newSegments,
    derived_from,
  };
}

/** Stable hash of the cuts list — mirrors `hashCuts` in cli/transcript-model.ts. */
function hashCuts(cuts: CutEntry[]): string {
  const canonical = cuts.map((c) => [c.rawStart, c.rawEnd, c.paddingPre, c.paddingPost]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

// ─── Transcript file discovery ───────────────────────────────────

interface TranscriptCandidate {
  /** Absolute path on disk. */
  absPath: string;
  /** Filename as the caller should reference it (e.g. "transcript.json"). */
  name: string;
}

/**
 * Discover transcript file(s) in a project directory. Prefers the canonical
 * `transcript.json` at the project root; also accepts the forward-compat
 * shape `transcripts/<name>.json` documented in reconstruct.ts.
 */
function discoverTranscripts(projectDir: string): TranscriptCandidate[] {
  const out: TranscriptCandidate[] = [];
  const canonical = join(projectDir, "transcript.json");
  if (existsSync(canonical) && statSync(canonical).isFile()) {
    out.push({ absPath: canonical, name: "transcript.json" });
  }
  const transcriptsDir = join(projectDir, "transcripts");
  if (existsSync(transcriptsDir) && statSync(transcriptsDir).isDirectory()) {
    try {
      const entries = readdirSync(transcriptsDir).filter((f) => f.endsWith(".json")).sort();
      for (const entry of entries) {
        out.push({
          absPath: join(transcriptsDir, entry),
          name: `transcripts/${entry}`,
        });
      }
    } catch {
      // Unreadable transcripts/ — ignore, the canonical path may still match.
    }
  }
  return out;
}

// ─── Tool registration ───────────────────────────────────────────

export function register(server: McpServer, _store: DocumentStore): void {
  // _store unused — pure read against local disk (mirrors mind-map.ts).

  server.tool(
    "atelier_get_effective_transcript",
    "Read a project's raw transcript.json + cuts.json and return the post-cut " +
      "(effective) transcript — words inside cut gaps dropped, surviving timestamps " +
      "shifted to the trimmed timeline. Pure read; does not touch the document store. " +
      "When cuts.json is absent or has zero cuts, returns the raw transcript verbatim " +
      "(no `derived_from` stamp). Optional `transcriptName` disambiguates when the " +
      "project carries multiple transcripts (transcripts/*.json); without it, " +
      "transcript.json wins, and an error is returned if multiple sit in transcripts/.",
    {
      projectDir: z.string().describe("Absolute or cwd-relative project root"),
      transcriptName: z
        .string()
        .optional()
        .describe(
          "Optional transcript filename (e.g. 'transcript.json' or " +
            "'transcripts/take-2.json'). Disambiguates multi-transcript projects.",
        ),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ projectDir, transcriptName }) => {
      const absProject = resolve(projectDir);
      if (!existsSync(absProject)) {
        return err(`projectDir "${absProject}" does not exist`);
      }
      if (!statSync(absProject).isDirectory()) {
        return err(`projectDir "${absProject}" is not a directory`);
      }

      // Resolve which transcript file to load.
      let chosen: TranscriptCandidate | undefined;
      if (transcriptName !== undefined) {
        const absPath = transcriptName.startsWith("/")
          ? transcriptName
          : join(absProject, transcriptName);
        if (!existsSync(absPath) || !statSync(absPath).isFile()) {
          return err(`transcript "${transcriptName}" not found in ${absProject}`);
        }
        chosen = { absPath, name: transcriptName };
      } else {
        const candidates = discoverTranscripts(absProject);
        if (candidates.length === 0) {
          return err(`no transcript found in ${absProject} (looked for transcript.json and transcripts/*.json)`);
        }
        if (candidates.length > 1) {
          return err(
            `multiple transcripts present in ${absProject}; pass transcriptName explicitly. ` +
              `Candidates: ${candidates.map((c) => c.name).join(", ")}`,
          );
        }
        chosen = candidates[0];
      }

      let rawTranscript: VideoTranscript;
      try {
        rawTranscript = JSON.parse(readFileSync(chosen.absPath, "utf-8")) as VideoTranscript;
      } catch (e) {
        return err(`failed to parse transcript at ${chosen.absPath}: ${(e as Error).message}`);
      }

      const cutsPath = join(absProject, "cuts.json");
      if (!existsSync(cutsPath)) {
        // No cuts.json — raw transcript is effective.
        return ok({
          effective: rawTranscript as unknown as Record<string, unknown>,
          source: {
            transcriptName: chosen.name,
            cutsApplied: 0,
            totalCutDurationS: 0,
          },
        });
      }

      let rawCuts: { cuts?: CutEntry[] };
      try {
        rawCuts = JSON.parse(readFileSync(cutsPath, "utf-8"));
      } catch (e) {
        return err(`failed to parse cuts at ${cutsPath}: ${(e as Error).message}`);
      }
      const cuts = rawCuts.cuts ?? [];

      if (cuts.length === 0) {
        return ok({
          effective: rawTranscript as unknown as Record<string, unknown>,
          source: {
            transcriptName: chosen.name,
            cutsApplied: 0,
            totalCutDurationS: 0,
          },
        });
      }

      const effective = applyCuts(rawTranscript, cuts, {
        transcriptName: chosen.name,
        cutsHash: hashCuts(cuts),
        derivedAt: new Date().toISOString(),
      });

      return ok({
        effective: effective as unknown as Record<string, unknown>,
        source: {
          transcriptName: chosen.name,
          cutsApplied: effective.derived_from?.cutsApplied ?? cuts.length,
          totalCutDurationS: effective.derived_from?.totalCutDurationS ?? 0,
        },
      });
    },
  );
}
