import type { AudioVisual } from "@a-company/atelier-types";

/**
 * Audio-layer playback utilities.
 *
 * v1.0: audio is no longer a per-state field. These utilities now take an
 * `AudioVisual` layer (see `@a-company/atelier-types/layer.ts`) and a
 * composition frame; they answer "is this layer playing right now, at what
 * source-time, at what volume?".
 *
 * Pure functions — no I/O, no state. Reusable by the canvas renderer's
 * audio scheduler and by any export pipeline (e.g. an ffmpeg mux step).
 */

/** Audio playback state at a given composition frame */
export interface AudioPlaybackState {
  /** Whether audio should be playing at this frame */
  shouldPlay: boolean;
  /** Current position in the audio source (seconds) */
  currentTime: number;
  /** Effective volume (0–1), accounting for fadeIn/fadeOut envelopes */
  volume: number;
}

/** Convert a frame number to time in seconds. */
export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

/** Convert time in seconds to a frame number (floored). */
export function timeToFrame(time: number, fps: number): number {
  return Math.floor(time * fps);
}

/**
 * Compute the playback state of an audio layer at a given composition frame.
 *
 * @param layer       The AudioVisual to evaluate.
 * @param frame       Current composition frame.
 * @param fps         Canvas fps.
 * @param totalFrames Total composition duration in frames (used for fade-out
 *                    anchor when the layer plays to the end of the comp).
 * @returns           Whether the layer is audible at this frame, where the
 *                    source playhead is, and the effective volume after
 *                    fade envelopes.
 */
export function computeAudioState(
  layer: AudioVisual,
  frame: number,
  fps: number,
  totalFrames: number,
): AudioPlaybackState {
  const startFrame = layer.startFrame ?? 0;
  const sourceOffset = layer.sourceOffset ?? 0;
  const baseVolume = layer.muted ? 0 : (layer.volume ?? 1);
  const playbackRate = layer.playbackRate ?? 1;

  // Before the layer starts on the composition timeline.
  if (frame < startFrame) {
    return { shouldPlay: false, currentTime: 0, volume: baseVolume };
  }

  // Layer's effective end on the composition timeline. Derived from sourceEnd
  // (clip-out point) if set, otherwise plays to totalFrames.
  let endFrame = totalFrames;
  if (layer.sourceEnd !== undefined) {
    const segmentSec = (layer.sourceEnd - sourceOffset) / playbackRate;
    endFrame = Math.min(totalFrames, startFrame + timeToFrame(segmentSec, fps));
  }

  if (frame >= endFrame) {
    return { shouldPlay: false, currentTime: 0, volume: baseVolume };
  }

  const elapsedFrames = frame - startFrame;
  const elapsedTime = frameToTime(elapsedFrames, fps);
  const currentTime = sourceOffset + elapsedTime * playbackRate;

  // Apply fade envelopes (in/out are seconds at the LAYER edges, not source edges).
  let volume = baseVolume;
  if (layer.fadeIn && layer.fadeIn > 0) {
    const inFrames = timeToFrame(layer.fadeIn, fps);
    if (elapsedFrames < inFrames && inFrames > 0) {
      volume *= elapsedFrames / inFrames;
    }
  }
  if (layer.fadeOut && layer.fadeOut > 0) {
    const outFrames = timeToFrame(layer.fadeOut, fps);
    const framesUntilEnd = endFrame - frame;
    if (framesUntilEnd < outFrames && outFrames > 0) {
      volume *= framesUntilEnd / outFrames;
    }
  }

  return { shouldPlay: true, currentTime, volume };
}

/**
 * Compute cue points for an audio layer — frames where audio events occur
 * (start, end). Useful for scheduling DOM/audio-context play/stop calls.
 *
 * v1.0: with `loop` removed from the schema (AudioVisual doesn't support
 * looping yet — add when a real use case lands), there are at most two
 * cues per layer: start and end.
 */
export function computeAudioCues(
  layer: AudioVisual,
  fps: number,
  totalFrames: number,
): Array<{ frame: number; event: "start" | "end" }> {
  const startFrame = layer.startFrame ?? 0;
  const sourceOffset = layer.sourceOffset ?? 0;
  const playbackRate = layer.playbackRate ?? 1;
  const cues: Array<{ frame: number; event: "start" | "end" }> = [];

  if (startFrame >= totalFrames) return cues;
  cues.push({ frame: startFrame, event: "start" });

  let endFrame = totalFrames;
  if (layer.sourceEnd !== undefined) {
    const segmentSec = (layer.sourceEnd - sourceOffset) / playbackRate;
    endFrame = Math.min(totalFrames, startFrame + timeToFrame(segmentSec, fps));
  }
  if (endFrame > startFrame && endFrame <= totalFrames) {
    cues.push({ frame: endFrame - 1, event: "end" });
  }

  return cues;
}
