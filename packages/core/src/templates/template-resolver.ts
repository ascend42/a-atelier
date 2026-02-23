import type { AtelierDocument } from "@a-company/atelier-types";

export interface TemplateBindings {
  [variableName: string]: unknown;
}

export interface TemplateError {
  variable: string;
  message: string;
}

export type TemplateResult =
  | {
      success: true;
      document: AtelierDocument;
    }
  | {
      success: false;
      errors: TemplateError[];
    };

/**
 * Instantiate a template document by substituting variable values.
 * Walks the document tree, replacing {{variableName}} patterns with bound values.
 */
export function instantiateTemplate(
  template: AtelierDocument,
  bindings: TemplateBindings,
): TemplateResult {
  // 1. Validate all required variables have bindings
  const errors: TemplateError[] = [];
  const variables = template.variables ?? {};

  for (const [name, variable] of Object.entries(variables)) {
    if (bindings[name] === undefined && variable.default === undefined) {
      errors.push({ variable: name, message: `Required variable "${name}" not provided` });
    }
  }

  // Check for unknown bindings
  for (const name of Object.keys(bindings)) {
    if (!variables[name]) {
      errors.push({ variable: name, message: `Unknown variable "${name}"` });
    }
  }

  if (errors.length > 0) return { success: false, errors };

  // 2. Merge bindings with defaults
  const resolved: Record<string, unknown> = {};
  for (const [name, variable] of Object.entries(variables)) {
    resolved[name] = bindings[name] ?? variable.default;
  }

  // 3. Deep clone and substitute
  const doc = JSON.parse(JSON.stringify(template)) as AtelierDocument;
  substituteInObject(doc as unknown as Record<string, unknown>, resolved);

  // 4. Remove variables section (no longer a template)
  delete doc.variables;

  return { success: true, document: doc };
}

/**
 * Recursively substitute {{variableName}} patterns in string values.
 */
function substituteInObject(obj: Record<string, unknown>, bindings: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string") {
      obj[key] = substituteString(value, bindings);
    } else if (Array.isArray(value)) {
      substituteInArray(value, bindings);
    } else if (value !== null && typeof value === "object") {
      substituteInObject(value as Record<string, unknown>, bindings);
    }
  }
}

function substituteInArray(arr: unknown[], bindings: Record<string, unknown>): void {
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    if (typeof value === "string") {
      arr[i] = substituteString(value, bindings);
    } else if (Array.isArray(value)) {
      substituteInArray(value, bindings);
    } else if (value !== null && typeof value === "object") {
      substituteInObject(value as Record<string, unknown>, bindings);
    }
  }
}

/**
 * Replace {{variableName}} in a string with the bound value.
 * If the entire string is a single {{var}}, return the raw value (preserving type).
 * Otherwise, interpolate into the string.
 */
function substituteString(str: string, bindings: Record<string, unknown>): unknown {
  // Exact match: entire string is {{varName}} -> return raw value
  const exactMatch = str.match(/^\{\{(\w+)\}\}$/);
  if (exactMatch) {
    const name = exactMatch[1];
    return name in bindings ? bindings[name] : str;
  }

  // Partial match: replace all {{varName}} occurrences with string values
  return str.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    return name in bindings ? String(bindings[name]) : `{{${name}}}`;
  });
}

/**
 * List all variables used in a document (scan for {{variableName}} patterns).
 */
export function findTemplateVariables(doc: AtelierDocument): string[] {
  const vars = new Set<string>();
  scanForVariables(doc, vars);
  return Array.from(vars);
}

function scanForVariables(value: unknown, vars: Set<string>): void {
  if (typeof value === "string") {
    const matches = value.matchAll(/\{\{(\w+)\}\}/g);
    for (const match of matches) {
      vars.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) scanForVariables(item, vars);
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      scanForVariables(v, vars);
    }
  }
}
