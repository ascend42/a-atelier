// #mcp-docs-tools — MCP tools for the v1.0 doc-management surface: create,
// duplicate, delete, and list .atelier docs inside a workspace project.
//
// Defense-in-depth posture (mirrors `./rename-media.ts`):
//   1. Workspace scoping: `projectDir` (or `workspaceDir + projectName`) MUST
//      resolve inside `workspaceDir` (defaulting to `process.cwd()`). Reject
//      out-of-workspace requests up front.
//   2. For mutate-style tools (create, duplicate), `projectDir` MUST contain a
//      `project.atelier`. Reject ghost-directory targets.
//   3. After mutation, reload the affected doc into the supplied DocumentStore
//      under `documentId` with source `"llm"` so the live bridge sees the
//      post-mutation state. For delete, only reload if the user's `documentId`
//      was the deleted doc — multi-carousel manifest reload is handled by the
//      studio's WS filesystem watcher, not this layer.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";

import type { DocumentStore } from "../store.js";
import {
  createDoc,
  deleteDoc,
  duplicateDoc,
  listDocs,
} from "../lib/doc-management.js";
import { isValidDocName } from "../lib/doc-management-types.js";

// ── Helpers ──────────────────────────────────────────────────────

function errorEnvelope(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

function successEnvelope(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...payload }) }],
  };
}

/**
 * Resolve a `projectDir` under a workspace root, with the same posture as
 * rename-media.ts: workspaceDir defaults to process.cwd(); projectDir must
 * be equal to or a descendant of workspaceDir.
 */
function resolveProjectInWorkspace(
  projectDir: string,
  workspaceDir: string | undefined,
): { ok: true; workspaceAbs: string; projectAbs: string } | { ok: false; error: string } {
  const workspaceAbs = resolve(workspaceDir ?? process.cwd());
  const projectAbs = resolve(projectDir);
  if (projectAbs !== workspaceAbs && !projectAbs.startsWith(workspaceAbs + sep)) {
    return { ok: false, error: `projectDir must be inside workspace ${workspaceAbs}` };
  }
  return { ok: true, workspaceAbs, projectAbs };
}

