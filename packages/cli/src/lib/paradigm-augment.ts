/**
 * Paradigm + Atelier workspace symbiosis.
 *
 * When `atelier studio --new` (or `createWorkspace`) runs inside a directory
 * that has been Paradigm-initialized (`paradigm shift`), Atelier WEAVES
 * augmentations into the existing scaffold WITHOUT replacing anything
 * Paradigm owns. Four idempotent operations:
 *
 *   1. CLAUDE.md — sentinel-bracketed Atelier section appended/replaced.
 *      Anything outside the sentinels is preserved byte-for-byte. Re-running
 *      replaces the section between sentinels; a hand-edited Paradigm
 *      preamble is never touched.
 *   2. .claude/agents/ — drop atelier-{quill,lux,iris}.md from the snapshot
 *      in `atelier-agent-templates.ts`. Canonical sync — overwrites OK
 *      (TD-2026-05-26-210 "shared personas"). The directory is created if
 *      absent; Paradigm's shift command doesn't ship an agents/ subdir.
 *   3. .mcp.json — add `atelier` server entry alongside any existing
 *      `paradigm` (and other) servers. Re-running updates `cwd` (workspace
 *      may have moved) but preserves every other server entry and the
 *      `permissions` block verbatim.
 *   4. .paradigm/personas/index.yaml — add Quill / Lux / Iris persona index
 *      entries. The personas index has a richer multi-key shape than
 *      learning-mode.yaml (top-level `version`, `generated`, `personas`,
 *      `chains`, `gate_coverage`, `route_coverage`, `uncovered_routes`),
 *      so we use block-replacement on raw text: locate the `personas:`
 *      key, splice in a freshly-rendered map, leave every other top-level
 *      key untouched. Pre-existing persona entries are preserved.
 *
 * Constraints (TD-2026-05-26-275 / TD-540 / TD-271 / TD-229):
 *   - Never modify files outside the augmentation contract.
 *   - All augmentations idempotent (replay-safe).
 *   - No new npm dependencies (hand-rolled YAML + JSON.parse/stringify).
 *   - Workspace augmentations are LOCAL-ONLY artifacts; nothing leaves the
 *     creator's machine.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ATELIER_AGENT_TEMPLATES } from "./atelier-agent-templates.js";

// ─── Detection ─────────────────────────────────────────────────────────

export interface ParadigmDetection {
  /**
   * True iff BOTH `<dir>/.paradigm/config.yaml` AND `<dir>/CLAUDE.md`
   * exist on disk. These are the two on-disk markers `paradigm shift`
   * always writes; their joint presence is the canonical "this directory
   * has been Paradigm-initialized" signal.
   */
  present: boolean;
  /** `<dir>/CLAUDE.md` — always set, file may or may not exist. */
  claudeMdPath: string;
  /** `<dir>/.mcp.json` — always set. */
  mcpJsonPath: string;
  /** `<dir>/.paradigm/config.yaml` — always set. */
  configYamlPath: string;
  /** `<dir>/.paradigm/personas/index.yaml` — always set. */
  personasIndexPath: string;
  /** `<dir>/.claude/agents` — always set (may not exist yet). */
  agentsDirPath: string;
}

/**
 * Inspect `dir` for the markers `paradigm shift` leaves behind. Path
 * fields are always populated (they're where files would live, exist or
 * not) so callers can wire augmenters without re-resolving paths.
 *
 * `present` is the load-bearing field — only when both `.paradigm/config.yaml`
 * and `CLAUDE.md` exist do we treat the dir as Paradigm-initialized.
 */
export function detectParadigm(dir: string): ParadigmDetection {
  const absDir = resolve(dir);
  const claudeMdPath = join(absDir, "CLAUDE.md");
  const configYamlPath = join(absDir, ".paradigm", "config.yaml");
  const present = existsSync(claudeMdPath) && existsSync(configYamlPath);
  return {
    present,
    claudeMdPath,
    mcpJsonPath: join(absDir, ".mcp.json"),
    configYamlPath,
    personasIndexPath: join(absDir, ".paradigm", "personas", "index.yaml"),
    agentsDirPath: join(absDir, ".claude", "agents"),
  };
}

// ─── CLAUDE.md sentinel-bracketed section ──────────────────────────────

export const ATELIER_CLAUDE_MD_SECTION_BEGIN =
  "<!-- ATELIER:BEGIN — managed by atelier studio --new, do not edit by hand -->";
