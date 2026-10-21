/**
 * HTML pages for a design system (#design-system):
 *   inventoryPage — "what you have": the extract, near-duplicates first,
 *                   because those are the decisions still to make.
 *   specimenPage  — the system itself: foundations, components in every
 *                   state and theme (rendered with the product's own CSS),
 *                   zones, content rules. Regenerated whenever the system
 *                   changes; the reference builds and reviews are held to.
 * Both are single static files with no external requests.
 */

import { dirname, relative } from "node:path";
import { foundationsOf, type ResolvedSystem, type Dict, type ComponentSpec } from "./design-system.js";
import type { Inventory, ValueEntry } from "./design-extract.js";
import { contrastPairs, contrastRatio, resolveRole, themesOf } from "./design-lint.js";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `
:root{--bg:#f7f7f5;--panel:#fff;--ink:#1b1c1e;--muted:#5d6066;--line:#e3e3df;--warn:#9a5b00;--warn-bg:#fff4e0;--ok:#1f6b3a;--ok-bg:#e6f4ea;--accent:#2b59c3;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141518;--panel:#1c1d21;--ink:#ececea;--muted:#a3a6ad;--line:#2e3036;--warn:#f0b35a;--warn-bg:#3a2a12;--ok:#7fd29a;--ok-bg:#163222;--accent:#8fb0ff;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141518;--panel:#1c1d21;--ink:#ececea;--muted:#a3a6ad;--line:#2e3036;--warn:#f0b35a;--warn-bg:#3a2a12;--ok:#7fd29a;--ok-bg:#163222;--accent:#8fb0ff;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1120px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;line-height:1.2;margin:0 0 4px}
h2{font-size:19px;margin:40px 0 12px;padding-top:16px;border-top:1px solid var(--line)}
h3{font-size:15px;margin:20px 0 8px}
p,li{max-width:72ch}
.meta{color:var(--muted);font-size:13px}
code,.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12.5px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
.swatch{height:56px;border-radius:6px;border:1px solid var(--line);margin-bottom:8px;background-image:linear-gradient(var(--c),var(--c)),conic-gradient(#ccc 25%,#fff 0 50%,#ccc 0 75%,#fff 0);background-size:auto,12px 12px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.badge{display:inline-block;font-size:11.5px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.badge.off{background:var(--warn-bg);color:var(--warn);border-color:transparent}
.badge.on{background:var(--ok-bg);color:var(--ok);border-color:transparent}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-top:20px}
.stat b{display:block;font-size:24px;font-variant-numeric:tabular-nums}
.stat span{color:var(--muted);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
.scroll{overflow-x:auto}
.bar{height:12px;background:var(--accent);border-radius:2px}
.where{color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.callout{background:var(--warn-bg);color:var(--ink);border-radius:8px;padding:12px 14px;margin:12px 0}
iframe{width:100%;border:1px solid var(--line);border-radius:6px;background:transparent;height:72px;display:block}
nav.toc{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px;margin-top:12px}
nav.toc a{color:var(--accent)}
.theme-toggle{position:fixed;top:12px;right:12px;font:inherit;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
`;

const TOGGLE = `<button class="theme-toggle" type="button" onclick="(function(r){var d=r.getAttribute('data-theme');var dark=d?d==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.setAttribute('data-theme',dark?'light':'dark')})(document.documentElement)">Theme</button>`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${TOGGLE}<main>${body}</main></body></html>\n`;
}

function badge(e: ValueEntry): string {
  if (e.onSystem === undefined) return "";
  return e.onSystem ? `<span class="badge on">in system</span>` : `<span class="badge off">off system</span>`;
}

function where(e: ValueEntry): string {
  return `<div class="where mono">${e.where.map(esc).join("<br>")}${e.count > e.where.length ? `<br>+${e.count - e.where.length} more` : ""}</div>`;
}

export function inventoryPage(inv: Inventory): string {
  const title = `${inv.name} — what you have`;
  const v = inv.values;
  const driftTotal = Object.values(inv.drift).reduce((n, x) => n + (x ?? 0), 0);
  const stat = (n: number, label: string): string => `<div class="card stat"><b>${n}</b><span>${esc(label)}</span></div>`;
  const parts: string[] = [];
  parts.push(`<h1>${esc(inv.name)}: what you have</h1>
