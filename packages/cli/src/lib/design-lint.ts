/**
 * `atelier system lint` — check a design system against itself (#design-system).
 *
 * `atelier check` holds code to the system; this holds the system to the
 * playbook (docs/playbook/proposals.md, v1):
 *   - token tiers: `foundations` are the primitives; `roles` name each job
 *     (text.primary, surface.raised) and resolve to a primitive, per theme
 *     (chains are fine, loops and dangling references fail: W3C DTCG 2025.10);
 *     component `tokens` bind to roles, never to primitives
 *   - themes are modes: every role defines a value for every theme
 *   - text on surface meets WCAG 1.4.3 (4.5:1) in every theme
 *   - roles are named for what they do, not how they look
 *   - spacing sits on the base unit
 *   - interactive components cover the interactive and functional states
 */

import { foundationsOf, type DesignSystem, type Dict } from "./design-system.js";
import { normColor, rgbOf } from "./design-scan.js";

export interface LintFinding {
  id: string;
  severity: "warn" | "fail";
  where: string;
  message: string;
}

/** Component kinds (n:ui-element-types). */
export const COMPONENT_KINDS = ["input", "informational", "navigational", "container"] as const;

/** States every interactive component needs (n:interactive-states, rules.yaml components-cover-all-states). */
export const INTERACTIVE_STATES = ["default", "hover", "focus", "active", "disabled"];
/** Functional states an input that submits or loads needs (n:loading-state-prevents-double-submit, n:error-state-resets-for-retry). */
export const INPUT_STATES = ["loading", "error"];

const LOOK_WORDS = /(^|[.\-_/])(red|orange|yellow|green|teal|blue|indigo|purple|violet|pink|gray|grey|black|white|brown|beige|cream|light|dark|bright|pale)([.\-_/]|$)/i;

/** Every primitive in the foundations as "group.name" → value (nested maps flatten with dots). */
export function primitives(system: DesignSystem): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (v: unknown, path: string): void => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v as Dict)) walk(x, path ? `${path}.${k}` : k);
    } else if (path) out.set(path, Array.isArray(v) ? v.join(", ") : String(v));
  };
  walk(foundationsOf(system), "");
  return out;
}

type RoleValue = string | Record<string, string>;

/**
 * Theme ids: `themes:` if declared, else the specimen's themes, else the
 * theme keys the roles themselves use. `explicit` is false only when no
 * role is per-theme at all (a single-theme system).
 */
export function themeInfo(system: DesignSystem): { themes: string[]; explicit: boolean } {
  const declared = system.themes;
  if (Array.isArray(declared) && declared.length) return { themes: declared.map(String), explicit: true };
  const spec = Object.keys(system.specimen?.themes ?? {});
  if (spec.length) return { themes: spec, explicit: true };
  const used = new Set<string>();
  for (const v of Object.values(system.roles ?? {})) if (v && typeof v === "object") Object.keys(v).forEach((k) => used.add(k));
  return used.size ? { themes: [...used], explicit: true } : { themes: [""], explicit: false };
}

export function themesOf(system: DesignSystem): string[] {
  return themeInfo(system).themes;
}

/** A role's value in one theme: the raw reference (not yet resolved). */
export function roleRef(value: RoleValue | undefined, theme: string): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value[theme];
  return undefined;
}

/** Resolve a role in a theme to a concrete value, following primitive and role refs. Pass `prims` to avoid rebuilding it. */
export function resolveRole(system: DesignSystem, role: string, theme: string, prims: Map<string, string> = primitives(system), seen = new Set<string>()): string | undefined {
  const roles: Record<string, RoleValue> = system.roles ?? {};
  const ref = roleRef(roles[role], theme);
  if (ref === undefined) return undefined;
  if (prims.has(ref)) return prims.get(ref);
  if (ref in roles && !seen.has(ref)) return resolveRole(system, ref, theme, prims, new Set([...seen, role]));
  return ref;
}

