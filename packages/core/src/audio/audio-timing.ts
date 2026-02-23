import type { Audio } from "@a-company/atelier-types";

/** Audio playback state at a given frame */
export interface AudioPlaybackState {
  /** Whether audio should be playing at this frame */
  shouldPlay: boolean;
  /** Current position in the audio track (seconds) */
  currentTime: number;
  /** Effective volume (0–1) */
  volume: number;
}

/**
 * Convert a frame number to time in seconds.
 */
export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Convert time in seconds to a frame number (floored).
 */
export function timeToFrame(time: number, fps: number): number {
  return Math.floor(time * fps);
}

/**
 * Compute the audio playback state for a given frame.
 *
 * @param audio - Audio configuration from a state
 * @param frame - Current frame number within the state
 * @param fps - Frames per second from canvas config
 * @param stateDuration - Total state duration in frames
 * @returns AudioPlaybackState with shouldPlay, currentTime, and volume
 */
export function computeAudioState(
  audio: Audio,
  frame: number,
  fps: number,
  stateDuration: number,
): AudioPlaybackState {
  const startFrame = audio.startFrame ?? 0;
  const offset = audio.offset ?? 0;
  const volume = audio.volume ?? 1;
  const loop = audio.loop ?? false;

  // Before audio starts
  if (frame < startFrame) {
    return { shouldPlay: false, currentTime: 0, volume };
  }

  // Time elapsed since audio started
  const elapsedFrames = frame - startFrame;
  const elapsedTime = frameToTime(elapsedFrames, fps);

  // Total available playback time (from startFrame to end of state)
  const availableFrames = stateDuration - startFrame;
  const availableTime = frameToTime(availableFrames, fps);

  if (!loop) {
    // Non-looping: audio plays from offset, stops at end of state
    const currentTime = offset + elapsedTime;
    return {
      shouldPlay: frame < stateDuration,
      currentTime,
      volume,
    };
  }

  // Looping: wrap elapsed time around available duration
  // The audio segment length is the available time
  const segmentDuration = availableTime;
  if (segmentDuration <= 0) {
    return { shouldPlay: false, currentTime: 0, volume };
  }

  const wrappedTime = elapsedTime % segmentDuration;
  const currentTime = offset + wrappedTime;

  return {
    shouldPlay: frame < stateDuration,
    currentTime,
    volume,
  };
}

/**
 * Compute audio cue points — frames where audio events occur.
 *
 * @param audio - Audio configuration
 * @param stateDuration - Total state duration in frames
 * @returns Array of { frame, event } describing audio events
 */
export function computeAudioCues(
  audio: Audio,
  stateDuration: number,
): Array<{ frame: number; event: "start" | "end" | "loop" }> {
  const startFrame = audio.startFrame ?? 0;
  const loop = audio.loop ?? false;
  const cues: Array<{ frame: number; event: "start" | "end" | "loop" }> = [];

  if (startFrame < stateDuration) {
    cues.push({ frame: startFrame, event: "start" });
  }

  if (loop) {
    // In loop mode, audio restarts each full cycle
    const availableFrames = stateDuration - startFrame;
    if (availableFrames > 0) {
      // Loop points at each full cycle
      for (let i = 1; startFrame + i * availableFrames < stateDuration; i++) {
        cues.push({ frame: startFrame + i * availableFrames, event: "loop" });
      }
    }
  }

  // Audio ends when state ends
  if (stateDuration > startFrame) {
    cues.push({ frame: stateDuration - 1, event: "end" });
  }

  return cues;
}
