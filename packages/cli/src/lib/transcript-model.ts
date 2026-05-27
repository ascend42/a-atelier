import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  CutEntry,
  TranscriptDerivedFrom,
  TranscriptWord,
  TranscriptSegment,
  VideoTranscript,
} from "@a-company/atelier-types";

/** Default match tolerance for re-transcribe merge (seconds) */
export const DEFAULT_TRANSCRIPT_MATCH_TOLERANCE = 0.3;

/** Default phrase grouping parameters */
export const DEFAULT_PHRASE_MAX_WORDS = 5;
export const DEFAULT_PHRASE_PAUSE_GAP_SECONDS = 0.4;

/** End-of-phrase punctuation marks */
const END_PUNCT = /[.!?,;:]\s*$/;

/**
 * Flatten a VideoTranscript's segments into a single ordered word array.
 * Used by edit commands that take a global word index.
 */
export function flattenWords(transcript: VideoTranscript): TranscriptWord[] {
  return transcript.segments.flatMap((s) => s.words);
}

/**
 * Phrase block — one rendered caption layer's worth of words.
 */
export interface CaptionPhrase {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

/**
 * Group transcript words into caption-sized phrases.
 *
 * Emits a new phrase when ANY of:
 *  - currentPhrase.length >= maxWords
 *  - currentWord.text ends in . ! ? , ; :
 *  - gap between currentWord and nextWord > pauseGap seconds
 *
 * Hidden words are skipped (do not appear in captions but still in transcript).
 */
export function groupIntoPhrases(
  transcript: VideoTranscript,
  options: { maxWords?: number; pauseGap?: number } = {},
): CaptionPhrase[] {
  const maxWords = options.maxWords ?? DEFAULT_PHRASE_MAX_WORDS;
  const pauseGap = options.pauseGap ?? DEFAULT_PHRASE_PAUSE_GAP_SECONDS;

  const phrases: CaptionPhrase[] = [];
  const visibleWords = flattenWords(transcript).filter((w) => !w.hidden);

  let current: TranscriptWord[] = [];
  for (let i = 0; i < visibleWords.length; i++) {
    const w = visibleWords[i];
    current.push(w);

    const next = visibleWords[i + 1];
    const gap = next ? next.start - w.end : 0;
    const endsOnPunct = END_PUNCT.test(w.text);
    const atMax = current.length >= maxWords;

    if (!next || atMax || endsOnPunct || gap > pauseGap) {
      phrases.push({
        start: current[0].start,
        end: current[current.length - 1].end,
        text: current.map((c) => c.text).join(" "),
        words: current,
      });
      current = [];
    }
  }

  return phrases;
}

/**
 * Merge a freshly-detected transcript with an existing one, preserving user
 * edits (userEdited / userAdded / hidden + text override) on any word whose
 * raw boundary still matches within `tolerance` seconds AND whose `detected`
 * string is unchanged.
 *
 * userAdded words in the existing transcript have no matching fresh entry by
 * definition — they're preserved as orphans, inserted into the appropriate
 * segment by timing.
 */
export function mergeTranscriptWithExisting(
  fresh: VideoTranscript,
  existing: VideoTranscript,
  tolerance = DEFAULT_TRANSCRIPT_MATCH_TOLERANCE,
): VideoTranscript {
  const existingWords = flattenWords(existing);

  const merged: VideoTranscript = {
    version: "1.1",
    ...(fresh.language !== undefined && { language: fresh.language }),
    segments: fresh.segments.map((seg) => ({
      text: seg.text,
      start: seg.start,
      end: seg.end,
      words: seg.words.map((freshWord) => {
        const match = existingWords.find(
          (e) =>
            !e.userAdded &&
            Math.abs(e.start - freshWord.start) < tolerance &&
            e.detected === freshWord.detected,
        );
        if (!match) return freshWord;
        return {
          detected: freshWord.detected,
          text: match.text,
          start: freshWord.start,
          end: freshWord.end,
          ...(freshWord.confidence !== undefined && { confidence: freshWord.confidence }),
          ...(match.userEdited && { userEdited: true }),
          ...(match.hidden && { hidden: true }),
        };
      }),
    })),
  };

  // Re-insert user-added orphan words into their original segment by timing
  const orphans = existingWords.filter((w) => w.userAdded);
  for (const orphan of orphans) {
    const segIdx = merged.segments.findIndex(
      (s) => orphan.start >= s.start && orphan.start <= s.end,
    );
    const targetSeg = segIdx >= 0
      ? merged.segments[segIdx]
      : merged.segments[merged.segments.length - 1];
    if (!targetSeg) continue;
    const insertIdx = targetSeg.words.findIndex((w) => w.start > orphan.start);
    if (insertIdx === -1) targetSeg.words.push(orphan);
    else targetSeg.words.splice(insertIdx, 0, orphan);
  }

  return merged;
}

/**
 * Replace the text of word at the given global index. Sets userEdited=true.
 * Returns a new VideoTranscript; does not mutate input.
 */
export function applyTextEdit(
  transcript: VideoTranscript,
  wordIndex: number,
  newText: string,
): VideoTranscript {
  return mapWord(transcript, wordIndex, (w) => ({
    ...w,
    text: newText,
    userEdited: true,
  }));
}

/**
 * Apply a batch find/replace across all detected words.
 * Sets userEdited=true on every word whose detected text matches `find`.
 */
export function applyBatchReplace(
  transcript: VideoTranscript,
  find: string,
  replace: string,
): VideoTranscript {
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => ({
      ...seg,
      words: seg.words.map((w) =>
        w.detected === find
          ? { ...w, text: replace, userEdited: true }
          : w,
      ),
    })),
  };
}

