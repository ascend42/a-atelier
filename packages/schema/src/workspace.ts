import { z } from "zod";

/**
 * Workspace manifest schema — the YAML-serialized contents of
 * `workspace.atelier` at the root of an Atelier workspace.
 *
 * A workspace is a layer above Project: a single directory holding multiple
 * content Projects with shared creator-level configuration (learning mode,
 * mind-map, recipes). The manifest itself stays tiny on purpose — most
 * workspace-level state lives in `.atelier/` siblings on disk, not in this
 * file. Fields listed here are the minimum needed to:
 *   - discover the workspace from any descendant cwd (`workspace.atelier`
 *     is the on-disk signal)
 *   - propagate creator preferences into newly-init'd projects
 *     (`default_mode`)
 *   - hint which subdirs are Projects (`projects?`); on-disk truth is
 *     authoritative — `projects` is advisory and may be refreshed by
 *     scanning for `project.atelier` files.
 *
 * `workspace.atelier` is YAML (intentionally — distinguishes it from
 * `project.atelier` which is JSON) and shares the `.atelier` extension as
 * a family marker. The two never collide in a single directory.
 */

/**
 * WorkspaceManifest — top-level. Strict on unknown keys; same posture as the
 * recipe schema so authoring typos surface at validate time rather than being
 * silently dropped.
 */
export const WorkspaceManifestSchema = z.object({
  /** Manifest schema version. Pinned to '1.0' for the initial release. */
  version: z.literal("1.0"),
  /** Display name; defaults to the workspace dir basename at create time. */
  name: z.string().min(1),
  /** ISO 8601 timestamp set by the writer. */
  created: z.string().min(1),
  /**
   * Inherited by new projects created via `atelier init` inside this
   * workspace. The creator pre-declares the autonomy posture once at the
   * workspace level; per-project overrides still allowed via per-project
   * `.atelier/learning-mode.yaml` (writes always happen at workspace level
   * unless explicitly overridden).
   */
  default_mode: z.enum(["ambient", "explicit"]),
  /**
   * Relative paths (single-segment subdir names) of known Projects inside
   * the workspace. Advisory only — on-disk `project.atelier` presence is
   * authoritative. Refresh via `listProjects(workspaceDir)`.
   */
  projects: z.array(z.string().min(1)).optional(),
  /** Free-text creator description. Optional. */
  description: z.string().optional(),
}).strict();

/** Inferred TS type for the manifest. */
export type WorkspaceManifest = z.infer<typeof WorkspaceManifestSchema>;
