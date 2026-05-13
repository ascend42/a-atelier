/**
 * Studio Recipe — reusable bundle of style defaults (silence policy,
 * caption style, phrase grouping, plus Phase 3 reserved sections).
 *
 * Phase 1 ships the three implemented sections (silence_policy,
 * caption_style, caption_grouping). The six reserved fields parse
 * cleanly as opaque values so Phase 1 recipes stay forward-compatible
 * with Phase 3 (extraction-from-reference-video) features.
 */
export interface StudioRecipe {
  /** Recipe format version — current is "1.0" */
  version: string;
  /** Human-readable name */
  name: string;
  /** One-line description */
  description?: string;
  /** Author (creator handle) */
  author?: string;
  /** Searchability tags */
  tags?: string[];

  /** Consumed by atelier trim */
  silence_policy?: SilencePolicy;
  /** Consumed by atelier transcribe / captions regenerate */
  caption_style?: CaptionStyle;
  /** Consumed by atelier transcribe phrase grouping */
  caption_grouping?: CaptionGrouping;

  /** Reserved — Phase 3 (keyword/beat-triggered asset overlays) */
  overlay_rules?: unknown[];
  /** Reserved — Phase 3 (per-word highlight color animation) */
  caption_highlight?: unknown;
  /** Reserved — Phase 3 (transition defaults between clips) */
  transition_kit?: unknown;
  /** Reserved — Phase 3 (brand colors / font set) */
  palette?: unknown;
  /** Reserved — Phase 3 (ducking, music lane) */
  audio_policy?: unknown;
  /** Reserved — Phase 3 (multi-aspect render targets) */
  aspect_targets?: unknown[];
}

/** Silence-trim policy block — every field maps to an atelier trim option */
export interface SilencePolicy {
  /** silencedetect noise threshold, e.g. "-30dB" */
  noise?: string;
  /** Minimum silence duration to register, in seconds */
  min_silence?: number;
  /** Default leading padding for new cuts, in seconds */
  default_padding_pre?: number;
  /** Default trailing padding for new cuts, in seconds */
  default_padding_post?: number;
  /** Match tolerance for preserving user padding on re-detect, in seconds */
  match_tolerance?: number;
}

/** Caption visual style block — every field maps to a TextVisual style or layer property */
export interface CaptionStyle {
  font_family?: string;
  font_size?: number;
  font_weight?: number | "normal" | "bold";
  text_align?: "left" | "center" | "right";
  color?: string;
  /** Vertical position 0–1 (0=top, 1=bottom) */
  y_ratio?: number;
  /** Horizontal width as ratio of canvas width */
  width_ratio?: number;
  /** Opacity fade in/out duration, in seconds */
  fade_seconds?: number;
}

/** Phrase grouping parameters — consumed by atelier transcribe */
export interface CaptionGrouping {
  /** Maximum words per caption phrase */
  max_words?: number;
  /** Pause gap in seconds that forces a phrase break */
  pause_gap?: number;
}
