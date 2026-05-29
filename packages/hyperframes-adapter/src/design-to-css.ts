/**
 * design-to-css — translate a DesignArtifact (parsed from DESIGN.md) into
 * `:root { --token: value; }` CSS variables that the Hyperframes index.html
 * + composition CSS can reference.
 *
 * Why CSS variables vs a precompiled stylesheet: CSS vars are the lingua
 * franca of Hyperframes templates (their catalog blocks consume them) and
 * they let the creator override one brand token in studio without
 * rebuilding everything. Recipe + technique bindings will also reference
 * these tokens by name, so emitting them at the document root keeps the
 * binding contract simple.
 *
 * Naming convention: each value gets a `--brand-` prefix to avoid colliding
 * with Hyperframes-internal vars or block-local vars. Palette entries are
 * named `--brand-palette-<role>` (e.g. `--brand-palette-paper`,
 * `--brand-palette-ink`); typography family names become
 * `--brand-font-<usage>` (e.g. `--brand-font-display`, `--brand-font-body`).
 *
 * v0 scope (this spike): just the palette + typography blocks; logo paths,
 * tone, descriptors etc are v1.0+ once the technique-library starts
 * consuming them.
 */

// The shape we accept is intentionally loose — we don't import the full
// DesignArtifact Zod type because the adapter package shouldn't pull the
// schema package's runtime in just for typing. The caller passes a parsed
// object; we read the fields we know about and skip the rest. The
// migration plan calls this out as a v1.0 typing tightening.
export interface DesignBrandSlice {
  palette?: Array<{ name?: string; hex?: string; role?: string }>;
  typography?: {
    families?: Array<{ name?: string; usage?: string }>;
  };
}

/**
 * Emit a single `<style>` block of `:root` CSS variables for a brand
 * slice. The output is HTML-embeddable directly into the Hyperframes
 * index.html's `<head>`. Empty input → empty stylesheet (still valid
 * HTML, no surprises).
 */
export function designToCss(design: DesignBrandSlice | null | undefined): string {
  const vars: string[] = [];

  // Palette — each color gets a role-prefixed var. Role takes precedence
  // over name because role is the semantic anchor (paper/ink/accent) that
  // techniques bind against; name is creator-facing display text.
  for (const swatch of design?.palette ?? []) {
    if (!swatch?.hex) continue;
    const role = swatch.role ?? swatch.name;
    if (!role) continue;
    const slug = slugify(role);
    vars.push(`  --brand-palette-${slug}: ${swatch.hex};`);
  }

  // Typography — first family per usage wins. Hyperframes consumes these
  // via `font-family: var(--brand-font-display);` in caption styles.
  for (const family of design?.typography?.families ?? []) {
    if (!family?.name || !family.usage) continue;
    const slug = slugify(family.usage);
    // Quote the font name in case it contains spaces ("DM Sans" etc).
    vars.push(`  --brand-font-${slug}: "${family.name}";`);
  }

  if (vars.length === 0) {
    return "<style>/* No brand tokens — DESIGN.md missing palette + typography */</style>";
  }

  return `<style>\n:root {\n${vars.join("\n")}\n}\n</style>`;
}

/**
 * Normalize a role/usage string to a CSS-var-safe slug. Lower-cases,
 * collapses non-alphanumeric runs to single hyphens, trims leading/trailing
 * hyphens. "Primary Heading" → "primary-heading".
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