/** A length in px from 4, "4px", "0.25rem"; null otherwise. */
function px(v: unknown): number | null {
  const m = String(v ?? "").trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

/** The spacing base unit in px and the scale steps in px, whether the scale is a list or a named map. */
export function spaceScale(system: DesignSystem): { base: number | null; steps: number[] } {
  const space = (foundationsOf(system).space ?? {}) as Dict;
  const raw = Array.isArray(space.scale) ? space.scale : space.scale && typeof space.scale === "object" ? Object.values(space.scale as Dict) : [];
  return { base: px(space.base), steps: (raw as unknown[]).map(px).filter((n): n is number => n !== null) };
}

/** A component's states as a list, whether written as a list, a map (state → markup) or a string. */
export function statesOf(states: unknown): string[] {
  if (Array.isArray(states)) return states.map((x) => String(x).toLowerCase());
  if (states && typeof states === "object") return Object.keys(states).map((x) => x.toLowerCase());
  if (typeof states === "string") return states.split(/[\s,]+/).filter(Boolean).map((x) => x.toLowerCase());
  return [];
}

/** WCAG 2.x relative luminance of an opaque colour; null for non-sRGB or translucent colours. */
export function luminance(color: string): number | null {
  const hex = normColor(color);
  if (/^#[0-9a-f]{8}$/.test(hex) && !hex.endsWith("ff")) return null; // translucent: depends on what's behind it
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, or null when either colour isn't opaque sRGB. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text-on-surface pairs to check: `contrast_pairs` if given. Otherwise
 * ordinary text roles go on ordinary surfaces; inverse text on inverse
 * surfaces; "on-X" text (text.on-accent) on the roles named X. Disabled
 * and placeholder text are exempt (WCAG 1.4.3 inactive components).
 */
export function contrastPairs(system: DesignSystem): [string, string][] {
  const explicit = system.contrast_pairs;
  if (Array.isArray(explicit) && explicit.length) return explicit.filter((p) => Array.isArray(p) && p.length === 2) as [string, string][];
  const names = Object.keys(system.roles ?? {});
  const isText = (n: string): boolean => /^(text|fg|foreground)([.\-_]|$)/.test(n) && !/disabled|placeholder/.test(n);
  const isSurface = (n: string): boolean => /^(surface|bg|background)([.\-_]|$)/.test(n);
  const inverse = (n: string): boolean => /inverse|inverted/.test(n);
  const pairs: [string, string][] = [];
  for (const t of names.filter(isText)) {
    const on = t.match(/[.\-_]on[.\-_]([\w-]+)$/)?.[1];
    if (on) {
      for (const r of names) if (r !== t && r.split(/[.\-_]/).includes(on) && !isText(r)) pairs.push([t, r]);
      continue;
    }
    for (const sf of names.filter(isSurface)) if (inverse(t) === inverse(sf)) pairs.push([t, sf]);
  }
  return pairs;
}

export function lintSystem(system: DesignSystem): LintFinding[] {
  const out: LintFinding[] = [];
  const seenFindings = new Set<string>();
  const push = (f: LintFinding): void => {
    const key = `${f.id}|${f.where}|${f.message}`;
    if (seenFindings.has(key)) return;
    seenFindings.add(key);
    out.push(f);
  };
  const prims = primitives(system);
  const roles: Record<string, RoleValue> = system.roles ?? {};
  const { themes, explicit } = themeInfo(system);
  const tag = (theme: string): string => (explicit && themes.length > 1 ? ` (${theme})` : "");
  const isRef = (v: string): boolean => /^[a-z][\w-]*(\.[\w-]+)+$/i.test(v);

  // Roles: named by job, defined in every theme, resolving to a primitive.
  for (const [role, value] of Object.entries(roles)) {
    if (LOOK_WORDS.test(role)) {
      push({ id: "role-named-by-look", severity: "warn", where: `roles.${role}`, message: `"${role}" names a look, not a job; name it for what it does (text.secondary, surface.raised, status.error)` });
    }
    if (value && typeof value === "object" && explicit) {
      const missing = themes.filter((t) => !(t in value));
      if (missing.length) push({ id: "role-missing-theme", severity: "fail", where: `roles.${role}`, message: `no value for theme ${missing.join(", ")}` });
    }
    // A plain string is the same in every theme: check it once.
    const checkThemes = typeof value === "string" ? [themes[0]] : themes;
    for (const theme of checkThemes) {
      const ref = roleRef(value, theme);
      if (ref === undefined) continue;
      const where = `roles.${role}${typeof value === "string" ? "" : tag(theme)}`;
      if (ref in roles) {
        // Chains are allowed (W3C DTCG 2025.10 §7.2.2); loops, dangling ends and deep chains are not.
        const chain = [role];
        let cur: string | undefined = ref;
        while (cur !== undefined && cur in roles && !chain.includes(cur)) {
          chain.push(cur);
          cur = roleRef(roles[cur], theme);
        }
        if (cur !== undefined && chain.includes(cur)) {
          push({ id: "role-circular", severity: "fail", where, message: `references loop: ${[...chain, cur].join(" → ")}` });
        } else if (cur !== undefined && !prims.has(cur) && isRef(cur)) {
          push({ id: "role-unresolved", severity: "fail", where, message: `${chain.join(" → ")} ends at "${cur}", which isn't a role or a primitive` });
        } else if (chain.length > 3) {
          push({ id: "role-chain-deep", severity: "warn", where, message: `${chain.length} hops (${chain.join(" → ")}); keep chains short so a change is easy to trace` });
        }
      } else if (!prims.has(ref)) {
        if (isRef(ref)) push({ id: "role-unresolved", severity: "fail", where, message: `"${ref}" isn't a role or a primitive` });
        else push({ id: "role-literal", severity: "warn", where, message: `"${ref}" is a raw value; add it to foundations and point the role at it` });
      }
    }
  }

  // Text on surface, per theme.
  for (const [text, surface] of contrastPairs(system)) {
    for (const theme of themes) {
      const fg = resolveRole(system, text, theme, prims);
      const bg = resolveRole(system, surface, theme, prims);
      if (!fg || !bg) continue;
      const ratio = contrastRatio(fg, bg);
      const where = `${text} on ${surface}${tag(theme)}`;
      if (ratio === null) {
        if (/^#[0-9a-f]{8}$/i.test(normColor(fg)) || /^#[0-9a-f]{8}$/i.test(normColor(bg))) {
          push({ id: "role-contrast-unknown", severity: "warn", where, message: "a translucent colour: contrast depends on what's behind it; check it rendered, or list the composited pair in contrast_pairs" });
        }
      } else if (ratio < 4.5) {
        push({ id: "role-contrast", severity: "fail", where, message: `${ratio.toFixed(2)}:1 is under 4.5:1 for text (WCAG 1.4.3)` });
      }
    }
  }

  // Spacing on the base unit.
  const { base, steps } = spaceScale(system);
  if (base && base > 0) {
    const off = steps.filter((v) => v > 2 && v % base !== 0);
    if (off.length) push({ id: "space-off-base", severity: "warn", where: "foundations.space.scale", message: `${off.join(", ")} aren't multiples of the ${base}px base unit` });
  }

  // Components: a kind, bindings to roles, the states their kind needs.
  for (const [id, c] of Object.entries(system.components ?? {})) {
    const where = `components.${id}`;
    if (c.kind && !(COMPONENT_KINDS as readonly string[]).includes(c.kind)) {
      push({ id: "component-kind", severity: "warn", where, message: `kind "${c.kind}" isn't one of ${COMPONENT_KINDS.join(", ")}` });
    }
    for (const [slot, ref] of Object.entries(c.tokens ?? {})) {
      const r = String(ref);
      if (/^#|^rgb|^hsl|^oklch/i.test(r)) {
        push({ id: "component-binds-literal", severity: "warn", where: `${where}.tokens.${slot}`, message: `binds a raw value ${r}; bind a role` });
      } else if (prims.has(r)) {
        push({ id: "component-binds-primitive", severity: "warn", where: `${where}.tokens.${slot}`, message: `binds the primitive ${r}; bind a role instead so themes and rebrands reach it` });
      } else if (Object.keys(roles).length && !(r in roles) && !r.startsWith("--")) {
        push({ id: "component-token-unknown", severity: "warn", where: `${where}.tokens.${slot}`, message: `"${r}" isn't a role in this system` });
      }
    }
    const states = statesOf(c.states);
    const needed = c.kind === "input" ? [...INTERACTIVE_STATES, ...INPUT_STATES] : c.kind === "navigational" ? INTERACTIVE_STATES : [];
    const missing = needed.filter((st) => !states.includes(st));
    if (missing.length && c.status !== "deprecated") {
      push({ id: "component-states", severity: "warn", where, message: `a ${c.kind} component needs ${missing.join(", ")} (disabled says why; loading blocks a second submit; error says what and what next)` });
    }
    if (c.status === "deprecated" && !c.replaced_by) {
      push({ id: "component-deprecated-without-replacement", severity: "warn", where, message: "deprecated with no replaced_by" });
    }
  }

  // Look-alike components need a when-to-use (n:document-component-usage-rationale).
  const byKind = new Map<string, string[]>();
  for (const [id, c] of Object.entries(system.components ?? {})) {
    if (!c.kind) continue;
    byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), id]);
  }
  for (const [kind, ids] of byKind) {
    if (ids.length < 2) continue;
    const undocumented = ids.filter((cid) => !system.components?.[cid]?.when_to_use);
    if (undocumented.length) {
      push({ id: "component-when-to-use", severity: "warn", where: `components (${kind})`, message: `${undocumented.join(", ")} share kind "${kind}" with other components but say nothing about when to use them` });
    }
  }
  return out;
}