/** Hide a word (excluded from caption render, kept in transcript). Sets hidden=true. */
export function applyHide(transcript: VideoTranscript, wordIndex: number): VideoTranscript {
  return mapWord(transcript, wordIndex, (w) => ({ ...w, hidden: true }));
}

/**
 * Insert a user-added word after the given global index.
 * Sets userAdded=true. Duration defaults to 0.15s if not specified.
 * Word is placed in the segment containing the anchor word.
 */
export function applyAdd(
  transcript: VideoTranscript,
  afterIndex: number,
  text: string,
  duration = 0.15,
): VideoTranscript {
  const flat = flattenWords(transcript);
  if (afterIndex < 0 || afterIndex >= flat.length) {
    throw new Error(`afterIndex ${afterIndex} out of range (have ${flat.length} words)`);
  }
  const anchor = flat[afterIndex];
  const newWord: TranscriptWord = {
    detected: text,
    text,
    start: anchor.end,
    end: anchor.end + duration,
    userAdded: true,
  };

  // Find which segment contains the anchor word and insert there
  let cursor = 0;
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => {
      const segStart = cursor;
      cursor += seg.words.length;
      if (afterIndex < segStart || afterIndex >= cursor) return seg;
      const localIdx = afterIndex - segStart;
      return {
        ...seg,
        words: [...seg.words.slice(0, localIdx + 1), newWord, ...seg.words.slice(localIdx + 1)],
      };
    }),
  };
}

/**
 * Merge adjacent words at indices i and i+1 into a single word.
 * The merged word's detected/text becomes the concatenation; timing spans both.
 * Sets userEdited=true.
 */
export function applyMerge(transcript: VideoTranscript, firstIndex: number): VideoTranscript {
  const flat = flattenWords(transcript);
  if (firstIndex < 0 || firstIndex >= flat.length - 1) {
    throw new Error(`firstIndex ${firstIndex} out of range for merge`);
  }
  const a = flat[firstIndex];
  const b = flat[firstIndex + 1];
  const mergedWord: TranscriptWord = {
    detected: a.detected + b.detected,
    text: a.text + b.text,
    start: a.start,
    end: b.end,
    userEdited: true,
  };

  let cursor = 0;
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => {
      const segStart = cursor;
      cursor += seg.words.length;
      // Both words must fall in the same segment to merge cleanly
      if (firstIndex < segStart || firstIndex >= cursor - 1) return seg;
      const localIdx = firstIndex - segStart;
      return {
        ...seg,
        words: [...seg.words.slice(0, localIdx), mergedWord, ...seg.words.slice(localIdx + 2)],
      };
    }),
  };
}

/**
 * Split one word at the given fractional point (0–1). Timing prorates.
 * Sets userEdited=true on both halves. `firstText` and `secondText` default
 * to slicing the original text at its character midpoint.
 */
