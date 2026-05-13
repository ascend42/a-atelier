/**
 * A single silence-removal or editorial cut — parametric model (v1.1).
 *
 * Stores both the immutable detected boundary and the user-tunable padding
 * around it. Effective start/end is computed from rawStart - paddingPre /
 * rawEnd + paddingPost (clamped to source bounds). See `effectiveSpan()`.
 *
 * Re-running silence detection preserves user paddingPre/paddingPost on
 * any cut whose raw boundary still matches within the merge tolerance.
 */
export interface CutEntry {
  /** Raw speech-start as detected by silencedetect, in seconds (immutable post-detection) */
  rawStart: number;
  /** Raw speech-end as detected by silencedetect, in seconds (immutable post-detection) */
  rawEnd: number;
  /** User-tunable padding before rawStart, in seconds (default from recipe.silence_policy) */
  paddingPre: number;
  /** User-tunable padding after rawEnd, in seconds (default from recipe.silence_policy) */
  paddingPost: number;
  /** Optional label (e.g. "take 1", "primary speech") */
  label?: string;
}

/**
 * Cut list for a VideoProject — ordered list of kept speech segments.
 *
 * Format version 1.1 stores parametric cuts (rawStart/rawEnd + padding).
 * Loaders migrate 1.0 files (flat { start, end }) on read; writers always
 * emit 1.1.
 */
export interface VideoCutList {
  /** Cut list format version — current is "1.1" */
  version: string;
  /** Relative path to the source video within the project folder */
  source: string;
  /** Ordered array of kept segments */
  cuts: CutEntry[];
}

/** Single transcribed word with timestamps */
export interface TranscriptWord {
  word: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Whisper confidence score 0–1 */
  confidence?: number;
}

/** A contiguous speech segment (sentence or phrase block) */
export interface TranscriptSegment {
  text: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  words: TranscriptWord[];
}

/** Full transcript for a VideoProject source file */
export interface VideoTranscript {
  /** BCP-47 language code detected by Whisper */
  language?: string;
  segments: TranscriptSegment[];
}

/** Filesystem layout description for a VideoProject folder */
export interface VideoProjectManifest {
  /** Relative path to source video (always "source.*") */
  source: string;
  /** Relative path to the composition (always "project.atelier") */
  composition: string;
  /** Relative path to transcript file (always "transcript.json") */
  transcript: string;
  /** Relative path to cut list file (always "cuts.json") */
  cuts: string;
  /** Relative path to export output directory (always "export/") */
  exportDir: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Atelier VideoProject format version */
  version: string;
}
