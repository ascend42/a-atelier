// @a-company/atelier-mcp — Mind-map query (stub / Phase 3)
//
// Resolves a typed asset slot against the creator's LOCAL asset library by
// walking the project directory and returning paths whose extension matches
// the slot `kind`. This is the minimum-viable surface called by Lux and Iris
// (see .paradigm/personas/{lux,iris}/persona.yaml) — Phase 4 builds the
// indexed/curated version (TD-229, TD-271, TD-540).
//
// Scope rules baked in here (do NOT expand without re-reading the Phase 3
// reconciliation notes in docs/keynote/paradigm/phase-3-reconciliation-notes.md):
//
//   - Pure read. No writes, no store mutations. The `store` parameter is
//     accepted for symmetry with the other `register*Tools` signatures but is
//     intentionally unused; querying the mind-map never touches the live
//     document.
//   - Local-only. Per TD-271 we never reach outside the project; the walk is
//     rooted at <projectDir> and confined to its subtree.
//   - No persistent index. Every call walks the directory from scratch. A
//     SQLite-backed index, semantic search, and the `atelier mind-map reindex`
//     verb all live in Phase 4. Keep this file small.
//
// Walk order (first match wins): <projectDir>/.atelier/mind-map/, then
// <projectDir>/assets/, then <projectDir>/ itself. Depth is capped at 4
// levels below the chosen root to keep pathological recursions (deep nests,
// symlink loops) bounded.

import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, join, basename, extname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SlotKindSchema, type SlotKind } from "@a-company/atelier-schema";
import type { DocumentStore } from "../store.js";

// ─── Response envelope helpers (mirror import-images.ts) ─────────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

// ─── Kind → extension map ─────────────────────────────────────────────────────
//
// Hardcoded; the closed SlotKind enum keeps this table bounded. `text` resolves
// at composition time, not from disk (see the per-call `note`). `voice`
// reuses the audio extensions (TTS voice samples are audio files); `logo`
// reuses the image extensions.

const KIND_EXTENSIONS: Record<SlotKind, ReadonlySet<string>> = {
  image: new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]),
  video: new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]),
  audio: new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]),
  font: new Set([".ttf", ".otf", ".woff", ".woff2"]),
  text: new Set<string>(), // empty by design — handled with a per-call note
  voice: new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]),
  logo: new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]),
};

const TEXT_NOTE = "text slots resolve at composition time, not from disk";

/** Max directory levels to descend BELOW the chosen search root. */
const MAX_DEPTH = 4;

// ─── Walker ──────────────────────────────────────────────────────────────────

interface Candidate {
  /** Absolute path on disk. */
  path: string;
  /** basename(path) */
  name: string;
  /** mtimeMs for sort. */
  mtimeMs: number;
  /**
   * Segments of the path RELATIVE to the search root (excluding the basename),
   * used for hint matching against ancestor directory names. Bounded to the
   * search subtree so a hint like "users" cannot accidentally match because
   * the project lives under /Users/.
   */
  relDirSegments: string[];
}

/**
 * Pick the root directory to walk. First existing wins:
 *   1. <projectDir>/.atelier/mind-map/
 *   2. <projectDir>/assets/
 *   3. <projectDir> itself
 */
function chooseSearchRoot(projectDir: string): string {
  const mindMap = join(projectDir, ".atelier", "mind-map");
  if (existsSync(mindMap) && statSync(mindMap).isDirectory()) return mindMap;
  const assets = join(projectDir, "assets");
  if (existsSync(assets) && statSync(assets).isDirectory()) return assets;
  return projectDir;
}

/**
 * Walk `root` recursively up to MAX_DEPTH levels deep, collecting every file
 * (regular files only) with its mtime and relative directory segments. Symlinks
 * are followed via the default statSync, but the depth cap prevents loops from
 * exploding. Directories that fail to read (permission, transient races) are
 * skipped silently — the goal is a best-effort listing, not a filesystem
 * audit.
 *
 * `searchedDirs` is populated with every directory the walk actually entered
 * (absolute paths), so the caller can report what was scanned.
 */
function walk(root: string, searchedDirs: string[]): Candidate[] {
  const out: Candidate[] = [];

  function recurse(dir: string, depth: number, relSegments: string[]): void {
    searchedDirs.push(dir);

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // unreadable dir → skip rather than crash the whole query
    }

    for (const entry of entries) {
      const abs = join(dir, entry);
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue; // race / broken symlink → skip
      }

      if (stat.isDirectory()) {
        if (depth >= MAX_DEPTH) continue; // depth cap — do not descend further
        recurse(abs, depth + 1, [...relSegments, entry]);
      } else if (stat.isFile()) {
        out.push({
          path: abs,
          name: entry,
          mtimeMs: stat.mtimeMs,
          relDirSegments: relSegments,
        });
      }
    }
  }

  recurse(root, 0, []);
  return out;
}

