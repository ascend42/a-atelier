/**
 * Per-file design / brand block.
 *
 * **Self-contained, not cascaded** (TD-2026-05-27, design lineage decision).
 * Each `.atelier` file's `design` block stands on its own — no automatic
 * merge with the workspace DESIGN.md, no override resolution at render time.
 * The renderer reads tokens directly from this block; if a token is absent,
 * it's absent (the renderer falls back to its own defaults, not to some
 * parent design).
 *
 * **Lineage is explicit.** Authors and agents declare relationships via
 * `relatedTo[]`. This lets agents answer questions like "what did this
 * design fork from?" or "which slides in this carousel share a palette?"
 * without imposing implicit inheritance. It's a graph of pointers, not a
 * tree of overrides.
 */

/** How one design block relates to another (or to a workspace DESIGN.md) */
export type DesignRelation = "derived-from" | "sibling" | "references";

/** A single lineage pointer */
export interface AtelierDesignRelation {
  /**
   * Path to a related design source. Examples:
   * - `../DESIGN.md` (workspace narrative DESIGN)
   * - `slides/slide-1.atelier` (sibling slide's design block)
   * - `.atelier/brand-packs/launch-2026.yaml` (a shared brand pack)
   */
  source: string;
  /** What kind of relationship this is */
  relation: DesignRelation;
  /** Optional free-text note explaining the relationship */
  note?: string;
}

/** Typography tokens */
export interface DesignTypography {
  headingFamily?: string;
  bodyFamily?: string;
  monoFamily?: string;
  /** Named size tokens — e.g. { caption: 84, body: 48, hero: 120 } */
  sizes?: Record<string, number>;
  /** Named weight tokens — e.g. { regular: "400", bold: "700" } */
  weights?: Record<string, string>;
}

/** Motion defaults — used as fallbacks when a delta doesn't specify */
export interface DesignMotion {
  /** Default easing name (matches an `Easing` preset) */
  defaultEasing?: string;
  /** Default delta duration in frames */
  defaultDuration?: number;
}

/** The per-file design block */
export interface AtelierDesign {
  /**
   * Named color tokens — e.g. { primary: "#FF6B35", surface: "#FFFFFF",
   * caption: "#FFFFFF" }. Renderer reads tokens directly; no inheritance
   * from workspace.
   */
  palette?: Record<string, string>;
  typography?: DesignTypography;
  motion?: DesignMotion;
  /**
   * Lineage pointers. Agents and tools may walk these to understand
   * provenance — never resolved automatically at render time.
   */
  relatedTo?: AtelierDesignRelation[];
}
