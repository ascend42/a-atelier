/**
 * Design systems in a repo — where they live, which one governs a file, and
 * the merged view the tools read (#design-system).
 *
 * Single product (the default):
 *   .atelier/design-system.yaml                      the system
 *
 * Several products in one repo:
 *   .atelier/systems.yaml                            the product index
 *   .atelier/design-system.yaml                      optional repo-wide base
 *   .atelier/systems/<product>/design-system.yaml    each product's system
 *   .atelier/systems/<product>/DESIGN.md
 *
 *   # systems.yaml
 *   version: 1
 *   products:
 *     gnomon:   { name: Gnomon, paths: [packages/gnomon-gui, packages/gnomon-mods] }
 *     warpline: { name: Warpline console, paths: [packages/warpline], extends: gnomon }
 *
 * A product inherits the repo-wide base unless `extends` names another
 * product (which itself inherits the base) or `none`. A package can also
 * carry its own `.atelier/design-system.yaml`; the nearest one up from a
 * file wins, so nested systems work without an index.
 *
 * Merging: maps merge key by key (the product wins), lists of records
 * (rules, preserve, overrides, decisions) concatenate.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep, extname } from "node:path";
import { parse as parseYaml } from "yaml";

export type Dict = Record<string, unknown>;

export interface ComponentSpec {
  role?: string;
  /** input | informational | navigational | container (decides which states it needs). */
  kind?: string;
  /** When to pick this over a look-alike component, and why. */
  when_to_use?: string;
  /** active (default) | deprecated */
  status?: string;
  replaced_by?: string;
  anatomy?: string[];
  variants?: Record<string, unknown>;
  sizes?: Record<string, unknown>;
  states?: string[];
  tokens?: Record<string, string>;
  source?: string | string[];
  /** state → markup rendered on the specimen page */
  examples?: Record<string, string>;
  from?: unknown;
}

export interface ZoneSpec {
  surface?: string;
  holds?: string[];
  never?: string[];
  overflow?: string;
  from?: unknown;
}

export interface RuleSpec {
  id: string;
  check?: string;
  args?: Dict;
  severity?: "warn" | "fail";
  from?: unknown;
}

/** design-system.yaml, v1 (tokens + rules) or v2 (layers). */
export interface DesignSystem {
  version?: number;
  extends?: string;
  read?: string;
  /** v2 name for v1 `tokens`; the tools read `foundations ?? tokens`. */
  foundations?: Dict;
  tokens?: Dict;
  /** Role tier: each job (text.primary, surface.raised) → a foundation primitive, or { theme: primitive }. */
  roles?: Record<string, string | Record<string, string>>;
  /** Theme ids; each role defines a value per theme (themes are modes, not separate systems). */
  themes?: string[];
  /** Text/surface role pairs to contrast-check; default: every text.* on every surface.*. */
  contrast_pairs?: [string, string][];
  components?: Record<string, ComponentSpec>;
  zones?: Record<string, ZoneSpec>;
  content?: { vocabulary?: { use?: Dict; retired?: Record<string, string> }; voice?: string[] };
  rules?: RuleSpec[];
  preserve?: unknown[];
  tells?: { severity?: Record<string, string> };
  overrides?: { tell: string; scope?: string; reason?: string }[];
  decisions?: unknown[];
  specimen?: { stylesheets?: string[]; themes?: Record<string, { html_attrs?: string; background?: string }> };
  [key: string]: unknown;
}

export interface ProductEntry {
  name?: string;
  paths?: string[];
  extends?: string;
  /** Folder holding the product's system, relative to .atelier/ (default systems/<id>). */
  system?: string;
}

export interface SystemsIndex {
  version?: number;
  products?: Record<string, ProductEntry>;
}

/** A resolved system: where it came from and the merged content. */
export interface ResolvedSystem {
  /** Repo root that owns the .atelier/ folder. */
  root: string;
  /** Product id, or null for a single-product repo / repo-wide base. */
  product: string | null;
  name: string;
  /** Path prefixes (relative to root) this system governs; [""] means the whole root. */
  paths: string[];
  /** Folder of the product's own files (design-system.yaml, DESIGN.md). */
  dir: string;
  /** Files merged to build `system`, base first. */
  sources: string[];
  system: DesignSystem;
}