// ─── Hint matching ────────────────────────────────────────────────────────────

/**
 * Return the subset of `hints` that match the candidate. A hint matches when
 * its lowercased substring appears in either the candidate filename or any
 * ancestor directory name WITHIN the search root (case-insensitive). The
 * ancestor list is bounded to the search subtree so a hint like "users" can
 * never sneak in via the absolute filesystem path.
 */
function matchedHints(candidate: Candidate, hints: string[]): string[] {
  const haystacks = [candidate.name.toLowerCase(), ...candidate.relDirSegments.map((s) => s.toLowerCase())];
  return hints.filter((h) => {
    const needle = h.toLowerCase();
    return haystacks.some((hs) => hs.includes(needle));
  });
}

// ─── Tool registration ───────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function register(server: McpServer, _store: DocumentStore): void {
  // _store is intentionally unused — see file header. Kept in the signature
  // for symmetry with the other register* functions and so callers in
  // index.ts don't have to special-case this registration.

  // ── atelier_mind_map_query ──────────────────────────────────
  server.tool(
    "atelier_mind_map_query",
    "Resolve a typed asset slot against the creator's local asset library. Walks " +
      "<projectDir>/.atelier/mind-map/ (preferred), else <projectDir>/assets/, else " +
      "<projectDir> itself. Recursive with a depth cap of 4 levels. Filters by the " +
      "slot `kind` extension table (image, video, audio, font, voice, logo); `text` " +
      "returns no matches by design (text resolves at composition time). Optional " +
      "`hints` (case-insensitive substrings) narrow by filename or ancestor directory " +
      "name within the search root. Results sorted by mtime (most-recent first). " +
      "Pure read — does not touch the document store. Stub for Phase 4 mind-map.",
    {
      projectDir: z
        .string()
        .describe("Absolute or cwd-relative path to the project root"),
      kind: SlotKindSchema.describe(
        "Slot kind from the closed SlotKind enum (image|video|audio|text|font|voice|logo)",
      ),
      hints: z
        .array(z.string().min(1))
        .min(1)
        .optional()
        .describe(
          "Optional case-insensitive substrings; a candidate must match at least one " +
            "against its filename or an ancestor directory name within the search root.",
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(MAX_LIMIT)
        .optional()
        .describe(`Max matches to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ projectDir, kind, hints, limit }) => {
      const absProject = resolve(projectDir);
      if (!existsSync(absProject)) {
        return err(`projectDir "${absProject}" does not exist`);
      }
      if (!statSync(absProject).isDirectory()) {
        return err(`projectDir "${absProject}" is not a directory`);
      }

      const searchRoot = chooseSearchRoot(absProject);
      const searchedDirs: string[] = [];
      const candidates = walk(searchRoot, searchedDirs);

      // `text` slots don't resolve from disk — return the documented note plus
      // an empty match list. We still report the searched dirs so the caller
      // can see the walk would have run.
      if (kind === "text") {
        return ok({
          matches: [],
          searched_dirs: searchedDirs,
          total_candidates: candidates.length,
          note: TEXT_NOTE,
        });
      }

      const allowedExts = KIND_EXTENSIONS[kind];
      const kindMatched = candidates.filter((c) => allowedExts.has(extname(c.name).toLowerCase()));

      // When hints are provided, a candidate must match AT LEAST ONE of them.
      // When absent, all kind-matched candidates pass through.
      const hintFiltered = hints
        ? kindMatched
            .map((c) => ({ c, matched: matchedHints(c, hints) }))
            .filter(({ matched }) => matched.length > 0)
        : kindMatched.map((c) => ({ c, matched: [] as string[] }));

      // Most-recently-modified first.
      hintFiltered.sort((a, b) => b.c.mtimeMs - a.c.mtimeMs);

      const effectiveLimit = limit ?? DEFAULT_LIMIT;
      const limited = hintFiltered.slice(0, effectiveLimit);

      const matches = limited.map(({ c, matched }) => ({
        path: c.path,
        name: basename(c.path),
        kind,
        matched_hints: matched,
      }));

      return ok({
        matches,
        searched_dirs: searchedDirs,
        total_candidates: candidates.length,
      });
    },
  );
}
