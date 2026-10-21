/**
 * `atelier check` — enforce the mechanical part of a design system (#design-system).
 *
 * Runs, per file, against the system that governs it:
 *   - the system's `rules` that name a known `check` id;
 *   - retired words from `content.vocabulary.retired` in user-visible copy;
 *   - the mechanical tells (literal, pattern, and the two token counts),
 *     minus the tells the system overrides.
 * Judgement rules and review tells stay with Mika's review. A finding at
 * severity `fail` makes the command exit 1.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { foundationsOf, systemForFile, uiFilesFor, type ResolvedSystem, type RuleSpec, type Dict } from "./design-system.js";
import { scanText, normColor, primaryFamily, type ValueKind } from "./design-scan.js";
import { allowedValues, isOnSystem } from "./design-extract.js";

export interface Finding {
  id: string;
  source: "rule" | "tell" | "content";
  severity: "warn" | "fail";
  file: string;
  line: number;
  message: string;
  product: string | null;
}

/** Check ids `rules[].check` may name. */
export const CHECK_IDS = [
  "color-literal-forbidden",
  "color-off-palette",
  "font-forbidden",
  "font-off-system",
  "type-off-scale",
  "spacing-off-scale",
  "radius-off-scale",
  "easing-forbidden",
  "retired-term",
] as const;

interface Tell {
  id: string;
  severity?: "warn" | "fail";
  detect?: { kind: string; values?: string[]; target?: string; regex?: string; flags?: string; where?: string; what?: string };
}

/** The tells catalog: the installed skill's copy, else the one bundled with the CLI. */
export function loadTells(templatesRoot?: string): Tell[] {
  const candidates = [
    join(homedir(), ".claude", "skills", "atelier-design", "reference", "tells.yaml"),
    ...(templatesRoot ? [join(templatesRoot, "skills", "atelier-design", "reference", "tells.yaml")] : []),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const parsed = parseYaml(readFileSync(file, "utf8")) as { tells?: Tell[] } | null;
    if (parsed?.tells) return parsed.tells;
  }
  return [];
}

const OFF_SYSTEM: Record<string, ValueKind> = {
  "color-off-palette": "color",
  "font-off-system": "font",
  "type-off-scale": "font-size",
  "spacing-off-scale": "spacing",
  "radius-off-scale": "radius",
};

const FORBIDDEN: Record<string, ValueKind> = {
  "color-literal-forbidden": "color",
  "font-forbidden": "font",
  "easing-forbidden": "easing",
};

function norm(kind: ValueKind, v: string): string {
  if (kind === "color") return normColor(v);
  if (kind === "font") return (primaryFamily(v) ?? v).toLowerCase();
  if (kind === "easing") return v.replace(/\s+/g, "");
  return v;
}

