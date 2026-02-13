import type { AtelierDocument, Layer, Delta } from "@atelier/types";
import { AtelierDocumentSchema } from "./document.js";
import { LayerSchema } from "./layer.js";
import { DeltaSchema } from "./delta.js";
import type { z } from "zod";

/** Validation result — either success with typed data or failure with readable errors */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

export interface ValidationError {
  path: string;
  message: string;
}

/** Format Zod errors into flat, AI-readable error messages */
function formatErrors(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/** Validate a complete AtelierDocument */
export function validateDocument(input: unknown): ValidationResult<AtelierDocument> {
  const result = AtelierDocumentSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as AtelierDocument };
  }
  return { success: false, errors: formatErrors(result.error) };
}

/** Validate a single Layer */
export function validateLayer(input: unknown): ValidationResult<Layer> {
  const result = LayerSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as Layer };
  }
  return { success: false, errors: formatErrors(result.error) };
}

/** Validate a single Delta */
export function validateDelta(input: unknown): ValidationResult<Delta> {
  const result = DeltaSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as Delta };
  }
  return { success: false, errors: formatErrors(result.error) };
}
