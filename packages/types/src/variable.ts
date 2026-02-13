export type VariableType = "string" | "number" | "color" | "asset" | "boolean";

/** A template variable slot */
export interface Variable {
  type: VariableType;
  default?: unknown;
  description?: string;
}
