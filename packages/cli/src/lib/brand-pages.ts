/**
 * Brand pages (#brand-kit):
 *   boardPage  — one exploration round as a sheet: each option labelled
 *                A, B, C…, shown large, at 64/32/16 px, in one colour and on
 *                dark, so the creator judges it the way it will be used.
 *   brandSheet — the finished kit: the idea and its second read, the logo
 *                system from small media (short story) to large (long story),
 *                small sizes, one colour and reversed, colour, type, nouns,
 *                strategy and the rounds that led here.
 */

import { relative } from "node:path";
import { esc, page } from "./design-pages.js";
import { contrastRatio } from "./design-lint.js";
import type { Brand, BrandCheck } from "./brand.js";

const BRAND_STYLE = `<style>
.opt{display:flex;flex-direction:column;gap:10px}
.opt .big{aspect-ratio:1;display:grid;place-items:center;background:#fff;border:1px solid var(--line);border-radius:8px;padding:12%}
.opt .big img{max-width:100%;max-height:100%}
.sizes{display:flex;align-items:end;gap:12px;flex-wrap:wrap}
.chip{display:grid;place-items:center;border-radius:6px;border:1px solid var(--line);padding:6px}
.chip.light{background:#fff}.chip.dark{background:#111}.chip.dark img{filter:brightness(0) invert(1)}
.mono img{filter:grayscale(1) contrast(1.4)}
.label{font-size:20px;font-weight:700}
.chart{display:grid;grid-template-columns:auto 1fr auto;gap:0 16px;align-items:stretch}
.axis{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font-size:12px;color:var(--muted);border-left:2px solid var(--line);padding:0 4px}
.lockups{display:flex;flex-direction:column;gap:0}
.lockup{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
.lockup .art{background:#fff;border-radius:8px;padding:16px;display:grid;place-items:center;min-height:96px}
.lockup .art img{max-height:120px;max-width:100%}
</style>`;

function sizeRow(src: string, alt: string): string {
  return `<div class="sizes">${[64, 32, 16]
    .map((px) => `<div class="chip light"><img src="${esc(src)}" alt="${esc(alt)} at ${px}px" style="height:${px}px;width:auto"></div>`)
    .join("")}<div class="chip dark"><img src="${esc(src)}" alt="${esc(alt)} reversed on dark" style="height:32px;width:auto"></div><div class="chip light mono"><img src="${esc(src)}" alt="${esc(alt)} in one colour" style="height:32px;width:auto"></div></div>`;
}

/** A round of options. `files` are paths relative to the page; labels default to A, B, C… */
export function boardPage(title: string, files: string[], notes: Record<string, string> = {}): string {
  const label = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : `A${String.fromCharCode(65 + i - 26)}`);
  const cards = files
    .map((f, i) => {
      const l = label(i);
      return `<div class="card opt"><div class="row"><span class="label">${l}</span><span class="meta mono-name">${esc(f.split("/").pop())}</span></div><div class="big"><img src="${esc(f)}" alt="Option ${l}"></div>${sizeRow(f, `Option ${l}`)}${notes[l] ? `<div class="meta">${esc(notes[l])}</div>` : ""}</div>`;
    })
    .join("");
  return page(
    title,
    `${BRAND_STYLE}<h1>${esc(title)}</h1><p class="meta">${files.length} options. Each is shown large, at 64, 32 and 16 px, on dark and in one colour, because a mark has to hold up where it will really be used. Reply with the letters you want developed, and any notes.</p><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-top:20px">${cards}</div>`,
  );
}

const noun = (n: string | { noun: string; why?: string }): string => (typeof n === "string" ? n : `${n.noun}${n.why ? ` (${n.why})` : ""}`);

