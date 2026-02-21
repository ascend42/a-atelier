import { z } from "zod";

export const TriggerTypeSchema = z.enum([
  "click", "hover", "pointerdown", "pointerup", "timer", "signal",
]);

export const TriggerSchema = z.object({
  type: TriggerTypeSchema,
  delay: z.number().nonnegative("Timer delay must be non-negative").optional(),
  signal: z.string().optional(),
}).refine(
  (t) => t.type !== "timer" || t.delay !== undefined,
  { message: "Timer trigger requires a delay" },
).refine(
  (t) => t.type !== "signal" || t.signal !== undefined,
  { message: "Signal trigger requires a signal name" },
);

export const ActionTypeSchema = z.enum([
  "go-to-state", "emit-signal", "set-variable", "toggle-visibility",
]);

export const ActionSchema = z.object({
  type: ActionTypeSchema,
  state: z.string().optional(),
  signal: z.string().optional(),
  variable: z.string().optional(),
  value: z.unknown().optional(),
  targetLayer: z.string().optional(),
}).refine(
  (a) => a.type !== "go-to-state" || a.state !== undefined,
  { message: "go-to-state action requires a state name" },
).refine(
  (a) => a.type !== "emit-signal" || a.signal !== undefined,
  { message: "emit-signal action requires a signal name" },
).refine(
  (a) => a.type !== "set-variable" || (a.variable !== undefined && a.value !== undefined),
  { message: "set-variable action requires variable and value" },
);

export const InteractionSchema = z.object({
  id: z.string().min(1, "Interaction id is required"),
  trigger: TriggerSchema,
  action: ActionSchema,
  description: z.string().optional(),
});
