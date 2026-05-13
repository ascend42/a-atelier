import type { TranscriptWord, TranscriptSegment, VideoTranscript } from "@a-company/atelier-types";

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

// Re-export for convenience
export type { TranscriptSegment };