/** Check one file's text against one system. Exported for tests. */
export function checkText(text: string, file: string, sys: ResolvedSystem, tells: Tell[] = []): Finding[] {
  const out: Finding[] = [];
  const where = relative(sys.root, file) || file;
  const scan = scanText(text, file);
  const allowed = allowedValues(foundationsOf(sys.system));
  const push = (f: Omit<Finding, "file" | "product">): void => {
    out.push({ ...f, file: where, product: sys.product });
  };

  const rules: RuleSpec[] = (sys.system.rules ?? []).filter((r) => r && r.check);
  for (const rule of rules) {
    const offKind = OFF_SYSTEM[rule.check!];
    if (offKind) {
      if (!allowed[offKind]) continue;
      for (const o of scan.occurrences) {
        if (o.kind !== offKind || o.definition) continue;
        if (isOnSystem(offKind, o.value, allowed) === false) {
          push({ id: rule.id, source: "rule", severity: rule.severity ?? "warn", line: o.line, message: `${o.raw} is not in the system's ${offKind} values` });
        }
      }
      continue;
    }
    const forbiddenKind = FORBIDDEN[rule.check!];
    if (forbiddenKind) {
      const values = new Set(((rule.args?.values as string[]) ?? []).map((v) => norm(forbiddenKind, v)));
      for (const o of scan.occurrences) {
        if (o.kind === forbiddenKind && values.has(norm(forbiddenKind, o.value))) {
          push({ id: rule.id, source: "rule", severity: rule.severity ?? "fail", line: o.line, message: `${o.raw} is forbidden here` });
        }
      }
    }
  }

  const retired = sys.system.content?.vocabulary?.retired ?? {};
  for (const [term, replacement] of Object.entries(retired)) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    for (const s of scan.strings) {
      if (re.test(s.text)) {
        push({ id: "retired-term", source: "content", severity: "fail", line: s.line, message: `"${term}" is retired; say "${replacement}" ("${s.text.slice(0, 60)}")` });
      }
    }
  }

  const overridden = new Set((sys.system.overrides ?? []).map((o) => o.tell));
  const severityOf = (t: Tell): "warn" | "fail" => (sys.system.tells?.severity?.[t.id] as "warn" | "fail") ?? t.severity ?? "warn";
  const lines = text.split("\n");
  for (const tell of tells) {
    if (overridden.has(tell.id) || !tell.detect) continue;
    const d = tell.detect;
    if (d.kind === "literal" && d.values) {
      const kind: ValueKind | null = d.target?.startsWith("font") ? "font" : null;
      if (kind) {
        const values = new Set(d.values.map((v) => v.toLowerCase()));
        for (const o of scan.occurrences) {
          if (o.kind === "font" && values.has(o.value.toLowerCase())) push({ id: tell.id, source: "tell", severity: severityOf(tell), line: o.line, message: `${o.value} (tell: ${tell.id})` });
        }
      } else {
        const values = new Set(d.values.map(normColor));
        for (const o of scan.occurrences) {
          if (o.kind === "color" && !o.definition && values.has(o.value)) push({ id: tell.id, source: "tell", severity: severityOf(tell), line: o.line, message: `${o.raw} (tell: ${tell.id})` });
        }
      }
    } else if (d.kind === "pattern" && d.regex) {
      let re: RegExp;
      try {
        re = new RegExp(d.regex, d.flags ?? "");
      } catch {
        continue;
      }
      if (d.where === "user-visible strings") {
        for (const s of scan.strings) if (re.test(s.text)) push({ id: tell.id, source: "tell", severity: severityOf(tell), line: s.line, message: `"${s.text.slice(0, 60)}" (tell: ${tell.id})` });
      } else {
        lines.forEach((l, i) => {
          if (re.test(l)) push({ id: tell.id, source: "tell", severity: severityOf(tell), line: i + 1, message: `${l.trim().slice(0, 80)} (tell: ${tell.id})` });
        });
      }
    } else if (d.kind === "count" && (tell.id === "accent-drift" || tell.id === "radius-drift")) {
      const kind: ValueKind = tell.id === "accent-drift" ? "color" : "radius";
      if (!allowed[kind]) continue;
      // Already reported by an explicit off-system rule: don't say it twice.
      if (rules.some((r) => OFF_SYSTEM[r.check!] === kind)) continue;
      for (const o of scan.occurrences) {
        if (o.kind === kind && !o.definition && isOnSystem(kind, o.value, allowed) === false) {
          push({ id: tell.id, source: "tell", severity: severityOf(tell), line: o.line, message: `${o.raw} is outside the system's ${kind} tokens (tell: ${tell.id})` });
        }
      }
    }
  }
  return out;
}

export interface CheckOptions {
  /** Check only these files (each against the system that governs it). */
  files?: string[];
  tells?: Tell[];
}

/** Check a set of systems (all files they govern) or an explicit file list. */
export function check(systems: ResolvedSystem[], opts: CheckOptions = {}): { findings: Finding[]; files: number } {
  const tells = opts.tells ?? [];
  const findings: Finding[] = [];
  let files = 0;
  if (opts.files) {
    for (const f of opts.files) {
      const sys = systemForFile(f);
      if (!sys || !existsSync(f)) continue;
      files++;
      findings.push(...checkText(readFileSync(f, "utf8"), f, sys, tells));
    }
    return { findings, files };
  }
  for (const sys of systems) {
    for (const f of uiFilesFor(sys)) {
      files++;
      findings.push(...checkText(readFileSync(f, "utf8"), f, sys, tells));
    }
  }
  return { findings, files };
}

export type { Dict };
