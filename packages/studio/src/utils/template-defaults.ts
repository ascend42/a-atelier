import type { AtelierDocument } from "@a-company/atelier-types";
import { instantiateTemplate } from "@a-company/atelier-core";

/**
 * Return the document to draw for a possibly-templated doc.
 *
 * A template declares `variables` and references them from layers as
 * `{{name}}`. The source doc (what the YAML panel shows and what gets
 * saved) keeps those placeholders; the canvas and exporters draw the
 * doc with every variable bound to its default, so editing a default
 * re-themes the preview. Docs without variables, or templates that
 * cannot be resolved from defaults alone (a variable with no default),
 * are returned unchanged.
 */
export function withTemplateDefaults(doc: AtelierDocument): AtelierDocument {
  if (!doc.variables || Object.keys(doc.variables).length === 0) return doc;
  const result = instantiateTemplate(doc, {});
  return result.success ? result.document : doc;
}
