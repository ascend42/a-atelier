// @a-company/atelier-mcp — Template variable tools

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@a-company/atelier-types";
import { instantiateTemplate, findTemplateVariables } from "@a-company/atelier-core";
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
  // ── atelier_instantiate_template ──────────────────────────────
  server.tool(
    "atelier_instantiate_template",
    "Instantiate a template document with variable bindings. Creates a new document in the store.",
    {
      id: z.string().describe("Template document ID"),
      bindings: z.record(z.string(), z.unknown()).describe("Variable bindings: { variableName: value }"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ id, bindings }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const templateResult = instantiateTemplate(doc, bindings);

      if (!templateResult.success) {
        return err(`Template errors: ${templateResult.errors.map(e => `${e.variable}: ${e.message}`).join("; ")}`);
      }

      const newId = store.create(templateResult.document);
      return ok({
        id: newId,
        name: templateResult.document.name,
        message: "Template instantiated successfully",
      });
    },
  );

  // ── atelier_find_variables ────────────────────────────────────
  server.tool(
    "atelier_find_variables",
    "Scan a document for {{variableName}} patterns. Returns the list of variable references found.",
    {
      id: z.string().describe("Document ID"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const variables = findTemplateVariables(doc);
      const declared = doc.variables ? Object.keys(doc.variables) : [];

      return ok({
        variables,
        declared,
        undeclared: variables.filter(v => !declared.includes(v)),
        unused: declared.filter(d => !variables.includes(d)),
      });
    },
  );
}