<p class="meta">Extracted from ${inv.files} UI files${inv.product ? ` (product <code>${esc(inv.product)}</code>)` : ""} on ${esc(inv.generated.slice(0, 10))}. ${inv.hasSystem ? "Compared with the product's current design system." : "No design system yet: this is the starting point for one."}</p>
<div class="stats">${stat(v.color.length, "distinct colours")}${stat(v.font.length, "font families")}${stat(v["font-size"].length, "font sizes")}${stat(v.spacing.length, "spacing values")}${stat(v.radius.length, "radii")}${stat(inv.tokens.length, "tokens defined")}${stat(inv.nearDuplicates.length, "near-duplicate groups")}${inv.hasSystem ? stat(driftTotal, "off-system uses") : ""}</div>
<nav class="toc"><a href="#near">Near-duplicates</a><a href="#color">Colour</a><a href="#type">Type</a><a href="#space">Spacing</a><a href="#radius">Radius</a><a href="#effects">Shadow and motion</a><a href="#tokens">Tokens</a><a href="#components">Components</a><a href="#copy">Copy</a></nav>`);

  parts.push(`<h2 id="near">Near-duplicates: decisions the system hasn't made</h2>`);
  if (!inv.nearDuplicates.length) parts.push(`<p>None found.</p>`);
  else {
    parts.push(`<p>Each group is values close enough to read as the same thing. Usually one should win.</p><div class="grid">`);
    for (const g of inv.nearDuplicates) {
      const body =
        g.kind === "color"
          ? `<div class="row">${g.values.map((c) => `<div title="${esc(c)}" style="width:32px;height:32px;border-radius:6px;border:1px solid var(--line);background:${esc(c)}"></div>`).join("")}</div>`
          : "";
      parts.push(`<div class="card"><div class="meta">${esc(g.kind)} · ${g.count} uses</div>${body}<div class="mono">${g.values.map(esc).join(", ")}</div></div>`);
    }
    parts.push(`</div>`);
  }

  parts.push(`<h2 id="color">Colour</h2><div class="grid">`);
  for (const e of v.color.slice(0, 120)) {
    parts.push(`<div class="card"><div class="swatch" style="--c:${esc(e.value)}"></div><div class="mono">${esc(e.value)}</div><div class="row meta">${e.count} uses ${badge(e)}</div>${e.tokens.length ? `<div class="mono meta">${e.tokens.map(esc).join(" ")}</div>` : ""}${where(e)}</div>`);
  }
  parts.push(`</div>${v.color.length > 120 ? `<p class="meta">${v.color.length - 120} more not shown.</p>` : ""}`);

  parts.push(`<h2 id="type">Type</h2><h3>Families</h3><div class="scroll"><table><tr><th>Family</th><th>Uses</th><th></th><th>Where</th></tr>`);
  for (const e of v.font) parts.push(`<tr><td style="font-family:${esc(JSON.stringify(e.value))},system-ui">${esc(e.value)}</td><td>${e.count}</td><td>${badge(e)}</td><td>${where(e)}</td></tr>`);
  parts.push(`</table></div><h3>Sizes</h3><div class="scroll"><table><tr><th>Size</th><th>Sample</th><th>Uses</th><th></th></tr>`);
  for (const e of [...v["font-size"]].sort((a, b) => Number(a.value) - Number(b.value))) {
    parts.push(`<tr><td class="mono">${esc(e.value)}px</td><td style="font-size:${Number(e.value)}px;line-height:1.2">Ambient voice off</td><td>${e.count}</td><td>${badge(e)}</td></tr>`);
  }
  parts.push(`</table></div>`);

  parts.push(`<h2 id="space">Spacing</h2><div class="scroll"><table><tr><th>Value</th><th></th><th>Uses</th><th></th></tr>`);
  for (const e of [...v.spacing].sort((a, b) => Number(a.value) - Number(b.value)).slice(0, 60)) {
    parts.push(`<tr><td class="mono">${esc(e.value)}px</td><td style="width:50%"><div class="bar" style="width:${Math.min(Number(e.value), 400)}px;max-width:100%"></div></td><td>${e.count}</td><td>${badge(e)}</td></tr>`);
  }
  parts.push(`</table></div>`);

  parts.push(`<h2 id="radius">Radius</h2><div class="grid">`);
  for (const e of v.radius) parts.push(`<div class="card"><div style="height:48px;border:2px solid var(--accent);border-radius:${Math.min(Number(e.value), 24)}px;margin-bottom:8px"></div><div class="mono">${esc(e.value)}px</div><div class="row meta">${e.count} uses ${badge(e)}</div></div>`);
  parts.push(`</div>`);

  parts.push(`<h2 id="effects">Shadow and motion</h2><div class="scroll"><table><tr><th>Kind</th><th>Value</th><th>Uses</th><th></th></tr>`);
  for (const kind of ["shadow", "duration", "easing"] as const) {
    for (const e of v[kind]) parts.push(`<tr><td>${kind}</td><td class="mono">${esc(e.value)}${kind === "duration" ? "ms" : ""}</td><td>${e.count}</td><td>${badge(e)}</td></tr>`);
  }
  parts.push(`</table></div>`);

  parts.push(`<h2 id="tokens">Tokens (custom properties)</h2>`);
  if (inv.unusedTokens.length) parts.push(`<div class="callout"><b>${inv.unusedTokens.length} defined but never used:</b> <span class="mono">${inv.unusedTokens.slice(0, 40).map(esc).join(" ")}</span></div>`);
  if (inv.undefinedTokens.length) parts.push(`<div class="callout"><b>${inv.undefinedTokens.length} used but never defined here:</b> <span class="mono">${inv.undefinedTokens.slice(0, 40).map(esc).join(" ")}</span></div>`);
  parts.push(`<div class="scroll"><table><tr><th>Token</th><th>Value</th><th>Uses</th><th>Defined</th></tr>`);
  for (const t of inv.tokens.slice(0, 200)) parts.push(`<tr><td class="mono">${esc(t.name)}</td><td class="mono">${esc(t.value)}</td><td>${t.uses}</td><td class="where mono">${esc(t.where)}</td></tr>`);
  parts.push(`</table></div>`);

  parts.push(`<h2 id="components">Components and class families</h2>`);
  if (inv.components.length) {
    parts.push(`<h3>Named components</h3><div class="scroll"><table><tr><th>Name</th><th>Where</th></tr>`);
    for (const c of inv.components.slice(0, 200)) parts.push(`<tr><td class="mono">${esc(c.name)}</td><td class="where mono">${esc(c.where)}</td></tr>`);
    parts.push(`</table></div>`);
  }
  parts.push(`<h3>Class families</h3><p class="meta">Classes grouped by their first word. A family with many classes and few uses is often one component written several ways.</p><div class="scroll"><table><tr><th>Family</th><th>Classes</th><th>Uses</th><th>Members</th></tr>`);
  for (const f of inv.classFamilies.slice(0, 80)) parts.push(`<tr><td class="mono">${esc(f.family)}</td><td>${f.classes}</td><td>${f.uses}</td><td class="mono where">${f.members.map(esc).join(" ")}</td></tr>`);
  parts.push(`</table></div>`);

  parts.push(`<h2 id="copy">Copy</h2><p class="meta">${inv.copy.distinct} distinct user-visible strings. The vocabulary layer is decided from these.</p><div class="scroll"><table><tr><th>Text</th><th>Where</th></tr>`);
  for (const s of inv.copy.samples.slice(0, 120)) parts.push(`<tr><td>${esc(s.text)}</td><td class="where mono">${esc(s.where)}</td></tr>`);
  parts.push(`</table></div>`);
  return page(title, parts.join("\n"));
}

