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

/**
 * Single transcribed word with timestamps — editable model (v1.1).
 *
 * Stores both what Whisper detected (immutable post-detection) and what
 * gets rendered (user-overridable). userEdited / userAdded / hidden flags
 * survive re-transcribe runs — matching by timing + detected text.
 */
export interface TranscriptWord {
  /** What Whisper heard (immutable post-detection) */
  detected: string;
  /** What gets rendered (defaults to detected; user can override) */
  text: string;
  /** Start time in seconds (audio-anchored — never moves on text edits) */
  start: number;
  /** End time in seconds */
  end: number;
  /** Whisper confidence score 0–1 — UI can flag low-conf words */
  confidence?: number;
  /** True if user has overridden text — preserved through re-transcribe */
  userEdited?: boolean;
  /** True if user inserted this word (Whisper missed it) — preserved through re-transcribe */
  userAdded?: boolean;
  /** True to exclude from caption render but keep in transcript */
  hidden?: boolean;
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

/**
 * Provenance stamp left on an effective transcript — the derivation of a
 * raw transcript through a cuts.json. Pure-functional and purely descriptive:
 * agents reading an effective transcript know it has already had cuts applied
 * (so they shouldn't apply them again) and can trace which cuts.json was used
 * by hashing the source on disk and comparing against `cutsHash`.
 */
export interface TranscriptDerivedFrom {
  /** Source raw transcript filename (e.g. "transcript.json") */
  transcriptName: string;
  /** Stable hash of the cuts.json payload that produced this derivation */
  cutsHash: string;
  /** ISO 8601 timestamp of derivation */
  derivedAt: string;
  /** Number of cut entries that were applied */
  cutsApplied: number;
  /** Total seconds dropped from the timeline by applied cuts */
  totalCutDurationS: number;
}

/**
 * Full transcript for a VideoProject source file.
 *
 * Format version 1.1 stores editable words (detected + text + flags).
 * Loaders migrate 1.0 transcripts (flat `word: string`) on read; writers
 * always emit 1.1.
 *
 * `derived_from` is present ONLY on transcripts produced by `applyCuts` —
 * the in-memory effective transcript handed to agents post-cut. The on-disk
 * `transcript.json` never carries this field (cuts apply at read time via
 * `loadEffectiveTranscript`, never persist into the raw transcript).
 */
export interface VideoTranscript {
  /** Transcript format version — current is "1.1" */
  version: string;
  /** BCP-47 language code detected by Whisper */
  language?: string;
  segments: TranscriptSegment[];
  /**
   * Provenance for effective (post-cut) transcripts. Absent on raw transcripts.
   * Producers: `applyCuts` (pure) and `loadEffectiveTranscript` (loader).
   */
  derived_from?: TranscriptDerivedFrom;
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