export const ATELIER_CLAUDE_MD_SECTION_END = "<!-- ATELIER:END -->";

/**
 * Render the Atelier-owned section of a workspace CLAUDE.md. Tells Claude
 * what's special about this directory: which agents are available, where
 * `workspace.atelier` and `.atelier/active.yaml` live, what lore goes
 * here vs. the engine repo, and which design decisions ground the design.
 *
 * Citations (TD-2026-05-26-275, TD-540, TD-271, TD-229) anchor the
 * local-first, recipe-pure, no-asset-exfiltration constraints — agents
 * read this at session start to calibrate their refusals.
 */
export function buildAtelierClaudeMdSection(opts: {
  workspaceName: string;
  learningMode: "ambient" | "explicit";
}): string {
  const { workspaceName, learningMode } = opts;
  const lines: string[] = [];
  lines.push(ATELIER_CLAUDE_MD_SECTION_BEGIN);
  lines.push("");
  lines.push("## Atelier Creator Workspace");
  lines.push("");
  lines.push(
    `This directory is an **Atelier creator workspace** named \`${workspaceName}\` ` +
      `holding one or more content Projects. It sits ON TOP of the Paradigm scaffold ` +
      `above — Paradigm owns the dev-time agents, lore, and protocols; Atelier owns ` +
      `the creator-facing surface (workspace + project tree, recipes, mind-map).`,
  );
  lines.push("");
  lines.push("### Agents available here");
  lines.push("");
  lines.push(
    "Three Atelier-specific subagents are dropped into `.claude/agents/` " +
      "and addressable by name:",
  );
  lines.push("");
  lines.push(
    "- `@atelier-quill` — Showrunner. Owns narrative direction; authors " +
      "DESIGN.md and SCRIPT.md.",
  );
  lines.push(
    "- `@atelier-lux` — Cinematographer. Owns visual direction; authors " +
      "STORYBOARD.md and drives layer/composition mutations.",
  );
  lines.push(
    "- `@atelier-iris` — Composer. Owns the build; drives the live MCP " +
      "loop, layer composition, and the audio pipeline.",
  );
  lines.push("");
  lines.push(
    "Their canonical definitions live in `.paradigm/personas/{quill,lux,iris}/` " +
      "(ships with Atelier; TD-2026-05-26-275 / TD-540). The `.claude/agents/*.md` " +
      "files are thin Claude Code wrappers that stay in lockstep with those.",
  );
  lines.push("");
  lines.push("### Workspace shape");
  lines.push("");
  lines.push(
    "- `workspace.atelier` (YAML) at the root is the workspace manifest — " +
      "name, default learning mode, advisory project list.",
  );
  lines.push(
    "- `.atelier/active.yaml` is the single source of truth for *which Project* " +
      "a workspace-scoped operation should target. Both the studio UI and the " +
      "agent team read + write it; an agent invoked from inside a workspace " +
      "MUST read this file before touching any artifact.",
  );
  lines.push(
    "- `.atelier/learning-mode.yaml` records the creator's autonomy posture " +
      `(currently: **${learningMode}**; TD-2026-05-26-646). Agents read it at ` +
      "session start; never auto-prompt to switch.",
  );
  lines.push(
    "- `.atelier/mind-map/` is the creator's local asset pool — clips, " +
      "graphics, audio. Local-only (TD-2026-05-26-271). Queried via " +
      "`atelier_mind_map_query` when binding typed slots in recipes/storyboards.",
  );
  lines.push(
    "- `.atelier/recipes/` holds workspace-shared style-as-preset recipes. " +
      "Recipes are pure structure with asset-typed slots — assets bind at " +
      "install on the recipient's machine (TD-2026-05-26-229). Never bundle " +
      "asset bytes into a recipe.",
  );
  lines.push("");
  lines.push("### Lore convention");
  lines.push("");
  lines.push(
    "Content lore — creator decisions about voice, palette, rhythm, what " +
      "landed and what didn't — goes here in this workspace's `.paradigm/lore/`. " +
      "It is SEPARATE from engine-repo lore (which tracks Atelier development). " +
      "Don't cross-contaminate; an entry about a specific Project belongs in this " +
      "workspace's lore, not in the Atelier engine repo.",
  );
  lines.push("");
  lines.push("### Hard constraints (do not relitigate)");
  lines.push("");
  lines.push(
    "- Nothing in this workspace's notebook, mind-map, document, or iteration " +
      "history uploads anywhere. Local-first is the floor (TD-2026-05-26-271, TD-540).",
  );
  lines.push(
    "- Recipes are inert structure only; no scripts, no executables, no asset " +
      "bytes (TD-2026-05-26-229).",
  );
  lines.push(
    "- Publication is always an explicit creator action. Agents never " +
      "auto-publish.",
  );
  lines.push("");
  lines.push(ATELIER_CLAUDE_MD_SECTION_END);
  return lines.join("\n");
}

