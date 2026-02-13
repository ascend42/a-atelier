import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type { AtelierDocument } from "@atelier/types";
import { validateDocument } from "./validate.js";
import type { ValidationResult } from "./validate.js";

/**
 * Parse a YAML string into a validated AtelierDocument.
 * Returns validation errors if the YAML is invalid or doesn't match the schema.
 */
export function parseAtelier(yamlString: string): ValidationResult<AtelierDocument> {
  let parsed: unknown;
  try {
    parsed = yamlParse(yamlString);
  } catch (err) {
    return {
      success: false,
      errors: [{ path: "(yaml)", message: `YAML parse error: ${(err as Error).message}` }],
    };
  }
  return validateDocument(parsed);
}

/**
 * Serialize an AtelierDocument to YAML string.
 */
export function serializeAtelier(doc: AtelierDocument): string {
  return yamlStringify(doc, { indent: 2 });
}