export function applySplit(
  transcript: VideoTranscript,
  wordIndex: number,
  fraction: number,
  firstText?: string,
  secondText?: string,
): VideoTranscript {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error(`split fraction must be in (0, 1), got ${fraction}`);
  }
  const flat = flattenWords(transcript);
  if (wordIndex < 0 || wordIndex >= flat.length) {
    throw new Error(`wordIndex ${wordIndex} out of range`);
  }
  const w = flat[wordIndex];
  const splitTime = w.start + (w.end - w.start) * fraction;
  const cutChar = Math.max(1, Math.floor(w.text.length * fraction));
  const first: TranscriptWord = {
    detected: w.detected,
    text: firstText ?? w.text.slice(0, cutChar),
    start: w.start,
    end: splitTime,
    userEdited: true,
  };
  const second: TranscriptWord = {
    detected: w.detected,
    text: secondText ?? w.text.slice(cutChar),
    start: splitTime,
    end: w.end,
    userEdited: true,
  };

  let cursor = 0;
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => {
      const segStart = cursor;
      cursor += seg.words.length;
      if (wordIndex < segStart || wordIndex >= cursor) return seg;
      const localIdx = wordIndex - segStart;
      return {
        ...seg,
        words: [...seg.words.slice(0, localIdx), first, second, ...seg.words.slice(localIdx + 1)],
      };
    }),
  };
}

// ─── helpers ─────────────────────────────────────────────────────

function mapWord(
  transcript: VideoTranscript,
  wordIndex: number,
  fn: (w: TranscriptWord) => TranscriptWord,
): VideoTranscript {
  const flat = flattenWords(transcript);
  if (wordIndex < 0 || wordIndex >= flat.length) {
    throw new Error(`wordIndex ${wordIndex} out of range (have ${flat.length} words)`);
  }
  let cursor = 0;
  return {
    ...transcript,
    segments: transcript.segments.map((seg) => {
      const segStart = cursor;
      cursor += seg.words.length;
      if (wordIndex < segStart || wordIndex >= cursor) return seg;
      const localIdx = wordIndex - segStart;
      return {
        ...seg,
        words: seg.words.map((w, i) => (i === localIdx ? fn(w) : w)),
      };
    }),
  };
}

// ─── Effective transcript (post-cut derivation) ─────────────────
//
// `applyCuts` is the pure derivation: given a raw transcript + the project's
// cuts.json, produce the transcript that reflects the post-cut timeline.
// Words whose `start` falls inside a cut range are dropped; surviving words
// (and surviving segments) have their timestamps shifted backwards by the
// cumulative cut duration that preceded them, so timestamps line up with the
// trimmed clip the creator will export.
//
// This is the substrate Iris (and the agent team) reads when they need to
// answer "what does the talk-track look like AFTER cuts?" without redoing
// the math themselves. It is intentionally read-only: callers never persist
// the effective transcript — the raw transcript.json stays authoritative on
// disk so re-cutting later is non-destructive.

/**
 * Pure derivation: apply cuts to a raw transcript and return the effective
 * (post-cut) transcript. Inputs are not mutated.
 *
 *  - A word is DROPPED if its `start` falls inside any cut interval
 *    `[cut.start_s, cut.end_s)` — using effective spans on each cut
 *    (the same `rawStart - paddingPre` ... `rawEnd + paddingPost` math
 *    the trim pipeline uses for layer rewrites, but unclamped here since
 *    we don't know `duration` at this layer; clamping happens at write time).
 *
 *  - A surviving word has its `start`/`end` shifted by the cumulative cut
 *    duration that PRECEDES it in source-time. Effective time t' = t - sum
 *    of cut durations whose end <= t.
 *
 *  - Segments adjust the same way; segments whose entire word list drops
 *    out are dropped.
 *
 *  - A `derived_from` provenance stamp is attached so consumers (agents,
 *    MCP tools) can distinguish "raw" from "effective" without re-deriving.
 *
 * NOTE: This function treats the cuts argument as KEEP intervals would be
 * the inverse — but per the existing CutEntry semantics in this codebase,
 * a CutEntry represents a KEPT speech span, not silence to remove. We must
 * therefore invert: words inside any cut are KEPT (timestamps shift relative
 * to the previous kept span's end); words OUTSIDE every cut are dropped.
 * This matches `rewriteCutLayers` which lays out kept spans sequentially.
 */