/** Result of `augmentClaudeMd`. */
export type ClaudeMdAugmentAction = "appended" | "replaced";

/**
 * Idempotently weave `section` into `claudeMdPath` between
 * `ATELIER_CLAUDE_MD_SECTION_BEGIN` / `ATELIER_CLAUDE_MD_SECTION_END`.
 *
 * - Refuses (throws) when the file does not exist — `detectParadigm` is
 *   the contract that callers check first; reaching here without a file
 *   is a logic error worth surfacing loudly.
 * - When the sentinel pair is absent: append `\n\n${section}\n` to the
 *   end of the file. The Paradigm preamble is preserved byte-for-byte.
 * - When the sentinel pair is present: replace everything BETWEEN
 *   (inclusive of the sentinels) with the new section. Re-running with
 *   a different section content is the supported replay path.
 */
export function augmentClaudeMd(
  claudeMdPath: string,
  section: string,
): { action: ClaudeMdAugmentAction } {
  if (!existsSync(claudeMdPath)) {
    throw new Error(
      `augmentClaudeMd: ${claudeMdPath} does not exist ` +
        `(detectParadigm should have gated this call)`,
    );
  }
  const raw = readFileSync(claudeMdPath, "utf-8");
  const beginIdx = raw.indexOf(ATELIER_CLAUDE_MD_SECTION_BEGIN);
  const endIdx = raw.indexOf(ATELIER_CLAUDE_MD_SECTION_END);

  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    // No sentinel pair (or malformed) — append.
    const sep = raw.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(claudeMdPath, raw + sep + section + "\n", "utf-8");
    return { action: "appended" };
  }
  // Replace inclusive of both sentinels.
  const endAfter = endIdx + ATELIER_CLAUDE_MD_SECTION_END.length;
  const newContent = raw.slice(0, beginIdx) + section + raw.slice(endAfter);
  writeFileSync(claudeMdPath, newContent, "utf-8");
  return { action: "replaced" };
}

// ─── .mcp.json merge ───────────────────────────────────────────────────

/** Result of `augmentMcpJson`. */
export type McpJsonAugmentAction = "added" | "updated" | "skipped";

/**
 * Idempotently merge an `atelier` MCP server entry into `mcpJsonPath`,
 * mirroring Paradigm's own entry shape (`command`, `args`, `cwd`).
 *
 *   - When the file is absent: refuses with throw (caller should have
 *     gated via `detectParadigm`).
 *   - When `mcpServers.atelier` is absent: add it, return `added`.
 *   - When present with identical fields: no write, return `skipped`.
 *   - When present but different (e.g. cwd changed): update, return
 *     `updated`. Every other server entry and the `permissions` block
 *     are preserved verbatim.
 *
 * Output is pretty JSON (2-space indent + trailing newline) matching
 * what `paradigm shift` emits — diffs read cleanly in the creator's git.
 */
