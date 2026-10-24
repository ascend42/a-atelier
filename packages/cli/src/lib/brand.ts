/**
 * Brand kits (#brand-kit): a brand's strategy, mark and logo system, kept
 * beside the design system it feeds.
 *
 *   .atelier/brand/                       a repo's brand (single product)
 *   .atelier/systems/<product>/brand/     a product's brand
 *   _brand/                               a home studio's brand (inherited by every project)
 *     brand.yaml      strategy, nouns, mark, logo system, colour, type, rounds
 *     marks/          the mark and its lockups (SVG preferred)
 *     brand.html      the brand sheet (`atelier brand sheet`)
 *
 * The process that fills it is the atelier-design skill's `brand` verb
 * (reference/brand.md), distilled from Allan Peters's practice in the
 * neurons brain (n:brand-noun-list, n:logo-exploration-funnel,
 * n:logo-system-by-media-size, n:mark-quality-tests).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { findSystemRoot, productDir, readIndex } from "./design-system.js";
import { contrastRatio } from "./design-lint.js";

export interface BrandLockup {
  id: string;
  file: string;
  /** Where it's used, e.g. "avatar, favicon". */
  use?: string;
  /** Smallest size it may be shown at, in px of its height. */
  min_px?: number;
}

export interface Brand {
  version?: number;
  name?: string;
  /** new | refresh | redesign */
  kind?: string;
  strategy?: { truths?: { truth: string; evidence?: string }[]; audience?: string; personality?: string[] };
  nouns?: { kept?: (string | { noun: string; why?: string })[]; struck?: (string | { noun: string; why?: string })[] };
  /** Redesigns: what people already recognise and must survive. */
  equity?: string[];
  mark?: { idea?: string; nouns?: string[]; second_read?: string; file?: string };
  /** The logo system, smallest media first (short story → long story). */
  system?: BrandLockup[];
  color?: Record<string, string>;
  type?: Record<string, string>;
  voice?: { adjectives?: string[]; do?: string[]; dont?: string[] };
  clearspace?: string;
  misuse?: string[];
  rounds?: { round: number; method?: string; shown?: string[]; picked?: string[]; misreadings?: Record<string, string[]>; notes?: string[] }[];
  decisions?: unknown[];
  [key: string]: unknown;
}

/** A user-facing brand error (bad --product); the CLI prints its message, no stack. */
export class BrandError extends Error {}

/** The grounds a brand's ink and accent are measured against, in order: paper, background, surface. */
export const brandGrounds = (c: Record<string, string> = {}): [string, string][] =>
  (["paper", "background", "surface"] as const).flatMap((k) => (typeof c[k] === "string" ? [[k, c[k]] as [string, string]] : []));

/** The first ground (what the sheet shows contrast against). */
export const brandGround = (c: Record<string, string> = {}): string | undefined => brandGrounds(c)[0]?.[1];

/**
 * A kit file's absolute path, or null when `file` leaves the kit folder
 * (absolute, or climbing out with `..`): brand.yaml is data, not a licence to
 * read or link anywhere on disk.
 */
export function kitPath(dir: string, file: string): string | null {
  if (typeof file !== "string" || !file || isAbsolute(file)) return null;
  const abs = resolve(dir, file);
  const rel = relative(resolve(dir), abs);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : abs;
}

/** kitPath, and it names a file that exists (not a directory). */
export function kitFileExists(dir: string, file: string): boolean {
  const abs = kitPath(dir, file);
  try {
    return abs !== null && statSync(abs).isFile();
  } catch {
    return false;
  }
}

export interface BrandCheck {
  id: string;
  severity: "warn" | "fail";
  message: string;
}

/**
 * Find the brand folder for a directory: `start` itself when it holds
 * brand.yaml, the product's (when `product` is given), else the nearest
 * `.atelier/brand/`, else a workspace `_brand/`. Throws BrandError for a
 * product that isn't declared.
 */
export function findBrandDir(start: string, product?: string): string | null {
  if (product) {
    const root = findSystemRoot(start);
    const entry = root ? readIndex(root)?.products?.[product] : undefined;
    if (!root || !entry) throw new BrandError(`No product "${product}" in .atelier/systems.yaml (atelier system init --product ${product} declares one)`);
    return join(productDir(root, product, entry), "brand");
  }
  if (existsSync(join(resolve(start), "brand.yaml"))) return resolve(start);
  const root = findSystemRoot(start);
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".atelier", "brand", "brand.yaml"))) return join(dir, ".atelier", "brand");
    if (existsSync(join(dir, "_brand", "brand.yaml"))) return join(dir, "_brand");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return root ? join(root, ".atelier", "brand") : null;
}

export function loadBrand(dir: string): Brand | null {
  const file = join(dir, "brand.yaml");
  if (!existsSync(file)) return null;
  const parsed = parseYaml(readFileSync(file, "utf8"));
  return parsed && typeof parsed === "object" ? (parsed as Brand) : null;
}

/** An SVG's aspect (width / height) from the root <svg> tag's viewBox, else its unitless or px width and height; null when it can't tell. */
export function svgAspect(svg: string): number | null {
  const root = svg.match(/<svg\b[^>]*/i)?.[0];
  if (!root) return null;
  const vb = root.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (vb) return Number(vb[2]) ? Number(vb[1]) / Number(vb[2]) : null;
  const dim = (name: string): number | null => {
    const m = root.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, "i"));
    return m ? Number(m[1]) : null;
  };
  const w = dim("width");
  const h = dim("height");
  return w && h ? w / h : null;
}

