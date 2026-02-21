/** Audio track configuration for a state */
export interface Audio {
  /** Asset reference or file path/URL */
  src: string;
  /** Offset in seconds — skip into the audio track (default: 0) */
  offset?: number;
  /** Playback volume 0–1 (default: 1) */
  volume?: number;
  /** Loop audio for the state duration (default: false) */
  loop?: boolean;
  /** Frame at which audio starts playing (default: 0) */
  startFrame?: number;
}
