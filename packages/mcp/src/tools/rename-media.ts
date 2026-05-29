// #mcp-rename-media-tool — MCP wrapper around `renameMedia` for the atomic
// media-file rename cascade. Slice C of the v1.0 creator-flow batch.
//
// The wrapper:
//   1. Validates the old/new basenames defensively before the core call
//      (path traversal, leading-dot, control chars). The underlying
//      `renameMedia` does NOT validate — it joins straight into media/ —
//      so this is the single line of defense for MCP callers.
//   2. Invokes the cascade. On success (and !dryRun) reloads the project
//      document into the supplied DocumentStore so subsequent tool calls
//      see the post-rename doc state.
//   3. Wraps any thrown error into the standard MCP `{ error }` envelope.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DocumentStore } from "../store.js";
import {
  renameMedia,
  isValidMediaBasenameForRename,
} from "../lib/rename-media.js";
import { parseAtelier } from "@a-company/atelier-schema";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export function register(server: McpServer, store: DocumentStore): void {
  // ── v1.0 rename-media tool ──────
  server.tool(
    "atelier_rename_media",
    "Rename a media file in a project, cascading the rename through transcripts and the project document. Atomic with rollback on partial failure.",
    {
      documentId: z.string().describe("Document ID"),
      projectDir: z.string().describe("Absolute project directory path"),
      oldBasename: z.string().describe("Current basename inside media/, e.g. 'IMG_7346.MOV'"),
      newBasename: z.string().describe("New basename inside media/"),
      dryRun: z.boolean().optional().describe("If true, compute the result without writing"),
      workspaceDir: z.string().optional().describe("Workspace root for security scoping (defaults to process.cwd())"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ documentId, projectDir, oldBasename, newBasename, dryRun, workspaceDir }) => {
      try {
        // ── path-traversal defense ──────
        // `renameMedia` joins straight into <projectDir>/media/<basename>,
        // so a crafted `../../etc/passwd` would otherwise escape the media
        // dir. Reject any separator / leading-dot / control char up front.
        if (!isValidMediaBasenameForRename(oldBasename)) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "invalid oldBasename" }) }],
            isError: true as const,
          };
        }
        if (!isValidMediaBasenameForRename(newBasename)) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "invalid newBasename" }) }],
            isError: true as const,
          };
        }

        // ── workspace scoping (Aegis Finding 1, TD-2026-05-27) ──────
        // The MCP tool previously accepted an unconstrained `projectDir`.
        // Bound the rename to the workspace root: by default `process.cwd()`
        // (the MCP server is launched from the workspace), or an explicit
        // `workspaceDir` argument. Reject any projectDir that resolves
        // outside that root.
        const workspaceRoot = resolve(workspaceDir ?? process.cwd());
        const resolvedProject = resolve(projectDir);
        if (
          resolvedProject !== workspaceRoot &&
          !resolvedProject.startsWith(workspaceRoot + sep)
        ) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `projectDir must be inside workspace ${workspaceRoot}` }) }],
            isError: true as const,
          };
        }
        if (!existsSync(join(resolvedProject, "project.atelier"))) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "projectDir does not contain project.atelier" }) }],
            isError: true as const,
          };
        }

        const result = await renameMedia({
          projectDir: resolvedProject,
          oldBasename,
          newBasename,
          ...(dryRun !== undefined ? { dryRun } : {}),
        });

        // Reload the doc into the store unless this was a dryRun.
        if (!dryRun) {
          const docPath = join(resolvedProject, "project.atelier");
          const raw = readFileSync(docPath, "utf-8");
          const parsed = parseAtelier(raw);
          if (parsed.success) {
            store.set(documentId, parsed.data, "system");
          }
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, result }) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
          isError: true as const,
        };
      }
    },
  );
}