function entries(obj: unknown): [string, unknown][] {
  return obj && typeof obj === "object" && !Array.isArray(obj) ? Object.entries(obj as Dict) : [];
}

function flat(obj: unknown, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flat(v, key));
    else out.push([key, Array.isArray(v) ? v.join(", ") : String(v)]);
  }
  return out;
}

function list(items: unknown): string {
  return Array.isArray(items) && items.length ? items.map((x) => `<span class="badge">${esc(typeof x === "object" ? JSON.stringify(x) : x)}</span>`).join(" ") : `<span class="meta">none recorded</span>`;
}

/** One component example, rendered by specimen-frame.html with the product's own CSS. */
function exampleFrame(component: string, state: string, theme: string): string {
  const q = new URLSearchParams({ c: component, s: state, t: theme }).toString();
  return `<iframe loading="lazy" src="specimen-frame.html#${esc(q)}" title="${esc(`${component}, ${state}, ${theme}`)}"></iframe>`;
}

/**
 * The frame page: links the product's stylesheets the normal way (so fonts
 * and url() resolve), applies the theme's attributes to <html>, and renders
 * the example named in the URL hash.
 */
export function specimenFramePage(sys: ResolvedSystem, outFile: string): string {
  const s = sys.system;
  const outDir = dirname(outFile);
  const sheets = (s.specimen?.stylesheets ?? []).map((p) => relative(outDir, `${sys.root}/${p}`));
  const examples: Record<string, Record<string, string>> = {};
  for (const [id, c] of entries(s.components) as [string, ComponentSpec][]) if (c.examples) examples[id] = c.examples;
  const themes = s.specimen?.themes ?? {};
  const data = JSON.stringify({ examples, themes }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${sheets.map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join("")}<style>body{margin:0;padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;min-height:100vh;box-sizing:border-box}</style></head><body><script>
(function () {
  var d = ${data};
  var q = new URLSearchParams(location.hash.slice(1));
  var theme = d.themes[q.get("t")] || {};
  var attrs = (theme.html_attrs || "").match(/([\\w-]+)(?:=("[^"]*"|'[^']*'|\\S+))?/g) || [];
  attrs.forEach(function (a) {
    var i = a.indexOf("=");
    var name = i < 0 ? a : a.slice(0, i);
    var value = i < 0 ? "" : a.slice(i + 1).replace(/^["']|["']$/g, "");
    document.documentElement.setAttribute(name, value);
  });
  if (theme.background) document.body.style.background = theme.background;
  document.body.innerHTML = ((d.examples[q.get("c")] || {})[q.get("s")]) || "";
})();
</script></body></html>
`;
}

export function specimenPage(sys: ResolvedSystem, outFile: string): string {
  const s = sys.system;
  const f = foundationsOf(s);
  void outFile;
  const themes = entries(s.specimen?.themes).length ? (s.specimen!.themes as Record<string, { html_attrs?: string; background?: string }>) : { default: {} };
  const parts: string[] = [];
  parts.push(`<h1>${esc(sys.name)} design system</h1>
${s.read ? `<p>${esc(s.read)}</p>` : ""}
<p class="meta">Generated from ${sys.sources.map((p) => `<code>${esc(relative(sys.root, p))}</code>`).join(" + ")}. Regenerate with <code>atelier system specimen${sys.product ? ` --product ${esc(sys.product)}` : ""}</code>; edit the YAML, not this page.</p>
<nav class="toc"><a href="#foundations">Foundations</a><a href="#components">Components</a><a href="#zones">Zones</a><a href="#content">Content</a><a href="#rules">Rules</a></nav>`);

  parts.push(`<h2 id="foundations">Foundations</h2>`);
  const colors = flat(f.color);
  if (colors.length) {
    parts.push(`<h3>Colour</h3><div class="grid">`);
    for (const [k, val] of colors) parts.push(`<div class="card"><div class="swatch" style="--c:${esc(val)}"></div><b>${esc(k)}</b><div class="mono meta">${esc(val)}</div></div>`);
    parts.push(`</div>`);
  }
  const fonts = flat(f.font);
  if (fonts.length) {
    parts.push(`<h3>Type families</h3>`);
    for (const [k, val] of fonts) parts.push(`<div class="card" style="margin-bottom:8px"><div class="meta">${esc(k)} · <span class="mono">${esc(val)}</span></div><div style="font-family:${esc(val)},system-ui;font-size:22px">The control room for your source</div></div>`);
  }
  const type = (f.type ?? {}) as Dict;
  const sizes: number[] = Array.isArray(type.sizes)
    ? (type.sizes as unknown[]).map(Number)
    : type.base && type.scale
      ? [-1, 0, 1, 2, 3, 4].map((n) => Math.round(Number(type.base) * Number(type.scale) ** n))
      : entries(type.sizes).map(([, v]) => Number(String(v).replace("px", "")));
  if (sizes.filter(Boolean).length) {
    parts.push(`<h3>Type scale</h3><div class="scroll"><table>`);
    for (const px of sizes.filter(Boolean)) parts.push(`<tr><td class="mono" style="width:80px">${px}px</td><td style="font-size:${px}px;line-height:1.25">Voice off · edits ask first</td></tr>`);
    parts.push(`</table></div>`);
  }
  const space = flat(f.space);
  if (space.length) {
    parts.push(`<h3>Spacing</h3><div class="scroll"><table>`);
    for (const [k, val] of space) {
      for (const one of String(val).split(",").map((x) => x.trim())) {
        parts.push(`<tr><td class="mono" style="width:140px">${esc(k)} ${esc(one)}</td><td><div class="bar" style="width:${Math.min(parseFloat(one) || 0, 400)}px;max-width:100%"></div></td></tr>`);
      }
    }
    parts.push(`</table></div>`);
  }
  const other = (["radius", "shadow", "motion"] as const).flatMap((k) => flat(f[k]).map(([kk, vv]) => [k, kk, vv] as const));
  if (other.length) {
    parts.push(`<h3>Radius, shadow, motion</h3><div class="scroll"><table><tr><th>Group</th><th>Token</th><th>Value</th></tr>`);
    for (const [g, k, val] of other) parts.push(`<tr><td>${g}</td><td class="mono">${esc(k)}</td><td class="mono">${esc(val)}</td></tr>`);
    parts.push(`</table></div>`);
  }

  const roles = Object.keys(s.roles ?? {});
  if (roles.length) {
    const themeIds = themesOf(s);
    parts.push(`<h3>Roles</h3><p class="meta">Each job and the primitive it uses in each theme. Components bind roles, never primitives.</p><div class="scroll"><table><tr><th>Role</th>${themeIds.map((t) => `<th>${esc(t)}</th>`).join("")}</tr>`);
    for (const r of roles) {
      parts.push(`<tr><td class="mono">${esc(r)}</td>${themeIds
        .map((t) => {
          const v = resolveRole(s, r, t);
          const ref = typeof s.roles![r] === "string" ? s.roles![r] : (s.roles![r] as Record<string, string>)[t];
          return `<td><div class="row">${v && /^#|^rgb/i.test(v) ? `<span style="width:18px;height:18px;border-radius:4px;border:1px solid var(--line);background:${esc(v)}"></span>` : ""}<span class="mono">${esc(ref ?? "—")}</span></div></td>`;
        })
        .join("")}</tr>`);
    }
    parts.push(`</table></div>`);
    const pairs = contrastPairs(s);
    if (pairs.length) {
      parts.push(`<h3>Text on surface</h3><div class="scroll"><table><tr><th>Pair</th>${themeIds.map((t) => `<th>${esc(t)}</th>`).join("")}</tr>`);
      for (const [fg, bg] of pairs) {
        parts.push(`<tr><td class="mono">${esc(fg)} on ${esc(bg)}</td>${themeIds
          .map((t) => {
            const a = resolveRole(s, fg, t);
            const b = resolveRole(s, bg, t);
            const ratio = a && b ? contrastRatio(a, b) : null;
            if (ratio === null) return `<td class="meta">n/a</td>`;
            return `<td><div class="row"><span style="padding:2px 8px;border-radius:4px;background:${esc(b)};color:${esc(a)}">Aa</span><span class="badge ${ratio >= 4.5 ? "on" : "off"}">${ratio.toFixed(2)}:1</span></div></td>`;
          })
          .join("")}</tr>`);
      }
      parts.push(`</table></div>`);
    }
  }

  parts.push(`<h2 id="components">Components</h2>`);
  const comps = entries(s.components) as [string, ComponentSpec][];
  if (!comps.length) parts.push(`<p class="meta">No components recorded yet. Run <code>atelier design system</code> to define them from the inventory.</p>`);
  for (const [id, c] of comps) {
    parts.push(`<div class="card" style="margin-bottom:16px"><h3 style="margin-top:0">${esc(id)}${c.kind ? ` <span class="badge">${esc(c.kind)}</span>` : ""}${c.status === "deprecated" ? ` <span class="badge off">deprecated${c.replaced_by ? ` → ${esc(c.replaced_by)}` : ""}</span>` : ""}</h3>${c.role ? `<p>${esc(c.role)}</p>` : ""}${c.when_to_use ? `<p class="meta"><b>When to use:</b> ${esc(c.when_to_use)}</p>` : ""}
<div class="scroll"><table>
<tr><th style="width:110px">Anatomy</th><td>${list(c.anatomy)}</td></tr>
<tr><th>Variants</th><td>${entries(c.variants).length ? entries(c.variants).map(([k, v]) => `<div><b>${esc(k)}</b>: ${esc(typeof v === "object" ? JSON.stringify(v) : v)}</div>`).join("") : `<span class="meta">none recorded</span>`}</td></tr>
<tr><th>Sizes</th><td>${entries(c.sizes).length ? entries(c.sizes).map(([k, v]) => `<div><b>${esc(k)}</b>: <span class="mono">${esc(typeof v === "object" ? JSON.stringify(v) : v)}</span></div>`).join("") : `<span class="meta">none recorded</span>`}</td></tr>
<tr><th>States</th><td>${list(c.states)}</td></tr>
<tr><th>Tokens</th><td class="mono">${entries(c.tokens).map(([k, v]) => `${esc(k)} → ${esc(v)}`).join("<br>") || `<span class="meta">none recorded</span>`}</td></tr>
<tr><th>Source</th><td class="mono">${[c.source].flat().filter(Boolean).map(esc).join("<br>") || `<span class="meta">not linked</span>`}</td></tr>
</table></div>`);
    const ex = entries(c.examples) as [string, string][];
    if (ex.length) {
      for (const themeId of Object.keys(themes)) {
        parts.push(`<div class="meta" style="margin-top:12px">${esc(themeId)} theme</div><div class="grid">`);
        for (const [state] of ex) {
          parts.push(`<div><div class="meta">${esc(state)}</div>${exampleFrame(id, state, themeId)}</div>`);
        }
        parts.push(`</div>`);
      }
      const missing = (c.states ?? []).filter((st) => !ex.some(([k]) => k === st));
      if (missing.length) parts.push(`<div class="callout">No example for: ${missing.map(esc).join(", ")}. Every state needs one before the component counts as specified.</div>`);
    } else if (c.states?.length) {
      parts.push(`<div class="callout">No examples yet: add <code>examples: { state: markup }</code> so each state renders here.</div>`);
    }
    parts.push(`</div>`);
  }

  parts.push(`<h2 id="zones">Zones</h2>`);
  const zones = entries(s.zones) as [string, { surface?: string; holds?: string[]; never?: string[]; overflow?: string }][];
  if (!zones.length) parts.push(`<p class="meta">No zones recorded. Zones say what belongs where (header, toolbar, notices, settings) so new controls land in the right place.</p>`);
  else {
    parts.push(`<div class="scroll"><table><tr><th>Zone</th><th>Holds</th><th>Never</th><th>When it runs out of room</th></tr>`);
    for (const [id, z] of zones) parts.push(`<tr><td><b>${esc(id)}</b>${z.surface ? `<div class="meta">${esc(z.surface)}</div>` : ""}</td><td>${list(z.holds)}</td><td>${list(z.never)}</td><td>${esc(z.overflow ?? "")}</td></tr>`);
    parts.push(`</table></div>`);
  }

  parts.push(`<h2 id="content">Content</h2>`);
  const vocab = s.content?.vocabulary ?? {};
  const use = entries(vocab.use);
  const retired = entries(vocab.retired);
  if (use.length) {
    parts.push(`<h3>Say</h3><div class="scroll"><table>`);
    for (const [k, v] of use) parts.push(`<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`);
    parts.push(`</table></div>`);
  }
  if (retired.length) {
    parts.push(`<h3>Retired (checked by <code>atelier check</code>)</h3><div class="scroll"><table><tr><th>Don't say</th><th>Say</th></tr>`);
    for (const [k, v] of retired) parts.push(`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`);
    parts.push(`</table></div>`);
  }
  if (s.content?.voice?.length) parts.push(`<h3>Voice</h3><ul>${s.content.voice.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
  if (!use.length && !retired.length && !s.content?.voice?.length) parts.push(`<p class="meta">No content rules recorded.</p>`);

  parts.push(`<h2 id="rules">Rules, preserve, overrides</h2><div class="scroll"><table><tr><th>Rule</th><th>Check</th><th>Severity</th></tr>`);
  for (const r of s.rules ?? []) parts.push(`<tr><td>${esc(r.id)}</td><td class="mono">${esc(r.check ?? "review")}</td><td>${esc(r.severity ?? (r.check ? "default" : "agent"))}</td></tr>`);
  parts.push(`</table></div>`);
  if (s.preserve?.length) parts.push(`<h3>Preserve</h3><ul>${s.preserve.map((p) => `<li class="mono">${esc(JSON.stringify(p))}</li>`).join("")}</ul>`);
  if (s.overrides?.length) parts.push(`<h3>Tell overrides</h3><ul>${s.overrides.map((o) => `<li><code>${esc(o.tell)}</code> ${esc(o.scope ? `(${o.scope})` : "")}: ${esc(o.reason ?? "")}</li>`).join("")}</ul>`);
  parts.push(`<p class="meta">${(s.decisions ?? []).length} recorded decisions.</p>`);
  return page(`${sys.name} design system`, parts.join("\n"));
}