const LIST_KEYS = new Set(["rules", "preserve", "overrides", "decisions"]);

function readYaml<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  const parsed = parseYaml(readFileSync(file, "utf8"));
  return parsed && typeof parsed === "object" ? (parsed as T) : null;
}

function isPlain(v: unknown): v is Dict {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Merge `over` onto `base`: maps by key, record lists concatenated, scalars replaced. */
export function mergeSystems(base: DesignSystem, over: DesignSystem): DesignSystem {
  const out: Dict = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    if (LIST_KEYS.has(k) && Array.isArray(b) && Array.isArray(v)) out[k] = [...b, ...v];
    else if (isPlain(b) && isPlain(v)) out[k] = mergeSystems(b as DesignSystem, v as DesignSystem);
    else out[k] = v;
  }
  return out as DesignSystem;
}

/** The foundations layer, whichever key the file uses. */
export function foundationsOf(system: DesignSystem): Dict {
  return { ...(system.tokens ?? {}), ...(system.foundations ?? {}) };
}

/** Walk up from `start` to the first folder whose .atelier/ holds a system or an index. */
export function findSystemRoot(start: string): string | null {
  let dir = resolve(start);
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
  for (;;) {
    const a = join(dir, ".atelier");
    if (existsSync(join(a, "design-system.yaml")) || existsSync(join(a, "systems.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readIndex(root: string): SystemsIndex | null {
  return readYaml<SystemsIndex>(join(root, ".atelier", "systems.yaml"));
}

function productDir(root: string, id: string, entry: ProductEntry): string {
  return join(root, ".atelier", entry.system ?? join("systems", id));
}

/** Resolve one product of an indexed repo, following `extends`. */
export function resolveProduct(root: string, id: string, index: SystemsIndex = readIndex(root) ?? {}): ResolvedSystem {
  const products = index.products ?? {};
  const entry = products[id];
  if (!entry) throw new Error(`No product "${id}" in ${join(root, ".atelier", "systems.yaml")}`);
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur && cur !== "none") {
    if (seen.has(cur)) throw new Error(`systems.yaml: "extends" loops through ${[...seen, cur].join(" → ")}`);
    seen.add(cur);
    chain.unshift(cur);
    const e: ProductEntry | undefined = products[cur];
    if (!e) throw new Error(`systems.yaml: "${[...seen].at(-2)}" extends unknown product "${cur}"`);
    cur = e.extends;
  }
  const sources: string[] = [];
  let system: DesignSystem = {};
  const baseFile = join(root, ".atelier", "design-system.yaml");
  if (products[chain[0]]?.extends !== "none" && existsSync(baseFile)) {
    system = readYaml<DesignSystem>(baseFile) ?? {};
    sources.push(baseFile);
  }
  for (const pid of chain) {
    const file = join(productDir(root, pid, products[pid]), "design-system.yaml");
    const layer = readYaml<DesignSystem>(file);
    if (layer) {
      system = mergeSystems(system, layer);
      sources.push(file);
    }
  }
  return {
    root,
    product: id,
    name: entry.name ?? id,
    paths: (entry.paths ?? []).map(normPrefix),
    dir: productDir(root, id, entry),
    sources,
    system,
  };
}

function normPrefix(p: string): string {
  return p.replace(/^\.\//, "").replace(/\/+$/, "");
}

function underPrefix(rel: string, prefix: string): boolean {
  return prefix === "" || rel === prefix || rel.startsWith(prefix + "/");
}

/** Every system a repo declares: each product, or the single repo system. */
export function listSystems(root: string): ResolvedSystem[] {
  const index = readIndex(root);
  if (index?.products && Object.keys(index.products).length) {
    return Object.keys(index.products).map((id) => resolveProduct(root, id, index));
  }
  const file = join(root, ".atelier", "design-system.yaml");
  const system = readYaml<DesignSystem>(file);
  if (!system) return [];
  return [{ root, product: null, name: "repo", paths: [""], dir: join(root, ".atelier"), sources: [file], system }];
}

/**
 * The system that governs `file`: the nearest .atelier/ up from it, then the
 * product whose `paths` hold it (longest prefix wins), else the repo-wide
 * base. Null when no system covers the file.
 */
export function systemForFile(file: string): ResolvedSystem | null {
  const root = findSystemRoot(file);
  if (!root) return null;
  const rel = relative(root, resolve(file)).split(sep).join("/");
  const index = readIndex(root);
  if (index?.products) {
    let best: { id: string; len: number } | null = null;
    for (const [id, e] of Object.entries(index.products)) {
      for (const p of (e.paths ?? []).map(normPrefix)) {
        if (underPrefix(rel, p) && (!best || p.length > best.len)) best = { id, len: p.length };
      }
    }
    if (best) return resolveProduct(root, best.id, index);
  }
  const baseFile = join(root, ".atelier", "design-system.yaml");
  const system = readYaml<DesignSystem>(baseFile);
  if (!system) return null;
  return { root, product: null, name: "repo", paths: [""], dir: join(root, ".atelier"), sources: [baseFile], system };
}

// ── UI files ─────────────────────────────────────────────────────────────

const STRONG_EXT = new Set([".tsx", ".jsx", ".vue", ".svelte", ".astro", ".css", ".scss", ".sass", ".less", ".html", ".htm"]);
const WEAK_EXT = new Set([".ts", ".js", ".mjs", ".cjs"]);
const UI_SEGMENT = /^(gui|ui|components?|views?|pages|screens|widgets|web|frontend|client|static|public|styles?|theme|layouts?)$|-(gui|ui|web)$/;
const SKIP_DIR = /^(node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|coverage|__tests__|__snapshots__|test|tests|fixtures|\.git|\.atelier|\.paradigm|vendor|scripts|bin|tools)$/;
const TEST_FILE = /\.(test|spec|stories)\.[a-z]+$|\.d\.ts$|\.min\.(js|css)$/;

/**
 * Is `rel` (a path relative to a system's root) UI source? Same rule as the
 * UI gate hook: style/markup files anywhere, script files inside UI folders.
 * Inside a product's declared paths every script file counts.
 */
export function isUiPath(rel: string, insideProductPaths = false): boolean {
  const parts = rel.split("/");
  const dirs = parts.slice(0, -1);
  if (dirs.some((d) => SKIP_DIR.test(d)) || TEST_FILE.test(rel)) return false;
  const ext = extname(rel).toLowerCase();
  if (STRONG_EXT.has(ext)) return true;
  if (!WEAK_EXT.has(ext)) return false;
  return insideProductPaths || dirs.some((d) => UI_SEGMENT.test(d));
}

/** UI files a system governs (absolute paths). Folders owned by another product, or by a nested .atelier/ system, are left to that system. */
export function uiFilesFor(sys: ResolvedSystem, limit = 5000): string[] {
  const mine = new Set(sys.paths);
  const foreign = new Set(
    Object.entries(readIndex(sys.root)?.products ?? {})
      .filter(([id]) => id !== sys.product)
      .flatMap(([, e]) => (e.paths ?? []).map(normPrefix))
      .filter((p) => p && !mine.has(p)),
  );
  const inside = sys.product !== null;
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= limit) return;
      const abs = join(dir, name);
      const rel = relative(sys.root, abs).split(sep).join("/");
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (SKIP_DIR.test(name) || foreign.has(rel)) continue;
        if (existsSync(join(abs, ".atelier", "design-system.yaml")) || existsSync(join(abs, ".atelier", "systems.yaml"))) continue;
        walk(abs);
      } else if (st.size < 512 * 1024 && isUiPath(rel, inside)) {
        out.push(abs);
      }
    }
  };
  const starts = inside ? sys.paths.filter(Boolean).map((p) => join(sys.root, p)) : [sys.root];
  for (const s of starts) {
    if (!existsSync(s)) continue;
    if (statSync(s).isDirectory()) walk(s);
    else out.push(s);
  }
  return [...new Set(out)];
}