function readDocFromDisk(absPath: string): AtelierDocument | undefined {
  try {
    const raw = readFileSync(absPath, "utf-8");
    const parsed = parseAtelier(raw);
    if (parsed.success) return parsed.data as AtelierDocument;
    return JSON.parse(raw) as AtelierDocument;
  } catch {
    return undefined;
  }
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── v1.0.x doc tools ──────

  // ── 1. atelier_create_doc ────────────────────────────────────
  server.tool(
    "atelier_create_doc",
    "Create a new .atelier doc inside a workspace project. Optionally append it to a carousel's slides[].",
    {
      documentId: z.string().describe("Document ID under which to reload the affected doc"),
      projectDir: z.string().describe("Absolute project directory (must contain project.atelier)"),
      workspaceDir: z.string().optional().describe("Workspace root for security scoping (defaults to process.cwd())"),
      name: z.string().describe("Human-typed doc name; slugged internally to a filesystem-safe stem"),
      kind: z.enum(["video", "image", "carousel"]).describe("Doc kind"),
      asCarouselSlide: z.boolean().optional().describe("If true, write under slides/ and append a SlideRef to carouselDocPath"),
      carouselDocPath: z.string().optional().describe("Absolute path to the carousel doc whose slides[] to mutate (required when asCarouselSlide:true)"),
      insertAt: z.number().int().optional().describe("Index in carousel slides[] (default = append)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, workspaceDir, name, kind, asCarouselSlide, carouselDocPath, insertAt }) => {
      try {
        if (!isValidDocName(name)) return errorEnvelope("invalid doc name");

        const scope = resolveProjectInWorkspace(projectDir, workspaceDir);
        if (!scope.ok) return errorEnvelope(scope.error);
        if (!existsSync(join(scope.projectAbs, "project.atelier"))) {
          return errorEnvelope("projectDir does not contain project.atelier");
        }

        // If asCarouselSlide is requested, ensure the carousel path is also
        // inside the workspace (defense in depth).
        if (asCarouselSlide && carouselDocPath) {
          const carouselAbs = resolve(carouselDocPath);
          if (carouselAbs !== scope.workspaceAbs && !carouselAbs.startsWith(scope.workspaceAbs + sep)) {
            return errorEnvelope(`carouselDocPath must be inside workspace ${scope.workspaceAbs}`);
          }
        }

        const result = createDoc({
          projectDir: scope.projectAbs,
          name,
          kind,
          ...(asCarouselSlide !== undefined ? { asCarouselSlide } : {}),
          ...(carouselDocPath !== undefined ? { carouselDocPath } : {}),
          ...(insertAt !== undefined ? { insertAt } : {}),
        });

        // Reload: if we appended a SlideRef, reload the carousel manifest; else
        // reload the newly-created doc itself.
        const reloadTarget = asCarouselSlide && carouselDocPath
          ? resolve(carouselDocPath)
          : result.newDocAbsPath;
        const doc = readDocFromDisk(reloadTarget);
        if (doc) store.set(documentId, doc, "llm");

        const payload: Record<string, unknown> = { docPath: result.newDocPath };
        if (result.appendedSlideIndex !== undefined) {
          payload.appendedSlideIndex = result.appendedSlideIndex;
        }
        return successEnvelope(payload);
      } catch (e) {
        return errorEnvelope((e as Error).message);
      }
    },
  );

  // ── 2. atelier_duplicate_doc ─────────────────────────────────
  server.tool(
    "atelier_duplicate_doc",
    "Duplicate an existing .atelier doc inside a project. Refuses to duplicate project.atelier. Optionally appends a SlideRef to the project's carousel manifest.",
    {
      documentId: z.string().describe("Document ID under which to reload the affected doc"),
      projectDir: z.string().describe("Absolute project directory (must contain project.atelier)"),
      workspaceDir: z.string().optional().describe("Workspace root for security scoping (defaults to process.cwd())"),
      sourceDocPath: z.string().describe("Project-relative path of the doc to duplicate (e.g. 'slides/slide-1.atelier')"),
      appendSlideRef: z.boolean().optional().describe("If true, append a SlideRef pointing at the duplicate to the project manifest"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, workspaceDir, sourceDocPath, appendSlideRef }) => {
      try {
        const scope = resolveProjectInWorkspace(projectDir, workspaceDir);
        if (!scope.ok) return errorEnvelope(scope.error);
        if (!existsSync(join(scope.projectAbs, "project.atelier"))) {
          return errorEnvelope("projectDir does not contain project.atelier");
        }

        const report = duplicateDoc({
          projectDir: scope.projectAbs,
          sourceDocPath,
          ...(appendSlideRef !== undefined ? { appendSlideRef } : {}),
        });

        // Reload: if a SlideRef was appended, reload the manifest; else reload
        // the duplicate itself.
        const reloadTarget = appendSlideRef
          ? join(scope.projectAbs, "project.atelier")
          : join(scope.projectAbs, report.newDocPath);
        const doc = readDocFromDisk(reloadTarget);
        if (doc) store.set(documentId, doc, "llm");

        return successEnvelope(report as unknown as Record<string, unknown>);
      } catch (e) {
        return errorEnvelope((e as Error).message);
      }
    },
  );

  // ── 3. atelier_delete_doc ────────────────────────────────────
  server.tool(
    "atelier_delete_doc",
    "Delete a non-manifest .atelier doc, scrubbing matching SlideRefs across the workspace and reporting dangling RefVisual layers.",
    {
      documentId: z.string().describe("Document ID — if equal to the deleted doc's path, the studio handles fallback"),
      workspaceDir: z.string().optional().describe("Workspace root for security scoping (defaults to process.cwd())"),
      projectName: z.string().describe("Project subdir name inside workspaceDir"),
      docPath: z.string().describe("Project-relative path of the doc to delete (e.g. 'slides/slide-2.atelier')"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ documentId: _documentId, workspaceDir, projectName, docPath }) => {
      try {
        const workspaceAbs = resolve(workspaceDir ?? process.cwd());
        const projectAbs = resolve(join(workspaceAbs, projectName));
        // projectName must resolve inside workspaceAbs (e.g. reject "../escape").
        if (projectAbs !== workspaceAbs && !projectAbs.startsWith(workspaceAbs + sep)) {
          return errorEnvelope(`projectName must resolve inside workspace ${workspaceAbs}`);
        }
        if (!existsSync(join(projectAbs, "project.atelier"))) {
          return errorEnvelope("project does not contain project.atelier");
        }

        const report = deleteDoc({
          workspaceDir: workspaceAbs,
          projectName,
          docPath,
        });

        // The studio's WS layer handles fallback when the active documentId
        // was the deleted doc — that is intentionally NOT this layer's
        // concern. We do nothing on the store here (no reload target exists
        // for the deleted doc).
        void _documentId;

        return successEnvelope(report as unknown as Record<string, unknown>);
      } catch (e) {
        return errorEnvelope((e as Error).message);
      }
    },
  );

  // ── 4. atelier_list_docs ─────────────────────────────────────
  server.tool(
    "atelier_list_docs",
    "Enumerate every .atelier doc inside a project: manifest, then carousel slides in order, then other root docs.",
    {
      projectDir: z.string().describe("Absolute project directory"),
      workspaceDir: z.string().optional().describe("Workspace root for security scoping (defaults to process.cwd())"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ projectDir, workspaceDir }) => {
      try {
        const scope = resolveProjectInWorkspace(projectDir, workspaceDir);
        if (!scope.ok) return errorEnvelope(scope.error);

        const docs = listDocs(scope.projectAbs);
        return successEnvelope({ docs });
      } catch (e) {
        return errorEnvelope((e as Error).message);
      }
    },
  );
}
