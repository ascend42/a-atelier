// #mcp-lib-doc-management-types — type contracts for the doc-management bundle.
//
// **Intentional duplication** of `packages/cli/src/lib/doc-management-types.ts`.
// MCP cannot import from `@a-company/atelier` (the CLI package) because
// `cli → mcp` already runs in the dep graph — re-importing back would close
// the cycle. The same duplication convention is used by clips.ts,
// rename-media.ts, and timeline-ops.ts (all carry this header).
//
// If the canonical types in cli/lib/doc-management-types.ts change, this file
// MUST be kept in sync — there is no shared package between mcp and cli for
// these primitives in v1.0. Lifting to a shared package (e.g.
// `atelier-doc-management`) is tracked as a Unit-0.5 follow-up.

export type DocKind = "video" | "image" | "carousel";

export interface CreateDocOptions {
  projectDir: string; // absolute
  name: string;
  kind: DocKind;
  asCarouselSlide?: boolean;
  carouselDocPath?: string;
  insertAt?: number;
}

export interface DuplicateDocOptions {
  projectDir: string;
  sourceDocPath: string;
  appendSlideRef?: boolean;
}

export interface DeleteDocOptions {
  workspaceDir: string;
  projectName: string;
  docPath: string;
}

export interface DocListEntry {
  path: string;
  kind?: "video" | "image" | "carousel";
}

export interface DocDeleteCascadeReport {
  docPath: string;
  slideRefsRemoved: Array<{ project: string; slideIndex: number }>;
  refLayersDangling: Array<{ project: string; docPath: string; layerId: string }>;
}

export interface DocDuplicateReport {
  sourceDocPath: string;
  newDocPath: string;
  appendedSlideIndex?: number;
}

/**
 * Aegis surface — see cli/lib/doc-management-types.ts for the long-form spec.
 * Rejects: empty / whitespace-only, leading dot, `/` `\` or `..` substring,
 * control bytes (NUL through 0x1f), longer than 200 chars.
 */
export function isValidDocName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 200) return false;
  if (trimmed.startsWith(".")) return false;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(trimmed)) return false;
  return true;
}