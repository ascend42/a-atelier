/** A single silence-removal or editorial cut */
export interface CutEntry {
  /** Start of the kept segment, in seconds from source start */
  start: number;
  /** End of the kept segment, in seconds from source start */
  end: number;
  /** Optional label (e.g. "take 1", "silence removed") */
  label?: string;
}

/** Cut list for a VideoProject — defines which segments survive into the composition */
export interface VideoCutList {
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