export function augmentMcpJson(
  mcpJsonPath: string,
  opts: { atelierMcpCwd?: string },
): { action: McpJsonAugmentAction } {
  if (!existsSync(mcpJsonPath)) {
    throw new Error(
      `augmentMcpJson: ${mcpJsonPath} does not exist ` +
        `(detectParadigm should have gated this call)`,
    );
  }
  const raw = readFileSync(mcpJsonPath, "utf-8");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `augmentMcpJson: ${mcpJsonPath} is not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`augmentMcpJson: ${mcpJsonPath} root must be an object`);
  }

  const cwd = opts.atelierMcpCwd ?? resolve(dirname(mcpJsonPath));
  const desired = {
    command: "atelier-mcp",
    args: ["."],
    cwd,
  };

  const servers =
    (parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
      ? (parsed.mcpServers as Record<string, unknown>)
      : {});
  parsed.mcpServers = servers;

  const existing = servers.atelier;
  const action: McpJsonAugmentAction =
    existing === undefined
      ? "added"
      : shallowEqualServerEntry(existing, desired)
        ? "skipped"
        : "updated";

  if (action === "skipped") {
    return { action };
  }

  servers.atelier = desired;
  writeFileSync(mcpJsonPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  return { action };
}

/** Field-by-field equality on the three fields we write. */
function shallowEqualServerEntry(a: unknown, b: { command: string; args: string[]; cwd: string }): boolean {
  if (a === null || typeof a !== "object" || Array.isArray(a)) return false;
  const o = a as Record<string, unknown>;
  if (o.command !== b.command) return false;
  if (o.cwd !== b.cwd) return false;
  if (!Array.isArray(o.args)) return false;
  if (o.args.length !== b.args.length) return false;
  for (let i = 0; i < b.args.length; i++) if (o.args[i] !== b.args[i]) return false;
  return true;
}

// ─── .paradigm/personas/index.yaml merge ───────────────────────────────

/** Result of `augmentPersonasIndex`. */
export interface PersonasIndexAugmentResult {
  action: "added" | "updated" | "skipped";
  /** Persona ids that were freshly inserted (not already in the index). */
  added: string[];
}

/** The three canonical Atelier persona index entries. Field shape mirrors
 *  the persona.yaml + agents.yaml conventions: id-keyed map with
 *  symbol/name/role/kind/ships_with/description plus pointer fields. */
interface AtelierPersonaEntry {
  id: string;
  symbol: string;
  name: string;
  role: string;
  description: string;
}

const ATELIER_PERSONA_ENTRIES: readonly AtelierPersonaEntry[] = [
  {
    id: "quill-showrunner",
    symbol: "#quill-showrunner",
    name: "Quill",
    role: "Showrunner",
    description:
      "Owns narrative direction. Authors DESIGN.md (audience, voice, register, " +
      "constraints) and SCRIPT.md (hook → story → proof → CTA). Distills " +
      "transcripts and intent into structure Lux can stage and Iris can build.",
  },
  {
    id: "lux-cinematographer",
    symbol: "#lux-cinematographer",
    name: "Lux",
    role: "Cinematographer",
    description:
      "Owns visual direction. Turns SCRIPT into STORYBOARD (shot/frame/composition, " +
      "timing windows, asset slots, animation, transitions, overlay rules). Drives " +
      "Atelier's layer and composition mutations through the live MCP surface.",
  },
  {
    id: "iris-composer",
    symbol: "#iris-composer",
    name: "Iris",
    role: "Composer",
    description:
      "Owns the build. Reads DESIGN/SCRIPT/STORYBOARD, applies the creator's " +
      "recipe, and composes the AtelierDocument layer by layer via MCP. Drives the " +
      "silence-trim / transcribe / captions pipeline via the Atelier CLI.",
  },
];

/**
 * Render a single persona entry as an indented YAML block under the
 * `personas:` map. Two-space indent matches the rest of the index.
 */
function renderPersonaEntry(p: AtelierPersonaEntry): string[] {
  const lines: string[] = [];
  lines.push(`  ${p.id}:`);
  lines.push(`    symbol: '${p.symbol}'`);
  lines.push(`    name: ${p.name}`);
  lines.push(`    role: ${p.role}`);
  lines.push(`    kind: canonical`);
  lines.push(`    ships_with: a-atelier`);
  lines.push(`    description: ${yamlBlockScalar(p.description)}`);
  lines.push(`    definition: .paradigm/personas/${p.id.split("-")[0]}/persona.yaml`);
  lines.push(`    system_prompt: .paradigm/personas/${p.id.split("-")[0]}/system-prompt.md`);
  return lines;
}

/** Quote a scalar value for inline YAML when it contains characters the
 *  hand-rolled reader can't handle unquoted (quotes, colons mid-string,
 *  leading punctuation). Plain prose with spaces gets single-quoted with
 *  any internal `'` doubled. */
function yamlBlockScalar(value: string): string {
  // Use single-quoted YAML scalar form; double internal single quotes.
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Idempotently weave Quill / Lux / Iris entries into the personas index.
 *
 * The personas index has a multi-key top-level shape (`version`,
 * `generated`, `personas`, `chains`, `gate_coverage`, `route_coverage`,
 * `uncovered_routes`). Naive scalar parsing would lose those siblings on
 * round-trip — so we BLOCK-REPLACE on raw text:
 *
 *   1. Read the file (or treat as missing).
 *   2. Parse the existing `personas:` block as a map-of-maps (just enough
 *      to know which ids are already there).
 *   3. Merge our three canonical ids in (overwriting existing entries with
 *      the canonical shape; preserving any unrelated entries).
 *   4. Splice the rendered `personas:` block back in between the same
 *      surrounding bytes; every other top-level key stays byte-for-byte.
 *
 * If the file is missing entirely (older paradigm install or hand-deleted),
 * we create it with the minimal {version, personas: <our three>} shape.
 */
export function augmentPersonasIndex(
  personasIndexPath: string,
): PersonasIndexAugmentResult {
  const dir = dirname(personasIndexPath);
  let raw: string | null = null;
  if (existsSync(personasIndexPath)) {
    raw = readFileSync(personasIndexPath, "utf-8");
  }

  if (raw === null) {
    // Fresh write — minimal multi-key shape so downstream tooling sees the
    // siblings it expects.
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const lines: string[] = [
      `version: '1.0'`,
      `personas:`,
    ];
    for (const p of ATELIER_PERSONA_ENTRIES) lines.push(...renderPersonaEntry(p));
    lines.push(`chains: {}`);
    lines.push(`gate_coverage: {}`);
    lines.push(`route_coverage: {}`);
    lines.push(`uncovered_routes: []`);
    writeFileSync(personasIndexPath, lines.join("\n") + "\n", "utf-8");
    return {
      action: "added",
      added: ATELIER_PERSONA_ENTRIES.map((p) => p.id),
    };
  }

  // Locate the `personas:` block. We rebuild the WHOLE personas block —
  // existing entries are read into a map, our three overwrite their keys,
  // any unrelated entries pass through.
  const { existingIds, prefix, suffix, currentBlock } =
    splitOnPersonasBlock(raw);

  const existingMap = parsePersonasBlock(currentBlock);
  const beforeIds = new Set(Object.keys(existingMap));
  const added: string[] = [];
  for (const p of ATELIER_PERSONA_ENTRIES) {
    if (!beforeIds.has(p.id)) added.push(p.id);
    existingMap[p.id] = renderPersonaEntry(p).slice(1); // drop the `  id:` header; we re-emit it
  }

  // Re-render the block. Sorted by id for stable output: any pre-existing
  // entries we didn't touch keep their original sub-lines verbatim.
  const idsSorted = Object.keys(existingMap).sort();
  const blockLines: string[] = [`personas:`];
  if (idsSorted.length === 0) {
    blockLines[0] = `personas: {}`;
  } else {
    for (const id of idsSorted) {
      blockLines.push(`  ${id}:`);
      for (const ln of existingMap[id]) blockLines.push(ln);
    }
  }
  const newBlock = blockLines.join("\n");

  // Decide action: added > updated > skipped.
  let action: PersonasIndexAugmentResult["action"];
  if (added.length === ATELIER_PERSONA_ENTRIES.length) {
    action = "added";
  } else if (added.length > 0) {
    action = "added"; // partial add still reports `added`
  } else if (currentBlock.trimEnd() === newBlock.trimEnd()) {
    action = "skipped";
  } else {
    action = "updated";
  }

  if (action === "skipped") {
    void existingIds;
    return { action, added: [] };
  }

  const finalRaw = prefix + newBlock + (suffix.startsWith("\n") ? "" : "\n") + suffix;
  writeFileSync(personasIndexPath, finalRaw, "utf-8");
  return { action, added };
}

/**
 * Split a personas-index file into prefix / personas-block / suffix.
 *
 * The block starts at the line beginning with `personas:` (top-level,
 * no leading indent) and runs through every subsequent indented line —
 * stopping at the next top-level key (or EOF). When the file has no
 * `personas:` key we synthesize an empty block at the end so the merge
 * still inserts cleanly.
 */
function splitOnPersonasBlock(raw: string): {
  prefix: string;
  currentBlock: string;
  suffix: string;
  existingIds: string[];
} {
  const lines = raw.split(/\r?\n/);
  let startIdx = -1;
  let endIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^personas\s*:/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    // No personas: block — synthesize empty current and append.
    return {
      prefix: raw.endsWith("\n") ? raw : raw + "\n",
      currentBlock: "personas: {}",
      suffix: "",
      existingIds: [],
    };
  }
  for (let i = startIdx + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.length === 0) continue;
    // Top-level key (no leading whitespace, looks like `foo:`) ends the block.
    if (/^[A-Za-z_][\w-]*\s*:/.test(ln)) {
      endIdx = i;
      break;
    }
  }
  const prefix = lines.slice(0, startIdx).join("\n");
  const block = lines.slice(startIdx, endIdx).join("\n");
  const suffix = lines.slice(endIdx).join("\n");
  return {
    prefix: prefix.length > 0 ? prefix + "\n" : "",
    currentBlock: block,
    suffix,
    existingIds: Object.keys(parsePersonasBlock(block)),
  };
}