export function applyCuts(
  transcript: VideoTranscript,
  cuts: CutEntry[],
  options: { transcriptName?: string; cutsHash?: string; derivedAt?: string } = {},
): VideoTranscript {
  // Sort cuts by rawStart for deterministic processing. Cuts shouldn't overlap
  // (the trim pipeline guarantees this via resolveOverlaps) but we sort anyway
  // to be safe against hand-edited cut lists.
  const sortedCuts = [...cuts].sort((a, b) => a.rawStart - b.rawStart);

  // Effective span per cut: [start, end] in source time. Padding extends the
  // kept region in both directions; we don't clamp negative starts here since
  // upstream code (clampBoundaries in cut-model) already does that for the
  // on-disk cuts.json.
  const keepRanges = sortedCuts.map((c) => ({
    start: Math.max(0, c.rawStart - c.paddingPre),
    end: c.rawEnd + c.paddingPost,
  }));

  // Map a source-time `t` to its effective time on the trimmed timeline.
  // Returns `null` if `t` is not inside any kept range (i.e. the word is cut).
  function mapTime(t: number): number | null {
    let cumulativeOffset = 0;
    for (const r of keepRanges) {
      if (t < r.start) {
        // Falls in a dropped (silent) gap before this kept range.
        return null;
      }
      if (t <= r.end) {
        // Inside this kept range — shift by the offset of this range's start.
        return t - r.start + cumulativeOffset;
      }
      cumulativeOffset += r.end - r.start;
    }
    // Past the final kept range — the word is in trailing silence and is cut.
    return null;
  }

  const newSegments: TranscriptSegment[] = [];
  for (const seg of transcript.segments) {
    const newWords: TranscriptWord[] = [];
    for (const w of seg.words) {
      const newStart = mapTime(w.start);
      const newEnd = mapTime(w.end);
      // Drop the word if either endpoint is in a cut gap. Strict policy:
      // a partial word straddling a boundary is dropped rather than clamped,
      // matching how transcribe.ts's caption-builder treats hidden words
      // (presence is binary; no partial render).
      if (newStart === null || newEnd === null) continue;
      newWords.push({
        ...w,
        start: newStart,
        end: newEnd,
      });
    }
    if (newWords.length === 0) continue; // segment fully cut → drop
    newSegments.push({
      text: seg.text,
      // Segment-level start/end follow the first and last surviving word so
      // the trimmed segment timing matches its words exactly.
      start: newWords[0].start,
      end: newWords[newWords.length - 1].end,
      words: newWords,
    });
  }

  const totalCutDurationS = keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0);

  const derived_from: TranscriptDerivedFrom = {
    transcriptName: options.transcriptName ?? "transcript.json",
    cutsHash: options.cutsHash ?? hashCuts(sortedCuts),
    derivedAt: options.derivedAt ?? new Date().toISOString(),
    cutsApplied: sortedCuts.length,
    // totalCutDurationS reports the SUM of kept-range durations — i.e. the
    // duration of the effective timeline (the post-cut clip). Naming is
    // load-bearing: agents downstream use this as the trimmed-clip length.
    totalCutDurationS,
  };

  return {
    version: transcript.version,
    ...(transcript.language !== undefined && { language: transcript.language }),
    segments: newSegments,
    derived_from,
  };
}

/**
 * Stable hash of a sorted cut list — used as `derived_from.cutsHash` so
 * downstream callers can detect when cuts changed without comparing the full
 * list. Hashes the canonical JSON of cut tuples (rawStart, rawEnd, paddings).
 */
export function hashCuts(cuts: CutEntry[]): string {
  const canonical = cuts.map((c) => [c.rawStart, c.rawEnd, c.paddingPre, c.paddingPost]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

/**
 * Convenience loader: read `<projectDir>/transcript.json` + `<projectDir>/cuts.json`
 * and return the effective transcript. Returns `null` when no transcript exists.
 * When cuts.json is missing or has zero cuts, returns the raw transcript verbatim
 * (no derivation stamp) — the spec lets agents distinguish via `derived_from`
 * presence.
 *
 * Hand-rolled JSON read here (not via `loadVideoProject`/`readTranscript`) to
 * avoid a circular import — this lib is consumed by transcribe.ts which
 * already imports from video-project.ts. Inline reads keep the dependency
 * arrow one-directional.
 */
export function loadEffectiveTranscript(
  projectDir: string,
  transcriptName: string = "transcript.json",
): VideoTranscript | null {
  const absDir = resolve(projectDir);
  const transcriptPath = join(absDir, transcriptName);
  if (!existsSync(transcriptPath)) return null;

  const rawTranscript = JSON.parse(readFileSync(transcriptPath, "utf-8")) as VideoTranscript;

  const cutsPath = join(absDir, "cuts.json");
  if (!existsSync(cutsPath)) {
    // No cuts → return raw verbatim; no derivation stamp.
    return rawTranscript;
  }

  const rawCuts = JSON.parse(readFileSync(cutsPath, "utf-8")) as {
    version?: string;
    source?: string;
    cuts: CutEntry[];
  };

  if (!rawCuts.cuts || rawCuts.cuts.length === 0) {
    return rawTranscript;
  }

  return applyCuts(rawTranscript, rawCuts.cuts, { transcriptName });
}

// Re-export for convenience
export type { TranscriptSegment };
