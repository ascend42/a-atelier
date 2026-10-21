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

/** Theme ids: `themes:` if declared, else the specimen's themes, else one implicit theme. */
export function themesOf(system: DesignSystem): string[] {
  const declared = system.themes;
  if (Array.isArray(declared) && declared.length) return declared.map(String);
  const spec = Object.keys(system.specimen?.themes ?? {});
  return spec.length ? spec : ["default"];
}

type RoleValue = string | Record<string, string>;

/** A role's value in one theme: the raw reference (not yet resolved). */
export function roleRef(value: RoleValue, theme: string): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value[theme];
  return undefined;
}

/** Resolve a role in a theme to a concrete value, following primitive refs (and role refs, which lint flags). */
export function resolveRole(system: DesignSystem, role: string, theme: string, seen = new Set<string>()): string | undefined {
  const roles = (system.roles ?? {}) as Record<string, RoleValue>;
  const prims = primitives(system);
  const ref = roleRef(roles[role], theme);
  if (ref === undefined) return undefined;
  if (prims.has(ref)) return prims.get(ref);
  if (ref in roles && !seen.has(ref)) return resolveRole(system, ref, theme, new Set([...seen, role]));
  return ref;
}

/** WCAG 2.x relative luminance of #rrggbb. */
export function luminance(hex: string): number | null {
  const rgb = rgbOf(normColor(hex));
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, or null when either colour isn't sRGB hex/rgb. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text-on-surface pairs to check: `contrast_pairs` if given, else every text.* role on every surface.* / bg.* role. */
export function contrastPairs(system: DesignSystem): [string, string][] {
  const explicit = system.contrast_pairs;
  if (Array.isArray(explicit) && explicit.length) return explicit.filter((p) => Array.isArray(p) && p.length === 2) as [string, string][];
  const names = Object.keys(system.roles ?? {});
  const text = names.filter((n) => /^(text|fg|foreground|on)\b|^text[.\-_]/.test(n) && !/disabled|placeholder/.test(n));
  const surface = names.filter((n) => /^(surface|bg|background)\b|^surface[.\-_]/.test(n));
  return text.flatMap((t) => surface.map((s) => [t, s] as [string, string]));
}

export function lintSystem(system: DesignSystem): LintFinding[] {
  const out: LintFinding[] = [];
  const push = (f: LintFinding): void => {
    out.push(f);
  };
  const prims = primitives(system);
  const roles: Record<string, RoleValue> = system.roles ?? {};
  const themes = themesOf(system);

  // Roles: named by job, defined in every theme, one hop to a primitive.
  for (const [role, value] of Object.entries(roles)) {
    if (LOOK_WORDS.test(role)) {
      push({ id: "role-named-by-look", severity: "warn", where: `roles.${role}`, message: `"${role}" names a look, not a job; name it for what it does (text.secondary, surface.raised, status.error)` });
    }
    if (value && typeof value === "object") {
      const missing = themes.filter((t) => !(t in value));
      if (missing.length && themes[0] !== "default") {
        push({ id: "role-missing-theme", severity: "fail", where: `roles.${role}`, message: `no value for theme ${missing.join(", ")}` });
      }
    }
    for (const theme of themes) {
      const ref = roleRef(value, theme);
      if (ref === undefined) continue;
      if (ref in roles) {
        // Chains are allowed (W3C DTCG 2025.10 §7.2.2); loops and deep chains are not.
        const chain = [role];
        let cur: string | undefined = ref;
        while (cur !== undefined && cur in roles && !chain.includes(cur)) {
          chain.push(cur);
          cur = roleRef(roles[cur], theme);
        }
        const where = `roles.${role}${themes.length > 1 ? ` (${theme})` : ""}`;
        if (cur !== undefined && chain.includes(cur)) {
          push({ id: "role-circular", severity: "fail", where, message: `references loop: ${[...chain, cur].join(" → ")}` });
        } else if (cur !== undefined && !prims.has(cur) && /^[a-z][\w-]*(\.[\w-]+)+$/i.test(cur)) {
          push({ id: "role-unresolved", severity: "fail", where, message: `${chain.join(" → ")} ends at "${cur}", which isn't a role or a primitive` });
        } else if (chain.length > 3) {
          push({ id: "role-chain-deep", severity: "warn", where, message: `${chain.length} hops (${chain.join(" → ")}); keep chains short so a change is easy to trace` });
        }
      } else if (!prims.has(ref)) {
        if (/^[a-z][\w-]*(\.[\w-]+)+$/i.test(ref)) {
          push({ id: "role-unresolved", severity: "fail", where: `roles.${role}`, message: `"${ref}" isn't a role or a primitive` });
        } else {
          push({ id: "role-literal", severity: "warn", where: `roles.${role}`, message: `"${ref}" is a raw value; add it to foundations and point the role at it` });
        }
      }
    }
  }

  // Text on surface, per theme.
  for (const [text, surface] of contrastPairs(system)) {
    for (const theme of themes) {
      const fg = resolveRole(system, text, theme);
      const bg = resolveRole(system, surface, theme);
      if (!fg || !bg) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio !== null && ratio < 4.5) {
        push({
          id: "role-contrast",
          severity: "fail",
          where: `${text} on ${surface}${themes.length > 1 ? ` (${theme})` : ""}`,
          message: `${ratio.toFixed(2)}:1 is under 4.5:1 for text (WCAG 1.4.3)`,
        });
      }
    }
  }

  // Spacing on the base unit.
  const space = (foundationsOf(system).space ?? {}) as Dict;
  const base = Number(space.base);
  if (base > 0 && Array.isArray(space.scale)) {
    const off = (space.scale as unknown[]).map(Number).filter((v) => v > 2 && v % base !== 0);
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
    const states = (c.states ?? []).map((s) => s.toLowerCase());
    const needed = c.kind === "input" ? [...INTERACTIVE_STATES, ...INPUT_STATES] : c.kind === "navigational" ? INTERACTIVE_STATES : [];
    const missing = needed.filter((s) => !states.includes(s));
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
    const undocumented = ids.filter((id) => !system.components?.[id]?.when_to_use);
    if (undocumented.length) {
      push({ id: "component-when-to-use", severity: "warn", where: `components (${kind})`, message: `${undocumented.join(", ")} share kind "${kind}" with other components but say nothing about when to use them` });
    }
  }
  return out;
}
