// @atelier/mcp — Variable management tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@atelier/types";
import { findTemplateVariables } from "@atelier/core";
import type { DocumentStore } from "../store.js";

function getDoc(store: DocumentStore, id: string): { doc: AtelierDocument } | { error: string } {
  const doc = store.get(id);
  if (!doc) return { error: `Document "${id}" not found` };
  return { doc };
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_add_variable ──────────────────────────────────────
  server.tool(
    "atelier_add_variable",
    "Define a template variable on a document",
    {
      id: z.string().describe("Document ID"),
      variableName: z.string().describe("Variable name (used in {{variableName}} patterns)"),
      type: z.enum(["string", "number", "color", "asset", "boolean"]).describe("Variable type"),
      description: z.string().optional().describe("Human-readable description"),
      default: z.unknown().optional().describe("Default value"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const result = getDoc(store, args.id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.variables) doc.variables = {};
      if (doc.variables[args.variableName]) return err(`Variable "${args.variableName}" already exists`);

      doc.variables[args.variableName] = {
        type: args.type,
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.default !== undefined ? { default: args.default } : {}),
      };
      return ok({ variableName: args.variableName, type: args.type });
    },
  );

  // ── atelier_list_variables ────────────────────────────────────
  server.tool(
    "atelier_list_variables",
    "List all declared variables with usage info (which {{references}} exist in the document)",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const variables = doc.variables ?? {};
      const referenced = findTemplateVariables(doc);

      const entries = Object.entries(variables).map(([name, variable]) => ({
        name,
        type: variable.type,
        description: variable.description,
        default: variable.default,
        referenced: referenced.includes(name),
      }));

      const undeclared = referenced.filter(r => !variables[r]);

      return ok({ count: entries.length, variables: entries, undeclared });
    },
  );

  // ── atelier_remove_variable ───────────────────────────────────
  server.tool(
    "atelier_remove_variable",
    "Remove a declared variable. Warns if {{references}} still exist in the document.",
    {
      id: z.string().describe("Document ID"),
      variableName: z.string().describe("Variable name to remove"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ id, variableName }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (!doc.variables?.[variableName]) return err(`Variable "${variableName}" not found`);

      const warnings: string[] = [];
      const referenced = findTemplateVariables(doc);
      if (referenced.includes(variableName)) {
        warnings.push(`Variable "{{${variableName}}}" is still referenced in the document`);
      }

      delete doc.variables[variableName];
      if (Object.keys(doc.variables).length === 0) {
        doc.variables = undefined;
      }
      return ok({ variableName, warnings });
    },
  );
}
