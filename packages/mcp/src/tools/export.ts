// @atelier/mcp — Export tools (SVG, Lottie)

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AtelierDocument } from "@atelier/types";
import { renderFrameSVG } from "@atelier/svg";
import { exportToLottie } from "@atelier/lottie";
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
  // ── atelier_export_svg ────────────────────────────────────
  server.tool(
    "atelier_export_svg",
    "Export a frame as an SVG string",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().optional().describe("State name (defaults to first state)"),
      frame: z.number().int().min(0).optional().describe("Frame number (defaults to 0)"),
      xmlDeclaration: z.boolean().optional().describe("Include XML declaration (default: false)"),
      viewBox: z.boolean().optional().describe("Include viewBox attribute (default: true)"),
      indent: z.number().int().min(0).optional().describe("Indent size in spaces (default: 2)"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id, stateName, frame, xmlDeclaration, viewBox, indent }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      const stateNames = Object.keys(doc.states);
      if (stateNames.length === 0) {
        return err("Document has no states");
      }

      const resolvedStateName = stateName ?? stateNames[0];
      if (!doc.states[resolvedStateName]) {
        return err(`State "${resolvedStateName}" not found`);
      }

      try {
        const svg = renderFrameSVG(doc, resolvedStateName, frame ?? 0, {
          xmlDeclaration,
          viewBox,
          indent,
        });
        return ok({ svg, stateName: resolvedStateName, frame: frame ?? 0 });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  // ── atelier_export_lottie ─────────────────────────────────
  server.tool(
    "atelier_export_lottie",
    "Export a document to Lottie JSON format (lossy, best-effort)",
    {
      id: z.string().describe("Document ID"),
      stateName: z.string().optional().describe("State to export (defaults to first state)"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ id, stateName }) => {
      const result = getDoc(store, id);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      try {
        const { json, warnings } = exportToLottie(doc, {
          state: stateName,
        });
        return ok({ lottie: json as unknown as Record<string, unknown>, warnings });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );
}
