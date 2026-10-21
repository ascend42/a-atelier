/**
 * `atelier system extract` — what a product's UI actually uses (#design-system).
 *
 * Mika's first step on any design system: before anyone decides anything,
 * inventory the real values (colours, type, spacing, radii, shadows,
 * motion), the tokens already defined and how often they are used, the
 * components and class families, and the copy. Near-duplicates are grouped,
 * because each group is a decision the system has not made yet ("four
 * greys that should be one"). When the product already has a system, every
 * value is marked on- or off-system.
 */

import { relative } from "node:path";
import { foundationsOf, uiFilesFor, type ResolvedSystem, type Dict } from "./design-system.js";
import { mergeScans, scanFile, rgbOf, normColor, toPx, primaryFamily, type ValueKind, type Occurrence } from "./design-scan.js";

export interface ValueEntry {
  value: string;
  count: number;
  /** Up to 5 example locations, `file:line` relative to the repo root. */
  where: string[];
  /** Matches a foundation value in the system (undefined when there is no system). */
  onSystem?: boolean;
  /** Custom properties defined with this value. */
  tokens: string[];
}

export interface NearGroup {
  kind: ValueKind;
  values: string[];
  count: number;
}

export interface Inventory {
  root: string;
  product: string | null;
  name: string;
  generated: string;
  files: number;
  hasSystem: boolean;
  values: Record<ValueKind, ValueEntry[]>;
  nearDuplicates: NearGroup[];
  tokens: { name: string; value: string; uses: number; where: string }[];
  unusedTokens: string[];
  undefinedTokens: string[];
  components: { name: string; where: string }[];
  classFamilies: { family: string; classes: number; uses: number; members: string[] }[];
  copy: { distinct: number; samples: { text: string; where: string }[] };
  drift: Partial<Record<ValueKind, number>>;
}

const KINDS: ValueKind[] = ["color", "font", "font-size", "spacing", "radius", "shadow", "duration", "easing"];

function flattenValues(obj: unknown, out: string[] = []): string[] {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) obj.forEach((v) => flattenValues(v, out));
  else if (typeof obj === "object") Object.values(obj as Dict).forEach((v) => flattenValues(v, out));
  else out.push(String(obj));
  return out;
}