/** Colours an SVG paints with (fill, stroke and stop-color in attributes and styles): hex, rgb()/hsl() and named. none, currentColor, transparent and paint servers don't count. */
export function svgColors(svg: string): string[] {
  const skip = new Set(["none", "transparent", "currentcolor", "inherit", "url", "context-fill", "context-stroke"]);
  const found = [...svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|[a-z]+)/gi)]
    .map((m) => m[1].toLowerCase().replace(/\s+/g, ""))
    .filter((c) => !skip.has(c));
  return [...new Set(found)];
}

const noun = (n: string | { noun: string }): string => (typeof n === "string" ? n : n.noun);

/** Check a brand kit against the process: strategy before marks, a system by media size, the mark holding up small, in one colour, on the brand's grounds. */
export function checkBrand(brand: Brand, dir: string): BrandCheck[] {
  const out: BrandCheck[] = [];
  const push = (id: string, severity: "warn" | "fail", message: string): void => {
    out.push({ id, severity, message });
  };
  if (!brand.strategy?.truths?.length) push("brand-no-strategy", "fail", "strategy.truths is empty: name what sets the brand apart before drawing (n:mark-from-brand-strategy)");
  if (!brand.nouns?.kept?.length) push("brand-no-nouns", "warn", "no kept nouns: agree the subject matter with the creator first (n:brand-noun-list)");
  if (brand.kind === "redesign" && !brand.equity?.length) push("brand-no-equity", "warn", "a redesign with no equity list: say what people already recognise and must survive (n:keep-equity-when-redesigning-a-mark)");

  const markFile = brand.mark?.file ?? brand.system?.[0]?.file;
  if (!markFile) push("brand-no-mark", "fail", "no mark file (mark.file or the first system entry)");
  else if (kitPath(dir, markFile) === null) push("brand-path-outside-kit", "fail", `mark file ${markFile} is outside the brand folder; keep kit files inside it (marks/)`);
  else if (!kitFileExists(dir, markFile)) push("brand-missing-file", "fail", `mark file ${markFile} doesn't exist`);
  else if (markFile.endsWith(".svg")) {
    const svg = readFileSync(kitPath(dir, markFile)!, "utf8");
    const aspect = svgAspect(svg);
    if (aspect !== null && (aspect < 3 / 4 - 1e-6 || aspect > 4 / 3 + 1e-6)) {
      push("mark-not-compact", "warn", `the mark is ${aspect.toFixed(2)}:1; the smallest media (avatar, favicon) need a roughly square mark, so keep wide forms for lockups`);
    }
    const colors = svgColors(svg);
    if (colors.length > 3) push("mark-too-many-colours", "warn", `the mark uses ${colors.length} colours; it must also work in one colour (fewest brush strokes, n:reduce-to-the-edge)`);
    const paths = (svg.match(/<(path|circle|rect|polygon|ellipse|line|polyline)\b/gi) ?? []).length;
    if (paths > 24) push("mark-too-complex", "warn", `the mark has ${paths} shapes; at 16px most of that detail is lost (n:logo-system-by-media-size)`);
  }
  if (!brand.mark?.idea) push("mark-no-idea", "warn", "mark.idea is empty: one sentence on what it shows and why it's this brand");

  const system = brand.system ?? [];
  if (system.length < 3) push("brand-system-thin", "warn", `the logo system has ${system.length} lockup(s); a system runs from the bare mark (small media) to a full badge or lockup (large media)`);
  for (const l of system) {
    if (kitPath(dir, l.file) === null) push("brand-path-outside-kit", "fail", `${l.id}: ${l.file} is outside the brand folder; keep kit files inside it (marks/)`);
    else if (!kitFileExists(dir, l.file)) push("brand-missing-file", "fail", `${l.id}: ${l.file} doesn't exist`);
  }
  const smallest = Math.min(...system.map((l) => l.min_px ?? Infinity));
  if (system.length && !(smallest <= 32)) push("brand-no-small-form", "warn", "no lockup is meant for 32px or smaller: say which one serves favicons and avatars (min_px)");

  const c = brand.color ?? {};
  for (const [key, ground] of brandGrounds(c)) {
    if (c.ink) {
      const r = contrastRatio(c.ink, ground);
      if (r !== null && r < 4.5) push("brand-ink-contrast", "fail", `ink on ${key} is ${r.toFixed(2)}:1, under 4.5:1 for text`);
    }
    if (c.accent) {
      const r = contrastRatio(c.accent, ground);
      if (r !== null && r < 3) push("brand-accent-contrast", "warn", `accent on ${key} is ${r.toFixed(2)}:1; a mark or control in the accent needs 3:1 (WCAG 1.4.11)`);
    }
  }
  if (!brand.type || !Object.keys(brand.type).length) push("brand-no-type", "warn", "no typography recorded; the lockups share one type system");

  const kept = new Set((brand.nouns?.kept ?? []).map(noun).map((n) => n.toLowerCase()));
  for (const n of brand.mark?.nouns ?? []) {
    if (kept.size && !kept.has(n.toLowerCase())) push("mark-noun-not-kept", "warn", `the mark uses "${n}", which isn't on the kept noun list`);
  }
  return out;
}