/** The brand sheet. `dir` is the brand folder; image paths are made relative to `outFile`. */
export function brandSheet(brand: Brand, dir: string, outFile: string, checks: BrandCheck[] = []): string {
  const rel = (f: string): string => relative(outFile.replace(/[^/]+$/, ""), `${dir}/${f}`) || f;
  const name = brand.name ?? "Brand";
  const parts: string[] = [BRAND_STYLE];
  const markFile = brand.mark?.file ?? brand.system?.[0]?.file;
  parts.push(`<h1>${esc(name)}</h1>`);
  if (brand.mark?.idea) parts.push(`<p>${esc(brand.mark.idea)}</p>`);
  if (brand.mark?.second_read) parts.push(`<p class="meta"><b>Second read:</b> ${esc(brand.mark.second_read)}</p>`);
  parts.push(`<p class="meta">Generated from <code>brand.yaml</code>. Regenerate with <code>atelier brand sheet</code>; edit the YAML and the files in <code>marks/</code>, not this page.</p>`);
  parts.push(`<nav class="toc"><a href="#mark">Mark</a><a href="#system">System</a><a href="#color">Colour</a><a href="#type">Type</a><a href="#strategy">Strategy</a><a href="#rounds">Rounds</a></nav>`);

  if (checks.length) {
    parts.push(`<div class="callout"><b>${checks.length} open check${checks.length === 1 ? "" : "s"} (atelier brand check):</b><ul>${checks.map((c) => `<li><code>${esc(c.id)}</code> ${esc(c.message)}</li>`).join("")}</ul></div>`);
  }

  if (markFile) {
    parts.push(`<h2 id="mark">Mark</h2><div class="grid" style="grid-template-columns:minmax(220px,320px) 1fr;align-items:start"><div class="opt"><div class="big"><img src="${esc(rel(markFile))}" alt="${esc(name)} mark"></div></div><div>${sizeRow(rel(markFile), `${name} mark`)}<p class="meta">Large, then 64, 32 and 16 px; on dark; in one colour.</p></div></div>`);
  }

  const system = brand.system ?? [];
  if (system.length) {
    parts.push(`<h2 id="system">Logo system</h2><p class="meta">Small media tell a short story; large media a long one (n:logo-system-by-media-size).</p><div class="chart"><div class="axis">small media → large media</div><div class="lockups">`);
    for (const l of system) {
      parts.push(`<div class="lockup"><div><b>${esc(l.id)}</b><div class="meta">${esc(l.use ?? "")}</div>${l.min_px ? `<div class="meta">min ${l.min_px}px</div>` : ""}</div><div class="art"><img src="${esc(rel(l.file))}" alt="${esc(name)} ${esc(l.id)}"></div></div>`);
    }
    parts.push(`</div><div class="axis">short story → long story</div></div>`);
    if (brand.clearspace) parts.push(`<p><b>Clear space:</b> ${esc(brand.clearspace)}</p>`);
    if (brand.misuse?.length) parts.push(`<h3>Don't</h3><ul>${brand.misuse.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`);
  }

  const color = Object.entries(brand.color ?? {});
  if (color.length) {
    const ground = brand.color?.paper ?? brand.color?.background;
    parts.push(`<h2 id="color">Colour</h2><div class="grid">`);
    for (const [k, v] of color) {
      const r = ground && v !== ground ? contrastRatio(v, ground) : null;
      parts.push(`<div class="card"><div class="swatch" style="--c:${esc(v)}"></div><b>${esc(k)}</b><div class="mono meta">${esc(v)}</div>${r !== null ? `<div class="meta">${r.toFixed(2)}:1 on paper</div>` : ""}</div>`);
    }
    parts.push(`</div>`);
  }

  const type = Object.entries(brand.type ?? {});
  if (type.length) {
    // A value may carry notes after the family ("Fraunces (wght 420); outlined"); the family is the part before them.
    const family = (v: string): string => v.split(/[(;,]/)[0].trim();
    const families = [...new Set(type.map(([, v]) => family(v)).filter(Boolean))];
    parts.push(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&")}&display=swap">`);
    parts.push(`<h2 id="type">Type</h2>`);
    for (const [k, v] of type) parts.push(`<div class="card" style="margin-bottom:8px"><div class="meta">${esc(k)} · <span class="mono">${esc(v)}</span></div><div style="font-family:${esc(JSON.stringify(family(v)))},system-ui;font-size:24px">${esc(name)}, made by hand</div></div>`);
  }

  parts.push(`<h2 id="strategy">Strategy</h2>`);
  if (brand.strategy?.truths?.length) parts.push(`<h3>What sets it apart</h3><ul>${brand.strategy.truths.map((t) => `<li>${esc(t.truth)}${t.evidence ? ` <span class="meta">(${esc(t.evidence)})</span>` : ""}</li>`).join("")}</ul>`);
  if (brand.strategy?.audience) parts.push(`<p><b>For:</b> ${esc(brand.strategy.audience)}</p>`);
  if (brand.strategy?.personality?.length || brand.voice?.adjectives?.length) {
    parts.push(`<p><b>Personality:</b> ${[...(brand.strategy?.personality ?? []), ...(brand.voice?.adjectives ?? [])].map((a) => `<span class="badge">${esc(a)}</span>`).join(" ")}</p>`);
  }
  if (brand.nouns?.kept?.length) parts.push(`<h3>Noun list</h3><p>${brand.nouns.kept.map((n) => `<span class="badge on">${esc(noun(n))}</span>`).join(" ")}</p>`);
  if (brand.nouns?.struck?.length) parts.push(`<p class="meta">Struck: ${brand.nouns.struck.map((n) => `<s>${esc(noun(n))}</s>`).join(", ")}</p>`);
  if (brand.equity?.length) parts.push(`<h3>Equity kept</h3><ul>${brand.equity.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`);

  parts.push(`<h2 id="rounds">Rounds</h2>`);
  if (!brand.rounds?.length) parts.push(`<p class="meta">No rounds recorded.</p>`);
  else {
    parts.push(`<div class="scroll"><table><tr><th>Round</th><th>Method</th><th>Shown</th><th>Picked</th><th>Misreadings</th></tr>`);
    for (const r of brand.rounds) {
      const mis = Object.entries(r.misreadings ?? {}).map(([k, v]) => `${esc(k)}: ${v.map(esc).join(", ")}`).join("<br>");
      parts.push(`<tr><td>${r.round}</td><td>${esc(r.method ?? "")}</td><td>${(r.shown ?? []).map(esc).join(" ")}</td><td>${(r.picked ?? []).map(esc).join(" ")}</td><td class="meta">${mis}</td></tr>`);
    }
    parts.push(`</table></div>`);
  }
  return page(`${name} brand`, parts.join("\n"));
}