/**
 * Parse a `personas:` block (as emitted by `splitOnPersonasBlock`) into
 * `{ id: rawSubLines[] }`. Sub-lines are captured verbatim so unrelated
 * pre-existing entries round-trip with their original formatting + comments.
 */
function parsePersonasBlock(block: string): Record<string, string[]> {
  const lines = block.split(/\r?\n/);
  const out: Record<string, string[]> = {};
  let currentId: string | null = null;
  let buf: string[] = [];
  const flush = (): void => {
    if (currentId !== null) {
      out[currentId] = buf;
      buf = [];
      currentId = null;
    }
  };
  // First line is `personas:` or `personas: {}` — skip it.
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    // Two-space-indented `<id>:` is a new entry header.
    const m = ln.match(/^ {2}([A-Za-z0-9_-]+)\s*:\s*$/);
    if (m) {
      flush();
      currentId = m[1];
      continue;
    }
    if (currentId !== null) {
      // Sub-line of the current entry (any further-indented or blank line).
      if (ln.length === 0 || /^\s{4,}/.test(ln)) {
        buf.push(ln);
        continue;
      }
      // Anything else ends the current entry; defensive fallback.
      flush();
    }
  }
  flush();
  return out;
}

// ─── .claude/agents/ drop ──────────────────────────────────────────────

