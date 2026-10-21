/**
 * Read the style values a UI source file actually uses (#design-system).
 *
 * Line-based and dependency-free on purpose: it works across CSS, SCSS,
 * HTML, JSX/TSX style objects, Vue/Svelte and DOM-building TS, and it is
 * an inventory for a person and an agent to read, not a parser. Values
 * written inside a custom property definition (`--accent: #2457d6`) are
 * token definitions, not uses.
 */

import { readFileSync } from "node:fs";

export type ValueKind = "color" | "font" | "font-size" | "spacing" | "radius" | "shadow" | "duration" | "easing";

export interface Occurrence {
  kind: ValueKind;
  /** Normalised value (lowercase hex for colours, px for lengths where possible). */
  value: string;
  /** The text as written. */
  raw: string;
  file: string;
  line: number;
  /** True inside a custom property definition: a token, not a use. */
  definition: boolean;
  /** CSS property it was found on, when known. */
  prop?: string;
}

export interface CustomProperty {
  name: string;
  value: string;
  file: string;
  line: number;
}

export interface StringLiteral {
  text: string;
  file: string;
  line: number;
}

export interface ScanResult {
  occurrences: Occurrence[];
  customProps: CustomProperty[];
  varUses: Map<string, number>;
  /** Class names seen in markup or DOM code, with counts. */
  classes: Map<string, number>;
  /** Named components (React/Vue/Svelte/web components) with their file. */
  components: { name: string; file: string; line: number }[];
  strings: StringLiteral[];
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)/g;
const SPACING_PROPS = /^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?$/;
const DECL_RE = /(?:^|[;{\s,(])(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}\n]+)/g;
/** Script style objects: a value is one quoted string or a run without commas. */
const DECL_RE_SCRIPT = /(?:^|[;{\s,(])(--[\w-]+|[a-zA-Z-]+)\s*:\s*("[^"\n]*"|'[^'\n]*'|`[^`\n]*`|[^;{}\n,]+)/g;
const STYLE_ASSIGN_RE = /\.style\.([a-zA-Z]+)\s*=\s*["'`]([^"'`]+)["'`]|\.style\.setProperty\(\s*["'`]([\w-]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g;
const KNOWN_PROPS = /^(color|background|background-color|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|font|font-family|font-size|border-radius|border-(top|bottom)-(left|right)-radius|transition|transition-duration|transition-timing-function|animation|animation-duration|animation-timing-function|caret-color|accent-color)$/;

export function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

/** Normalise a CSS colour literal to lowercase hex where it can be. */
export function normColor(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("#")) {
    if (s.length === 4 || s.length === 5) return "#" + [...s.slice(1)].map((c) => c + c).join("");
    return s;
  }
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const hex = [m[1], m[2], m[3]].map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("");
    const a = m[4];
    if (a === undefined || a === "1" || a === "100%") return "#" + hex;
    const alpha = a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
    return "#" + hex + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  return s.replace(/\s+/g, " ");
}

/** [r,g,b] for a #rrggbb(aa) colour, else null. */
export function rgbOf(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** A length in px (rem/em at 16px), or null when it isn't a plain length. */
export function toPx(raw: string): number | null {
  const m = raw.trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n)) return null;
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

function splitValues(v: string): string[] {
  return v.replace(/["'`]/g, " ").split(/[\s,]+/).filter(Boolean);
}

const GENERIC_FONTS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "-apple-system", "blinkmacsystemfont", "inherit", "initial", "unset", "emoji", "math", "fangsong"]);

/** The first named (non-generic) family of a font-family value. */
export function primaryFamily(value: string): string | null {
  for (const part of value.split(",")) {
    const f = part.trim().replace(/^["']|["']$/g, "").trim();
    if (!f || f.startsWith("var(") || GENERIC_FONTS.has(f.toLowerCase())) continue;
    return f;
  }
  return null;
}

/** Scan one file's text. `file` is only recorded, never read. */
export function scanText(text: string, file: string): ScanResult {
  const res: ScanResult = { occurrences: [], customProps: [], varUses: new Map(), classes: new Map(), components: [], strings: [] };
  const isScript = /\.(m?[jt]sx?|cjs|vue|svelte|astro)$/.test(file);
  const lines = text.split("\n");
  lines.forEach((lineText, i) => {
    const line = i + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(lineText) && !/:\s*[^;]+;/.test(lineText)) return;

    for (const m of lineText.matchAll(/var\(\s*(--[\w-]+)/g)) res.varUses.set(m[1], (res.varUses.get(m[1]) ?? 0) + 1);

    const defs = new Set<number>();
    const decls: { rawProp: string; rawValue: string; valueStart: number }[] = [];
    for (const m of lineText.matchAll(isScript ? DECL_RE_SCRIPT : DECL_RE)) {
      decls.push({ rawProp: m[1], rawValue: m[2], valueStart: (m.index ?? 0) + m[0].indexOf(m[2]) });
    }
    for (const m of lineText.matchAll(STYLE_ASSIGN_RE)) {
      decls.push({ rawProp: m[1] ?? m[3], rawValue: m[2] ?? m[4], valueStart: (m.index ?? 0) + m[0].lastIndexOf(m[2] ?? m[4]) });
    }
    for (const { rawProp, rawValue, valueStart } of decls) {
      const value = rawValue.trim().replace(/[,'"`]+$/, "").replace(/^['"`]/, "").trim();
      if (rawProp.startsWith("--")) {
        res.customProps.push({ name: rawProp, value, file, line });
        for (let k = valueStart; k < valueStart + rawValue.length; k++) defs.add(k);
        continue;
      }
      const prop = camelToKebab(rawProp);
      if (!KNOWN_PROPS.test(prop) && !SPACING_PROPS.test(prop) && prop !== "font-weight") continue;
      if (/var\(|calc\(|\$\{/.test(value) && !COLOR_RE.test(value)) continue;
      const push = (kind: ValueKind, v: string, raw: string): void => {
        res.occurrences.push({ kind, value: v, raw, file, line, definition: false, prop });
      };
      if (prop === "font-family") {
        const fam = primaryFamily(value);
        if (fam) push("font", fam, value);
      } else if (prop === "font-size") {
        const px = toPx(isScript && /^\d+(\.\d+)?$/.test(value) ? value + "px" : value);
        if (px !== null) push("font-size", String(px), value);
      } else if (SPACING_PROPS.test(prop)) {
        for (const part of splitValues(value)) {
          const px = toPx(isScript && /^\d+(\.\d+)?$/.test(part) ? part + "px" : part);
          if (px !== null && px > 1) push("spacing", String(Math.abs(px)), part);
        }
      } else if (/radius$/.test(prop)) {
        for (const part of splitValues(value)) {
          const px = toPx(isScript && /^\d+(\.\d+)?$/.test(part) ? part + "px" : part);
          if (px !== null) push("radius", String(px), part);
        }
      } else if (prop === "box-shadow" || prop === "text-shadow") {
        if (value !== "none") push("shadow", value.replace(/\s+/g, " "), value);
      } else if (/^(transition|animation)/.test(prop)) {
        for (const d of value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
          push("duration", String(d[2] === "s" ? Math.round(Number(d[1]) * 1000) : Number(d[1])), d[0]);
        }
        for (const e of value.matchAll(/cubic-bezier\([^)]*\)|\b(ease-in-out|ease-in|ease-out|linear|ease)\b/g)) {
          push("easing", e[0].replace(/\s+/g, ""), e[0]);
        }
      }
    }

    for (const m of lineText.matchAll(COLOR_RE)) {
      const raw = m[0];
      if (raw.startsWith("#")) {
        // "#" glued to a word, or an id selector opening a rule, isn't a colour.
        const before = lineText[(m.index ?? 0) - 1];
        if (before && /[\w&-]/.test(before)) continue;
        if (/^\s*[{,]/.test(lineText.slice((m.index ?? 0) + raw.length))) continue;
        if (/\b(href|src|action|to|for|xlink:href)\s*=\s*\{?["'`]?$/.test(lineText.slice(0, m.index ?? 0))) continue;
      }
      if (raw.startsWith("#") && /^#[0-9a-fA-F]{3,8}$/.test(raw) && ![3, 4, 6, 8].includes(raw.length - 1)) continue;
      res.occurrences.push({ kind: "color", value: normColor(raw), raw, file, line, definition: defs.has(m.index ?? -1), prop: undefined });
    }

    const classStrings = new Set<string>();
    for (const m of lineText.matchAll(/\bclass(?:Name)?\s*[=:]\s*["'`]([^"'`$]+)["'`]|classList\.(?:add|toggle)\(\s*["'`]([\w-]+)["'`]/g)) {
      classStrings.add(m[1] ?? m[2] ?? "");
      for (const c of (m[1] ?? m[2] ?? "").split(/\s+/).filter((c) => /^[a-zA-Z][\w-]*$/.test(c))) {
        res.classes.set(c, (res.classes.get(c) ?? 0) + 1);
      }
    }

    if (isScript) {
      // Components: exported capitalised functions in JSX files, custom elements anywhere.
      const comp =
        (/\.[jt]sx$/.test(file) ? lineText.match(/^\s*export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w+)/) : null) ??
        lineText.match(/customElements\.define\(\s*["'`]([\w-]+)["'`]/) ??
        lineText.match(/class\s+([A-Z]\w+)\s+extends\s+HTMLElement\b/);
      if (comp) res.components.push({ name: comp[1], file, line });
      for (const m of lineText.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.){2,})\1/g)) {
        const t = m[2];
        if (classStrings.has(t)) continue;
        if (/[A-Za-z]{2,}\s+[A-Za-z]/.test(t) && !/^[\w./@-]+$/.test(t) && !/[{};=<>]/.test(t)) res.strings.push({ text: t, file, line });
      }
    }
    if (/\.(html?|vue|svelte|astro|[jt]sx)$/.test(file)) {
      for (const m of lineText.matchAll(/>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g)) {
        const t = m[1].trim();
        if (t) res.strings.push({ text: t, file, line });
      }
    }
  });
  if (/\.(vue|svelte)$/.test(file)) {
    const name = file.split("/").pop()!.replace(/\.(vue|svelte)$/, "");
    res.components.push({ name, file, line: 1 });
  }
  return res;
}

export function scanFile(file: string): ScanResult {
  return scanText(readFileSync(file, "utf8"), file);
}

/** Merge many scans into one. */
export function mergeScans(scans: ScanResult[]): ScanResult {
  const out: ScanResult = { occurrences: [], customProps: [], varUses: new Map(), classes: new Map(), components: [], strings: [] };
  for (const s of scans) {
    out.occurrences.push(...s.occurrences);
    out.customProps.push(...s.customProps);
    out.components.push(...s.components);
    out.strings.push(...s.strings);
    for (const [k, v] of s.varUses) out.varUses.set(k, (out.varUses.get(k) ?? 0) + v);
    for (const [k, v] of s.classes) out.classes.set(k, (out.classes.get(k) ?? 0) + v);
  }
  return out;
}
