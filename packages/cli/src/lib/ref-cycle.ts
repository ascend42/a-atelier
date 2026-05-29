// #ref-cycle — carousel + ref-visual cycle detector.
//
// A carousel project's slides[] may point at any `.atelier` file in the
// workspace (including other carousels, video projects, and ref-visual
// composites). Without cycle detection, a carousel that refs itself —
// directly or transitively through any slide or RefVisual layer — locks the
// resolver. Tooling that walks slides[].src or RefVisual.src MUST consult
// this detector before adding a new slide / changing a ref.
//
// Behavior:
//   - Pure fs walk via #atelier-schema's parseAtelier (handles both YAML and
//     JSON .atelier files).
//   - Track visited absolute paths in a Set (DAG-tolerant — a diamond is not
//     a cycle).
//   - Each visited doc enumerates refs from:
//       (a) doc.slides?.[*].src
//       (b) doc.layers[*].visual where visual.type === "ref" → visual.src
//   - Resolve each ref relative to dirname(currentDocPath) first, then fall
//     back to workspaceRoot if not found. Missing paths emit a console.warn
//     and are skipped (not fatal — the walk continues).
//   - Cycle trigger: any resolved ref's absolute path equals rootPath OR
//     candidatePath. Returns { cycle: true, path: [...visited chain..., dup] }.
//   - Depth-limited at MAX_HOPS hops; gracefully returns { cycle: false }
//     when the limit is reached (defends against malformed graphs without
//     throwing).

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { AtelierDocument, Layer, RefVisual } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";

/** Maximum traversal depth before bailing out — defends against pathological inputs. */
const MAX_HOPS = 64;

export interface CycleResult {
  cycle: boolean;
  /**
   * Visited path from rootPath → ... → the duplicate node. Present only
   * when `cycle: true`. The duplicate appears twice (start AND end of the
   * chain when self-ref, or end of chain matching the candidate / root).
   */
  path?: string[];
}

/**
 * Walks .atelier files via slides[].src AND any RefVisual layer's src,
 * collecting visited absolute paths. Returns `{ cycle: true, path }` if
 * `candidatePath` transitively refs `rootPath` (or itself).
 *
 * - Depth-limited (max 64 hops) — defends against malformed graphs.
 * - Missing slide path → returns `{ cycle: false }` with a console.warn.
 * - Non-carousel .atelier with a RefVisual layer → traversed for refs.
 */
export function detectCarouselCycle(
  rootPath: string,
  candidatePath: string,
  workspaceRoot: string,
): CycleResult {
  const rootAbs = resolve(rootPath);
  const candAbs = resolve(candidatePath);
  const workspaceAbs = resolve(workspaceRoot);

  // Direct self-ref: candidatePath equals rootPath. The carousel is about to
  // add itself as a slide.
  if (rootAbs === candAbs) {
    return { cycle: true, path: [rootAbs, candAbs] };
  }

  // BFS-ish from candidate: walk the candidate's refs and check whether any
  // transitively-reachable doc points back at rootPath or candidatePath.
  // We track the path PER FRONTIER ENTRY so the returned chain reflects the
  // route by which the cycle was found, starting with rootPath → candidate →
  // ... → duplicate (the spec'd shape consumers can render to humans as
  // "A refs B refs C refs A").
  type Frame = { abs: string; chain: string[] };
  const frontier: Frame[] = [{ abs: candAbs, chain: [rootAbs, candAbs] }];
  const visited = new Set<string>();

  let hops = 0;
  while (frontier.length > 0) {
    if (hops++ >= MAX_HOPS) {
      // Graceful depth-limit bail. Refuse to claim a cycle we couldn't
      // confirm; downstream tooling should treat this as "unknown" and
      // likely refuse the operation, but that's a separate decision.
      return { cycle: false };
    }
    const current = frontier.shift()!;
    if (visited.has(current.abs)) continue;
    visited.add(current.abs);

    if (!existsSync(current.abs)) {
      console.warn(`detectCarouselCycle: missing referenced file ${current.abs}`);
      continue;
    }

    let doc: AtelierDocument;
    try {
      const raw = readFileSync(current.abs, "utf-8");
      const parsed = parseAtelier(raw);
      if (parsed.success) {
        doc = parsed.data as AtelierDocument;
      } else {
        // Malformed doc — try the JSON fallback (parity with compose-video-project).
        doc = JSON.parse(raw) as AtelierDocument;
      }
    } catch (err) {
      console.warn(
        `detectCarouselCycle: failed to parse ${current.abs}: ${(err as Error).message}`,
      );
      continue;
    }

    // Enumerate refs out of this doc.
    const refs: string[] = [];
    if (doc.slides) {
      for (const slide of doc.slides) {
        if (typeof slide.src === "string" && slide.src) refs.push(slide.src);
      }
    }
    if (doc.layers) {
      for (const layer of doc.layers) {
        const v = layer.visual as Layer["visual"];
        if (v && (v as { type?: string }).type === "ref") {
          const r = v as RefVisual;
          if (typeof r.src === "string" && r.src) refs.push(r.src);
        }
      }
    }

    for (const ref of refs) {
      const resolved = resolveRef(ref, current.abs, workspaceAbs);
      if (resolved === undefined) {
        console.warn(
          `detectCarouselCycle: missing referenced file "${ref}" (from ${current.abs})`,
        );
        continue;
      }

      // CYCLE CHECK: did we just resolve to root or candidate?
      if (resolved === rootAbs || resolved === candAbs) {
        return { cycle: true, path: [...current.chain, resolved] };
      }

      if (!visited.has(resolved)) {
        frontier.push({ abs: resolved, chain: [...current.chain, resolved] });
      }
    }
  }

  return { cycle: false };
}

/**
 * Resolve a ref against the current doc's directory first, falling back to
 * the workspace root. Returns the absolute path or undefined when neither
 * candidate exists on disk.
 *
 * Absolute refs short-circuit straight to existsSync.
 */
function resolveRef(
  ref: string,
  currentDocPath: string,
  workspaceRoot: string,
): string | undefined {
  if (isAbsolute(ref)) {
    return existsSync(ref) ? resolve(ref) : undefined;
  }
  const docRelative = resolve(dirname(currentDocPath), ref);
  if (existsSync(docRelative)) return docRelative;
  const workspaceRelative = resolve(workspaceRoot, ref);
  if (existsSync(workspaceRelative)) return workspaceRelative;
  return undefined;
}