/** The values a system's foundations allow, per kind. */
export function allowedValues(foundations: Dict): Partial<Record<ValueKind, Set<string>>> {
  const f = foundations as Record<string, unknown>;
  const lengths = (v: unknown): Set<string> =>
    new Set(flattenValues(v).map((x) => toPx(String(x)) ?? toPx(String(x) + "px")).filter((n): n is number => n !== null).map(String));
  const out: Partial<Record<ValueKind, Set<string>>> = {};
  if (f.color) out.color = new Set(flattenValues(f.color).filter((v) => /^#|\(/.test(v)).map(normColor));
  if (f.font) out.font = new Set(flattenValues(f.font).map((v) => (primaryFamily(v) ?? v).toLowerCase()));
  if (f.space) out.spacing = lengths(f.space);
  if (f.radius) out.radius = lengths(f.radius);
  const type = f.type as Dict | undefined;
  if (type) {
    const sizes = type.sizes ? lengths(type.sizes) : new Set<string>();
    const base = Number(type.base);
    const ratio = Number(type.scale);
    if (base && ratio) for (let n = -3; n <= 6; n++) sizes.add(String(Math.round(base * ratio ** n)));
    if (sizes.size) out["font-size"] = sizes;
  }
  if (f.motion) {
    const vals = flattenValues(f.motion);
    out.duration = new Set(vals.map((v) => v.match(/^(\d+)(ms)?$/)?.[1]).filter(Boolean) as string[]);
    out.easing = new Set(vals.filter((v) => /cubic-bezier|ease|linear/.test(v)).map((v) => v.replace(/\s+/g, "")));
  }
  return out;
}

/** Is an occurrence on-system? Fonts compare case-insensitively; lengths exactly. */
export function isOnSystem(kind: ValueKind, value: string, allowed: Partial<Record<ValueKind, Set<string>>>): boolean | undefined {
  const set = allowed[kind];
  if (!set) return undefined;
  if (kind === "font") return set.has(value.toLowerCase());
  if (kind === "color") return set.has(value) || set.has(value.slice(0, 7));
  // Scales match exactly; the small tolerance only absorbs rem → px rounding.
  if (["font-size", "spacing", "radius"].includes(kind)) return [...set].some((s) => Math.abs(Number(s) - Number(value)) <= 0.05);
  return set.has(value);
}

function colorDistance(a: string, b: string): number {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return Infinity;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Group values a person would see as "the same thing, written twice". */
export function nearDuplicates(kind: ValueKind, entries: ValueEntry[]): NearGroup[] {
  const close = (a: string, b: string): boolean => {
    if (kind === "color") return a.length === b.length && colorDistance(a, b) < 14;
    const x = Number(a);
    const y = Number(b);
    // Relative tolerance: 6 vs 7 reads as "the same gap", 4 vs 8 is a real step.
    if (kind === "font-size") return Math.abs(x - y) <= 0.5;
    if (kind === "spacing" || kind === "radius") return x >= 2 && y >= 2 && Math.abs(x - y) <= Math.max(1, 0.15 * Math.max(x, y));
    if (kind === "duration") return Math.abs(x - y) <= Math.max(20, 0.15 * Math.max(x, y));
    return false;
  };
  const groups: NearGroup[] = [];
  const used = new Set<string>();
  const sorted = [...entries].sort((a, b) => b.count - a.count);
  for (const e of sorted) {
    if (used.has(e.value)) continue;
    const members: ValueEntry[] = [];
    for (const o of sorted) {
      if (!used.has(o.value) && members.every((m) => close(m.value, o.value)) && (o === e || close(e.value, o.value))) members.push(o);
    }
    if (members.length > 1) {
      members.forEach((m) => used.add(m.value));
      groups.push({ kind, values: members.map((m) => m.value), count: members.reduce((n, m) => n + m.count, 0) });
    }
  }
  return groups;
}

export function extract(sys: ResolvedSystem, opts: { files?: string[] } = {}): Inventory {
  const files = opts.files ?? uiFilesFor(sys);
  const scan = mergeScans(files.map((f) => scanFile(f)));
  const rel = (o: { file: string; line: number }): string => `${relative(sys.root, o.file)}:${o.line}`;
  const hasSystem = sys.sources.length > 0;
  const allowed = hasSystem ? allowedValues(foundationsOf(sys.system)) : {};

  const tokenByValue = new Map<string, string[]>();
  for (const cp of scan.customProps) {
    for (const c of cp.value.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\([^)]*\)/g) ?? []) {
      const v = normColor(c);
      tokenByValue.set(v, [...new Set([...(tokenByValue.get(v) ?? []), cp.name])]);
    }
    const px = toPx(cp.value);
    if (px !== null) tokenByValue.set(String(px), [...new Set([...(tokenByValue.get(String(px)) ?? []), cp.name])]);
  }

  const values = {} as Record<ValueKind, ValueEntry[]>;
  const drift: Partial<Record<ValueKind, number>> = {};
  for (const kind of KINDS) {
    const byValue = new Map<string, Occurrence[]>();
    for (const o of scan.occurrences) {
      if (o.kind !== kind || o.definition) continue;
      byValue.set(o.value, [...(byValue.get(o.value) ?? []), o]);
    }
    values[kind] = [...byValue.entries()]
      .map(([value, occ]) => ({
        value,
        count: occ.length,
        where: occ.slice(0, 5).map(rel),
        onSystem: isOnSystem(kind, value, allowed),
        tokens: tokenByValue.get(value) ?? [],
      }))
      .sort((a, b) => b.count - a.count);
    const off = values[kind].filter((e) => e.onSystem === false).reduce((n, e) => n + e.count, 0);
    if (off) drift[kind] = off;
  }

  const defined = new Map<string, { value: string; where: string }>();
  for (const cp of scan.customProps) if (!defined.has(cp.name)) defined.set(cp.name, { value: cp.value, where: rel(cp) });
  const tokens = [...defined.entries()].map(([name, d]) => ({ name, value: d.value, uses: scan.varUses.get(name) ?? 0, where: d.where }));

  const families = new Map<string, { classes: Set<string>; uses: number }>();
  for (const [cls, n] of scan.classes) {
    const fam = cls.split(/__|--/)[0].split("-")[0];
    const f = families.get(fam) ?? { classes: new Set(), uses: 0 };
    f.classes.add(cls);
    f.uses += n;
    families.set(fam, f);
  }

  const copyMap = new Map<string, { text: string; where: string }>();
  for (const s of scan.strings) if (!copyMap.has(s.text)) copyMap.set(s.text, { text: s.text, where: rel(s) });

  return {
    root: sys.root,
    product: sys.product,
    name: sys.name,
    generated: new Date().toISOString(),
    files: files.length,
    hasSystem,
    values,
    nearDuplicates: KINDS.flatMap((k) => nearDuplicates(k, values[k])),
    tokens: tokens.sort((a, b) => b.uses - a.uses),
    unusedTokens: tokens.filter((t) => t.uses === 0).map((t) => t.name),
    undefinedTokens: [...scan.varUses.keys()].filter((n) => !defined.has(n)),
    components: scan.components.map((c) => ({ name: c.name, where: rel(c) })),
    classFamilies: [...families.entries()]
      .map(([family, f]) => ({ family, classes: f.classes.size, uses: f.uses, members: [...f.classes].slice(0, 12) }))
      .sort((a, b) => b.uses - a.uses),
    copy: { distinct: copyMap.size, samples: [...copyMap.values()].slice(0, 200) },
    drift,
  };
}
