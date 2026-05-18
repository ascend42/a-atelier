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

  /** Phase 1.5 — handle + page-number overlay rules (anchored layer presets) */
  overlay_rules?: OverlayRules;

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

/**
 * Visual subset for overlay text (handle, page-number, etc.).
 * Mirrors the recipe's snake_case style convention. Layer-region
 * concerns (y_ratio, width_ratio, fade_seconds) belong to caption_style,
 * not overlays — overlays use anchor + margin instead.
 */
export interface OverlayTextStyle {
  font_family?: string;
  font_size?: number;
  font_weight?: number | "normal" | "bold";
  color?: string;
}

/** Anchor corner for an overlay element */
export type OverlayAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Static handle overlay rule — anchored creator/handle text per page */
export interface OverlayHandleRule {
  /** Literal handle text, e.g. "@username" (template variables reserved for later) */
  text: string;
  anchor: OverlayAnchor;
  /** Px from the anchored edges. Default 24 at render time. */
  margin?: number;
  /** Optional style overrides; falls back to recipe / runtime defaults. */
  style?: OverlayTextStyle;
}

/** Static page-number overlay rule — anchored "1/5" style indicator */
export interface OverlayPageNumberRule {
  /**
   * Template string with `{current}` / `{total}` placeholders.
   * Supports zero-pad form `{current:02d}` / `{total:02d}`.
   * Render-time substitution; the schema only validates syntax + that
   * at least one of `{current}` / `{total}` appears.
   */
  format: string;
  anchor: OverlayAnchor;
  /** Px from the anchored edges. Default 24 at render time. */
  margin?: number;
  /** Optional style overrides; falls back to recipe / runtime defaults. */
  style?: OverlayTextStyle;
}

/**
 * Overlay rules block — Phase 1.5 first-class. Either sub-block is optional.
 * Render-time consumers translate these into anchored TextVisual layers
 * (handle + page-number layer presets, to be added in a follow-up task).
 */
export interface OverlayRules {
  handle?: OverlayHandleRule;
  page_number?: OverlayPageNumberRule;
}
