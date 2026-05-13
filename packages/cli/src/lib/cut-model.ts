import type { CutEntry } from "@a-company/atelier-types";
import type { SilenceInterval } from "./silence-detect.js";

/** A detected speech span (inverse of silence) — pre-padding */
export interface SpeechInterval {
  start: number;
  end: number;
}

/** Default leading/trailing padding around each detected speech segment */
export const DEFAULT_PADDING_PRE = 0.08;
export const DEFAULT_PADDING_POST = 0.12;

/** Match tolerance (seconds) for preserving user padding on re-detect */
export const DEFAULT_MATCH_TOLERANCE = 0.5;

/**
 * Invert silence intervals into the gaps between them — the speech intervals.
 * Handles leading and trailing silence (no speech before first silence /
 * after last silence respectively).
 */
export function invertToSpeechIntervals(
  silences: SilenceInterval[],
  duration: number,
): SpeechInterval[] {
  if (silences.length === 0) {
    return duration > 0 ? [{ start: 0, end: duration }] : [];
  }

  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const speech: SpeechInterval[] = [];

  // Leading speech (before first silence)
  if (sorted[0].start > 0) {
    speech.push({ start: 0, end: sorted[0].start });
  }

  // Speech between adjacent silences
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].end;
    const gapEnd = sorted[i + 1].start;
    if (gapEnd > gapStart) {
      speech.push({ start: gapStart, end: gapEnd });
    }
  }

  // Trailing speech (after last silence)
  const last = sorted[sorted.length - 1];
  if (last.end < duration) {
    speech.push({ start: last.end, end: duration });
  }

  return speech;
}

/** Build initial CutEntry[] from speech intervals using default padding */
export function buildInitialCuts(
  speech: SpeechInterval[],
  paddingPre = DEFAULT_PADDING_PRE,
  paddingPost = DEFAULT_PADDING_POST,
): CutEntry[] {
  return speech.map((s) => ({
    rawStart: s.start,
    rawEnd: s.end,
    paddingPre,
    paddingPost,
  }));
}

/**
 * Resolve overlap between adjacent cuts (when paddingPost[i] + paddingPre[i+1]
 * exceeds the silence gap between them). Each cut gets equal share of the
 * silence — neither "wins."
 *
 * Mutates cuts in place.
 */
export function resolveOverlaps(cuts: CutEntry[]): void {
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    const aEnd = a.rawEnd + a.paddingPost;
    const bStart = b.rawStart - b.paddingPre;
    if (aEnd > bStart) {
      // Overlap — split at silence midpoint
      const mid = (a.rawEnd + b.rawStart) / 2;
      a.paddingPost = Math.max(0, mid - a.rawEnd);
      b.paddingPre = Math.max(0, b.rawStart - mid);
    }
  }
}

/**
 * Clamp first cut's paddingPre so effective start >= 0, and last cut's
 * paddingPost so effective end <= duration.
 *
 * Mutates cuts in place.
 */
export function clampBoundaries(cuts: CutEntry[], duration: number): void {
  if (cuts.length === 0) return;
  const first = cuts[0];
  if (first.rawStart - first.paddingPre < 0) {
    first.paddingPre = first.rawStart;
  }
  const last = cuts[cuts.length - 1];
  if (last.rawEnd + last.paddingPost > duration) {
    last.paddingPost = Math.max(0, duration - last.rawEnd);
  }
}

/**
 * Merge a freshly-detected cut list with an existing one, preserving user
 * padding overrides on any cut whose raw boundary still matches within
 * `tolerance` seconds (both start and end).
 *
 * For each fresh cut:
 *   - if an existing cut matches: copy its padding and label, update raw values
 *   - if no match: keep the fresh defaults
 *
 * Returns a new array; does not mutate inputs.
 */
export function mergeWithExisting(
  fresh: CutEntry[],
  existing: CutEntry[],
  tolerance = DEFAULT_MATCH_TOLERANCE,
): CutEntry[] {
  return fresh.map((f) => {
    const match = existing.find(
      (e) =>
        Math.abs(e.rawStart - f.rawStart) < tolerance &&
        Math.abs(e.rawEnd - f.rawEnd) < tolerance,
    );
    if (!match) return f;
    return {
      rawStart: f.rawStart,
      rawEnd: f.rawEnd,
      paddingPre: match.paddingPre,
      paddingPost: match.paddingPost,
      ...(match.label !== undefined && { label: match.label }),
    };
  });
}

/**
 * Apply a global padding delta to every cut (positive = loosen, negative = tighten).
 * Floors padding at 0 — never goes negative.
 *
 * Mutates cuts in place.
 */
export function applyGlobalPadding(cuts: CutEntry[], deltaSeconds: number): void {
  for (const cut of cuts) {
    cut.paddingPre = Math.max(0, cut.paddingPre + deltaSeconds);
    cut.paddingPost = Math.max(0, cut.paddingPost + deltaSeconds);
  }
}
