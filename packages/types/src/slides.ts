/**
 * Carousel slide refs — a carousel project (kind: "carousel") is a manifest
 * pointing at ordered sub-documents that play in sequence.
 *
 * **No ownership concept** (TD-2026-05-27, carousel design): a `src` path may
 * point at any `.atelier` file in the workspace, including video projects,
 * image projects, or even other carousel projects. There is no "slides/"
 * folder convention enforced — tooling defaults to writing into
 * `<project>/slides/slide-N.atelier` but accepts arbitrary workspace paths.
 *
 * **Cycle-safe resolution.** Tooling that walks `slides[].src` (or layer
 * `RefVisual.src`) MUST track visited paths and refuse to recurse — otherwise
 * a carousel that refs itself, directly or transitively, locks the resolver.
 * See `cli/src/lib/ref-cycle.ts` for the canonical detector.
 */

/** Transition definition between two adjacent slides */
export interface SlideTransition {
  /** "cut" = no transition; "crossfade" = blend opacities; "fade" = through-color */
  kind: "cut" | "crossfade" | "fade";
  /** Transition length in frames (ignored for "cut") */
  durationFrames?: number;
  /** Through-color for "fade" transitions (default: black) */
  color?: string;
}

/** A single slide reference inside a carousel */
export interface SlideRef {
  /** Path to any .atelier file in the workspace */
  src: string;
  /**
   * How long this slide holds on the timeline.
   *
   * - For image sub-documents: required (image has no intrinsic duration);
   *   measured in frames at the carousel's canvas fps.
   * - For video sub-documents: optional override; default is the slide's own
   *   total duration (sum of its clip endFrames).
   */
  duration?: number;
  /** Transition INTO this slide from the previous one */
  transition?: SlideTransition;
  /** Optional human-readable label shown in the studio sidebar */
  label?: string;
}