/** Result of `augmentClaudeAgents`. */
export interface ClaudeAgentsAugmentResult {
  added: string[];
  updated: string[];
}

/**
 * Idempotently drop the three atelier-{quill,lux,iris}.md agent files
 * into `agentsDir`. Creates the directory if missing (paradigm shift's
 * `.claude/` scaffold doesn't include an `agents/` subdir by default).
 *
 * Canonical sync — overwrite OK (TD-2026-05-26-210 "shared personas").
 * Pre-existing agents with the same names are clobbered with the
 * snapshot; this is the explicit contract. Other agents in the same dir
 * are NOT touched.
 */
export function augmentClaudeAgents(agentsDir: string): ClaudeAgentsAugmentResult {
  mkdirSync(agentsDir, { recursive: true });
  const added: string[] = [];
  const updated: string[] = [];
  for (const [filename, content] of Object.entries(ATELIER_AGENT_TEMPLATES)) {
    const absPath = join(agentsDir, filename);
    if (existsSync(absPath)) {
      updated.push(filename);
    } else {
      added.push(filename);
    }
    writeFileSync(absPath, content, "utf-8");
  }
  return { added, updated };
}

// ─── Top-level orchestrator ────────────────────────────────────────────

export interface ParadigmAugmentationResult {
  claudeMd: ReturnType<typeof augmentClaudeMd>;
  mcpJson: ReturnType<typeof augmentMcpJson>;
  personas: PersonasIndexAugmentResult;
  agents: ClaudeAgentsAugmentResult;
}

export interface AugmentParadigmOptions {
  /** Display name written into the CLAUDE.md section. */
  workspaceName: string;
  /** Current learning mode written into the CLAUDE.md section. */
  learningMode: "ambient" | "explicit";
  /** Override `cwd` written into the atelier MCP server entry. Defaults to `dir`. */
  atelierMcpCwd?: string;
}

/**
 * Run all four augmentations against `dir`. Caller is responsible for
 * checking `detectParadigm(dir).present` first — this entry point assumes
 * the Paradigm scaffold is already in place. Each sub-step is idempotent,
 * so a re-run produces a stable result (with potentially different
 * action codes — e.g. `appended` becomes `replaced`).
 */
export function augmentParadigmWithAtelier(
  dir: string,
  opts: AugmentParadigmOptions,
): ParadigmAugmentationResult {
  const absDir = resolve(dir);
  const det = detectParadigm(absDir);
  return {
    claudeMd: augmentClaudeMd(
      det.claudeMdPath,
      buildAtelierClaudeMdSection({
        workspaceName: opts.workspaceName,
        learningMode: opts.learningMode,
      }),
    ),
    mcpJson: augmentMcpJson(det.mcpJsonPath, {
      atelierMcpCwd: opts.atelierMcpCwd ?? absDir,
    }),
    personas: augmentPersonasIndex(det.personasIndexPath),
    agents: augmentClaudeAgents(det.agentsDirPath),
  };
}
