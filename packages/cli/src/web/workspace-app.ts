/**
 * #studio-workspace-app — the workspace-mode UI for the in-browser Atelier
 * Studio. Runs alongside the legacy single-document app in `inline-app.ts`;
 * `bootStudioApp` picks between them based on whether the server reports a
 * workspace context.
 *
 * Architecture: vanilla TS + DOM (matches the existing studio panels).
 * No React. No new framework. All UI elements are atel-prefixed.
 *
 * Panels live in this file because they're studio-session-only (the CLI's
 * served session, not the published `@a-company/atelier-studio` package).
 * Putting them inside the studio package would require a separate publish
 * + bump cycle — keeping them here keeps the v1 UX bundle in one place.
 *
 * Panels:
 *   - WorkspaceSidebar — projects + artifacts + media + transcripts tree.
 *   - MarkdownView — read/edit DESIGN.md / SCRIPT.md / STORYBOARD.md.
 *   - MediaPreview — video / image / audio playback with metadata.
 *   - TranscriptViewer — formatted transcript with per-word timing.
 *   - DropZone — full-window drag-and-drop overlay for media ingestion.
 */

import { AtelierStudio } from "@a-company/atelier-studio";
import "@a-company/atelier-studio/styles.css";
import { parseAtelier, serializeAtelier } from "@a-company/atelier-schema";

type AtelierDoc = import("@a-company/atelier-types").AtelierDocument;

// ─── Server-side type shapes (mirrors `workspace-project-info.ts`) ──
// Kept narrow — the studio reads the fields it uses; new fields are ignored.

interface WorkspaceInfo {
  name: string;
  workspaceDir: string;
  projects: WorkspaceProjectEntry[];
}

interface WorkspaceProjectEntry {
  name: string;
  dir: string;
  hasAtelierDoc: boolean;
  hasOtherAtelierDocs: boolean;
  hasDesign: boolean;
  hasScript: boolean;
  hasStoryboard: boolean;
}

interface ActiveProjectFile {
  name: string;
  set_at: string;
  stale?: boolean;
}

interface ProjectMediaEntry {
  name: string;
  kind: "video" | "image" | "audio" | "font" | "other";
  path: string;
  sizeBytes: number;
  hasTranscript: boolean;
  /**
   * Workspace-relative path of the transcript file backing this media entry,
   * or null when none exists. Used by MediaPreview's split layout to fetch
   * the transcript without re-deriving the filename from `name`.
   */
  transcriptPath: string | null;
  hasNotes: boolean;
  isRootSource: boolean;
}

interface ProjectTranscriptEntry {
  path: string;
  name: string;
  segments: number | null;
  totalDuration: number | null;
  language: string | null;
}

interface ProjectArtifactsInfo {
  design: ArtifactEntry;
  script: ArtifactEntry;
  storyboard: ArtifactEntry;
}

/**
 * Mirrors `DocListEntry` in `lib/doc-management-types.ts`. Kept narrow — the
 * sidebar reads only the fields it renders; new server fields stay optional.
 *
 * Post-pivot (Wave 1+): the role/slideIndex/slideLabel fields are gone —
 * every doc is a flat root-level `.atelier` file; carousel structure lives
 * inside the carousel doc's `slides[]` (handled by Kit-K's carousel toolbar,
 * not the sidebar).
 */
interface DocListEntry {
  path: string;
  kind?: "video" | "image" | "carousel";
}

/** Response body for DELETE /api/project/:name/docs?path=... */
interface DocDeleteCascadeReport {
  docPath: string;
  slideRefsRemoved: Array<{ project: string; slideIndex: number }>;
  refLayersDangling: Array<{ project: string; docPath: string; layerId: string }>;
}

interface ArtifactEntry {
  path: string;
  exists: boolean;
  mtime: string | null;
  sizeBytes: number | null;
}

/** Branded theme — matches inline-app.ts for visual consistency. */
const theme = {
  bg: "#2C2C2C",
  bgSecondary: "#333333",
  bgTertiary: "#3D3D3D",
  text: "#F5F0EB",
  textMuted: "#A89F95",
  textAccent: "#F5F0EB",
  border: "#4A4A4A",
  buttonBg: "#3D3D3D",
  buttonHover: "#4A4A4A",
  buttonActive: "#555555",
  accent: "#C75B39",
  accentHover: "#D4724E",
  sliderTrack: "#4A4A4A",
  sliderThumb: "#C75B39",
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontMono: "'SF Mono', 'Fira Code', monospace",
  canvasShadow: "0 4px 60px rgba(199, 91, 57, 0.12), 0 0 40px rgba(0,0,0,0.4)",
};

// ─── API helpers ─────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function saveText(path: string, content: string): Promise<void> {
  const res = await fetch("/api/file?path=" + encodeURIComponent(path), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
}

/** DELETE helper — throws on non-2xx; returns parsed JSON body. */
async function deleteJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── #studio-workspace-sidebar ───────────────────────────────────────

interface SidebarCallbacks {
  onSelectProject: (name: string) => void;
  onSelectArtifact: (projectName: string, kind: "design" | "script" | "storyboard") => void;
  /**
   * Select any .atelier doc (including `project.atelier`) inside the active
   * project. Loads `<projectName>/<entry.path>` into the canvas.
   */
  onSelectDoc: (projectName: string, entry: DocListEntry) => void;
  onSelectMedia: (projectName: string, entry: ProjectMediaEntry) => void;
  onSelectTranscript: (projectName: string, entry: ProjectTranscriptEntry) => void;
  onCreateProject: () => void;
  /** "+ new doc" button on the DOCS header row. Opens the NewDocDialog. */
  onCreateDoc: (projectName: string) => void;
  /** Right-click → Duplicate on any doc row. */
  onDuplicateDoc: (projectName: string, entry: DocListEntry) => void;
  /** Right-click → Delete on any doc row. Cascade-preview confirm. */
  onDeleteDoc: (projectName: string, entry: DocListEntry) => void;
  /** Right-click → Delete on a project row. Triggers the type-to-confirm modal. */
  onDeleteProject: (name: string) => void;
  /** Right-click → Delete on a media row. Triggers the cascade-preview modal. */
  onDeleteMedia: (projectName: string, entry: ProjectMediaEntry) => void;
  /** Right-click → Delete on a transcript row. Standalone delete; media intact. */
  onDeleteTranscript: (projectName: string, entry: ProjectTranscriptEntry) => void;
  /**
   * Right-click → Delete on an artifact row (DESIGN/SCRIPT/STORYBOARD).
   * Single-file delete via /api/file — sidecar to nothing.
   */
  onDeleteArtifact: (projectName: string, kind: "design" | "script" | "storyboard", path: string) => void;
}

class WorkspaceSidebar {
  readonly el: HTMLElement;
  private listEl: HTMLElement;
  private headerEl: HTMLElement;
  private workspace: WorkspaceInfo | null = null;
  private active: ActiveProjectFile | null = null;
  /**
   * Path of the currently-loaded doc within the active project (e.g.
   * "project.atelier" or "intro-scene.atelier"). Drives the "← loaded" marker
   * on the matching doc row. `null` when nothing's loaded.
   */
  private currentDocPath: string | null = null;
  /** Per-project loaded detail (media/transcripts/artifacts/docs) — lazily filled. */
  private detail = new Map<string, {
    media: ProjectMediaEntry[];
    transcripts: ProjectTranscriptEntry[];
    artifacts: ProjectArtifactsInfo | null;
    docs: DocListEntry[];
  }>();

  constructor(parent: HTMLElement, private cb: SidebarCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "atel-workspace-sidebar";

    this.headerEl = document.createElement("div");
    this.headerEl.className = "atel-workspace-sidebar__header";
    this.el.appendChild(this.headerEl);

    this.listEl = document.createElement("div");
    this.listEl.className = "atel-workspace-sidebar__list";
    this.el.appendChild(this.listEl);

    parent.appendChild(this.el);
  }

  async refresh(): Promise<void> {
    try {
      this.workspace = await fetchJson<WorkspaceInfo>("/api/workspace");
    } catch {
      this.renderError("Failed to load workspace.");
      return;
    }
    try {
      this.active = await fetchJson<ActiveProjectFile | null>("/api/workspace/active");
    } catch {
      this.active = null;
    }

    // Preload detail for the active project so the tree renders fully on
    // first paint (avoids a flash of an empty active project).
    if (this.active && this.workspace) {
      const proj = this.workspace.projects.find((p) => p.name === this.active!.name);
      if (proj) await this.loadDetail(proj.name);
    }

    this.render();
  }

  /** Trigger a refresh of one project's media / transcripts (post-ingest). */
  async refreshProject(name: string): Promise<void> {
    await this.loadDetail(name);
    this.render();
  }

  private async loadDetail(name: string): Promise<void> {
    try {
      const [media, transcripts, artifacts, docs] = await Promise.all([
        fetchJson<ProjectMediaEntry[]>(`/api/project/${encodeURIComponent(name)}/media`),
        fetchJson<ProjectTranscriptEntry[]>(`/api/project/${encodeURIComponent(name)}/transcripts`),
        fetchJson<ProjectArtifactsInfo>(`/api/project/${encodeURIComponent(name)}/artifacts`),
        fetchJson<DocListEntry[]>(`/api/project/${encodeURIComponent(name)}/docs`),
      ]);
      this.detail.set(name, { media, transcripts, artifacts, docs });
    } catch {
      // Keep what we had on failure.
    }
  }

  /** Public accessor for the currently-cached doc list (used for fallback logic). */
  getDocs(name: string): DocListEntry[] {
    return this.detail.get(name)?.docs ?? [];
  }

  /**
   * Update the "← loaded" marker on the doc row matching `path`. Pass `null`
   * to clear the marker (e.g. when a non-doc panel — media / transcript /
   * markdown — is open in the main panel).
   */
  setCurrentDocPath(path: string | null): void {
    if (this.currentDocPath === path) return;
    this.currentDocPath = path;
    this.render();
  }

  private renderError(msg: string): void {
    this.listEl.innerHTML = "";
    const err = document.createElement("div");
    err.style.cssText = "padding:24px;color:#C75B39;font-size:13px";
    err.textContent = msg;
    this.listEl.appendChild(err);
  }

  private render(): void {
    if (!this.workspace) return;

    this.headerEl.innerHTML = "";
    const title = document.createElement("div");
    title.className = "atel-workspace-sidebar__title";
    title.innerHTML = `<span style="color:#C75B39">&#9670;</span> WORKSPACE: ${escapeHtml(this.workspace.name)}`;
    this.headerEl.appendChild(title);

    const projectsLabel = document.createElement("div");
    projectsLabel.className = "atel-workspace-sidebar__section";
    projectsLabel.innerHTML = `<span>Projects</span>`;

    const newBtn = document.createElement("button");
    newBtn.className = "atel-workspace-sidebar__new-btn";
    newBtn.textContent = "+ new";
    newBtn.addEventListener("click", () => this.cb.onCreateProject());
    projectsLabel.appendChild(newBtn);
    this.headerEl.appendChild(projectsLabel);

    // Project list
    this.listEl.innerHTML = "";
    if (this.workspace.projects.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:16px 24px;color:#A89F95;font-size:12px";
      empty.textContent = "No projects yet — click `+ new` to create one.";
      this.listEl.appendChild(empty);
      return;
    }

    for (const proj of this.workspace.projects) {
      this.listEl.appendChild(this.renderProject(proj));
    }
  }

  private renderProject(proj: WorkspaceProjectEntry): HTMLElement {
    const isActive = this.active?.name === proj.name;
    const wrapper = document.createElement("div");
    wrapper.className = "atel-workspace-sidebar__project" +
      (isActive ? " atel-workspace-sidebar__project--active" : "");

    const header = document.createElement("div");
    header.className = "atel-workspace-sidebar__project-header";
    header.innerHTML = `<span class="atel-tree-arrow">${isActive ? "▾" : "▸"}</span> <span class="atel-project-name">${escapeHtml(proj.name)}</span>` +
      (isActive ? '<span class="atel-active-marker"> ← active</span>' : "");
    header.addEventListener("click", () => this.cb.onSelectProject(proj.name));
    header.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        {
          label: "Delete project…",
          destructive: true,
          onClick: () => this.cb.onDeleteProject(proj.name),
        },
      ]);
    });
    wrapper.appendChild(header);

    // Only render children for the active project to keep the sidebar compact.
    if (!isActive) return wrapper;

    const detail = this.detail.get(proj.name);
    const children = document.createElement("div");
    children.className = "atel-workspace-sidebar__project-children";

    // ── DOCS ──
    // Single flat group, alphabetical by path (server-sorted via listDocs).
    // Every doc — including project.atelier — is a regular row with a type
    // icon, a click-to-load handler, and the Duplicate / Delete… context
    // menu. Post-pivot, there's no "pinned manifest" distinction.
    //
    // Falls back to a synthesized manifest-only list when the live doc list
    // hasn't landed yet (first paint, transient failure). Empty arrays render
    // an empty-state message under the heading.
    const docs: DocListEntry[] = detail?.docs ?? (
      proj.hasAtelierDoc ? [{ path: "project.atelier", kind: undefined }] : []
    );

    {
      const group = document.createElement("div");
      group.className = "atel-workspace-sidebar__group";

      const label = document.createElement("div");
      label.className = "atel-workspace-sidebar__group-label atel-workspace-sidebar__group-label--with-action";
      const labelText = document.createElement("span");
      labelText.textContent = "Docs";
      label.appendChild(labelText);
      const newDocBtn = document.createElement("button");
      newDocBtn.className = "atel-workspace-sidebar__new-btn atel-workspace-sidebar__new-btn--inline";
      newDocBtn.textContent = "+ new doc";
      newDocBtn.title = "Create a new doc in this project";
      newDocBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.cb.onCreateDoc(proj.name);
      });
      label.appendChild(newDocBtn);
      group.appendChild(label);

      if (docs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "atel-workspace-sidebar__empty";
        empty.textContent = "No documents yet. Click + new doc to create one.";
        group.appendChild(empty);
      } else {
        for (const d of docs) {
          group.appendChild(this.renderDocRow(proj.name, d));
        }
      }
      children.appendChild(group);
    }

    // Artifacts
    if (detail?.artifacts) {
      const group = document.createElement("div");
      group.className = "atel-workspace-sidebar__group";
      group.innerHTML = "<div class=\"atel-workspace-sidebar__group-label\">Artifacts</div>";
      group.appendChild(this.renderArtifactRow(proj.name, "DESIGN.md", "design", detail.artifacts.design));
      group.appendChild(this.renderArtifactRow(proj.name, "SCRIPT.md", "script", detail.artifacts.script));
      group.appendChild(this.renderArtifactRow(proj.name, "STORYBOARD.md", "storyboard", detail.artifacts.storyboard));
      children.appendChild(group);
    }

    // Media
    if (detail?.media && detail.media.length > 0) {
      const group = document.createElement("div");
      group.className = "atel-workspace-sidebar__group";
      group.innerHTML = "<div class=\"atel-workspace-sidebar__group-label\">Media</div>";
      for (const m of detail.media) {
        const item = document.createElement("div");
        item.className = "atel-workspace-sidebar__item";
        const transcriptBadge = m.hasTranscript ? '<span class="atel-badge atel-badge--ok">✓ transcript</span>' : "";
        const notesBadge = m.hasNotes ? '<span class="atel-badge">notes</span>' : "";
        item.innerHTML = `<span class="atel-item-icon">${kindIcon(m.kind)}</span> ${escapeHtml(m.name)} ${transcriptBadge} ${notesBadge}`;
        item.addEventListener("click", () => this.cb.onSelectMedia(proj.name, m));
        item.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          showContextMenu(ev.clientX, ev.clientY, [
            {
              label: `Delete "${m.name}"…`,
              destructive: true,
              onClick: () => this.cb.onDeleteMedia(proj.name, m),
            },
          ]);
        });
        group.appendChild(item);
      }
      children.appendChild(group);
    }

    // Transcripts
    if (detail?.transcripts && detail.transcripts.length > 0) {
      const group = document.createElement("div");
      group.className = "atel-workspace-sidebar__group";
      group.innerHTML = "<div class=\"atel-workspace-sidebar__group-label\">Transcripts</div>";
      for (const t of detail.transcripts) {
        const item = document.createElement("div");
        item.className = "atel-workspace-sidebar__item";
        const wordsLabel = t.segments !== null ? `${t.segments} seg` : "?";
        const langLabel = t.language ?? "—";
        const durLabel = t.totalDuration !== null ? `${t.totalDuration.toFixed(1)}s` : "?";
        item.innerHTML = `<span class="atel-item-icon">📝</span> ${escapeHtml(t.name)} <span class="atel-item-meta">(${wordsLabel} · ${langLabel} · ${durLabel})</span>`;
        item.addEventListener("click", () => this.cb.onSelectTranscript(proj.name, t));
        item.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          showContextMenu(ev.clientX, ev.clientY, [
            {
              label: `Delete "${t.name}"…`,
              destructive: true,
              onClick: () => this.cb.onDeleteTranscript(proj.name, t),
            },
          ]);
        });
        group.appendChild(item);
      }
      children.appendChild(group);
    }

    wrapper.appendChild(children);
    return wrapper;
  }

  /**
   * Render a single doc row (any kind, including the project manifest). Click
   * loads the doc into the canvas; right-click opens the Duplicate / Delete…
   * context menu. The currently-loaded doc gets a `← loaded` marker and an
   * accent-colored treatment.
   */
  private renderDocRow(projectName: string, entry: DocListEntry): HTMLElement {
    const item = document.createElement("div");
    const isLoaded = entry.path === this.currentDocPath;
    item.className = "atel-workspace-sidebar__item" +
      (isLoaded ? " atel-workspace-sidebar__item--loaded" : "");
    // Show just the basename for readability ("intro.atelier" not "intro.atelier").
    const basename = entry.path.split("/").pop() ?? entry.path;
    const loadedMarker = isLoaded
      ? '<span class="atel-loaded-marker"> ← loaded</span>'
      : "";
    item.innerHTML = `<span class="atel-item-icon">${docKindIcon(entry.kind)}</span> ${escapeHtml(basename)}${loadedMarker}`;
    item.addEventListener("click", () => this.cb.onSelectDoc(projectName, entry));
    item.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        {
          label: "Duplicate",
          onClick: () => this.cb.onDuplicateDoc(projectName, entry),
        },
        {
          label: "Delete…",
          destructive: true,
          onClick: () => this.cb.onDeleteDoc(projectName, entry),
        },
      ]);
    });
    return item;
  }

  private renderArtifactRow(
    projectName: string,
    label: string,
    kind: "design" | "script" | "storyboard",
    entry: ArtifactEntry,
  ): HTMLElement {
    const item = document.createElement("div");
    item.className = "atel-workspace-sidebar__item";
    const marker = entry.exists ? '<span style="color:#6B8E6B">✓</span>' : '<span style="color:#A89F95">○</span>';
    const empty = entry.exists ? "" : '<span class="atel-item-meta"> (empty)</span>';
    item.innerHTML = `<span class="atel-item-icon">📄</span> ${escapeHtml(label)} ${marker}${empty}`;
    item.addEventListener("click", () => this.cb.onSelectArtifact(projectName, kind));
    if (entry.exists) {
      item.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        showContextMenu(ev.clientX, ev.clientY, [
          {
            label: `Delete ${label}…`,
            destructive: true,
            onClick: () => this.cb.onDeleteArtifact(projectName, kind, entry.path),
          },
        ]);
      });
    }
    return item;
  }
}

// ─── #confirm-dialog (destructive-action modal) ──────────────────────
//
// Single reusable modal class for delete confirmations. Hand-rolled DOM,
// matching the existing studio panels' idiom (no new dep, no React).
//
// Three knobs:
//   - title — destructive verb + target ("Delete IMG_7347.MOV?")
//   - body — DOM fragment listing what the cascade affects (paths, counts)
//   - requireTypeName — when set to a string, the Delete button stays
//     disabled until the creator types the exact value into a confirm
//     field. The gold-standard guard for irreversible destruction —
//     #confirm-dialog-type-name-for-destructive-deletes.
//
// `prompt()` returns a Promise<boolean> the caller awaits. Escape / clicking
// the backdrop dismisses (returns false). The modal cleans up its own DOM
// after resolution.

interface ConfirmDialogOptions {
  title: string;
  /** Either preformatted HTML (escaped at the caller) or a DOM node. */
  body: string | Node;
  /** Button label. Defaults to "Delete". */
  confirmLabel?: string;
  /**
   * When set, the Delete button stays disabled until the creator types
   * exactly this string into the confirm field. Used for project deletion
   * (the project name) — anything irreversible enough to deserve a
   * second checkpoint.
   */
  requireTypeName?: string;
}

class ConfirmDialog {
  /**
   * Show a confirmation modal and return whether the creator confirmed.
   * The modal mounts onto `document.body`, gates focus, and removes itself
   * on dismiss / confirm.
   */
  static prompt(opts: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolveDone) => {
      const overlay = document.createElement("div");
      overlay.className = "atel-confirm-dialog";

      const card = document.createElement("div");
      card.className = "atel-confirm-dialog__card";

      const title = document.createElement("div");
      title.className = "atel-confirm-dialog__title";
      title.textContent = opts.title;
      card.appendChild(title);

      const body = document.createElement("div");
      body.className = "atel-confirm-dialog__body";
      if (typeof opts.body === "string") {
        body.innerHTML = opts.body;
      } else {
        body.appendChild(opts.body);
      }
      card.appendChild(body);

      let confirmInput: HTMLInputElement | null = null;
      if (opts.requireTypeName) {
        const wrapper = document.createElement("div");
        wrapper.className = "atel-confirm-dialog__type-to-confirm";
        const label = document.createElement("label");
        label.textContent = `Type "${opts.requireTypeName}" to confirm:`;
        label.className = "atel-confirm-dialog__type-label";
        wrapper.appendChild(label);

        confirmInput = document.createElement("input");
        confirmInput.type = "text";
        confirmInput.className = "atel-confirm-dialog__type-input";
        confirmInput.autocomplete = "off";
        confirmInput.spellcheck = false;
        wrapper.appendChild(confirmInput);

        card.appendChild(wrapper);
      }

      const buttons = document.createElement("div");
      buttons.className = "atel-confirm-dialog__buttons";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "atel-confirm-dialog__btn atel-confirm-dialog__btn--cancel";
      cancelBtn.textContent = "Cancel";
      buttons.appendChild(cancelBtn);

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "atel-confirm-dialog__btn atel-confirm-dialog__btn--danger";
      confirmBtn.textContent = opts.confirmLabel ?? "Delete";
      // Type-to-confirm: start disabled, listen for input, enable on exact match.
      if (opts.requireTypeName && confirmInput) {
        confirmBtn.disabled = true;
        confirmInput.addEventListener("input", () => {
          confirmBtn.disabled = confirmInput!.value !== opts.requireTypeName;
        });
        // Allow Enter to confirm once enabled.
        confirmInput.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" && !confirmBtn.disabled) {
            ev.preventDefault();
            confirmBtn.click();
          }
        });
      }
      buttons.appendChild(confirmBtn);

      card.appendChild(buttons);
      overlay.appendChild(card);

      const cleanup = (): void => {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
      };
      const onKey = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape") {
          cleanup();
          resolveDone(false);
        }
      };

      cancelBtn.addEventListener("click", () => {
        cleanup();
        resolveDone(false);
      });
      confirmBtn.addEventListener("click", () => {
        if (confirmBtn.disabled) return;
        cleanup();
        resolveDone(true);
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) {
          cleanup();
          resolveDone(false);
        }
      });
      document.addEventListener("keydown", onKey);

      document.body.appendChild(overlay);

      // Autofocus the type-to-confirm input for fast keyboard flow; otherwise
      // focus Cancel (a creator who summoned the modal via context menu is
      // most likely to escape with Cancel by default).
      if (confirmInput) {
        confirmInput.focus();
      } else {
        cancelBtn.focus();
      }
    });
  }
}

// ─── #new-doc-dialog (create a fresh doc in the active project) ──────
//
// Three-tile modal (video / image / carousel — owner explicitly excluded
// "blank" from v1). Mirrors ConfirmDialog's idiom: same backdrop, same
// centered card. Returns the form selection (or null on cancel); the
// HTTP call lives at the caller so error rendering can stay local.
//
// Post-pivot: the dialog ONLY creates docs at project root. Slide creation
// (anchoring a doc into a carousel's slides[]) moves into the carousel-doc
// canvas toolbar (Kit-K's territory) — no slide toggle here.

interface NewDocSelection {
  name: string;
  kind: "video" | "image" | "carousel";
}

interface NewDocPromptOptions {
  /** Override the dialog title — e.g. "Add slide" when adding a slide to a carousel. */
  title?: string;
}

class NewDocDialog {
  /**
   * Show the create-doc modal and resolve with the creator's selection or
   * null on cancel. Inline server errors are rendered via `showError`.
   *
   * `options.title` lets callers retitle the dialog (e.g. Kit-K's "+ add slide"
   * carousel-toolbar entrypoint, which reuses this dialog for the
   * "create new doc as slide" path).
   */
  static prompt(options: NewDocPromptOptions = {}): Promise<NewDocSelection | null> {
    return new Promise((resolveDone) => {
      const overlay = document.createElement("div");
      overlay.className = "atel-confirm-dialog";

      const card = document.createElement("div");
      card.className = "atel-confirm-dialog__card atel-new-doc-dialog__card";

      const title = document.createElement("div");
      title.className = "atel-confirm-dialog__title";
      title.textContent = options.title ?? "New doc";
      card.appendChild(title);

      // ── Kind tiles (3, not 4 — blank excluded by owner) ──
      const tilesRow = document.createElement("div");
      tilesRow.className = "atel-new-doc-dialog__tiles";

      let selectedKind: "video" | "image" | "carousel" = "video";
      const tileDefs: Array<{ kind: "video" | "image" | "carousel"; icon: string; label: string }> = [
        { kind: "video", icon: "🎬", label: "Video" },
        { kind: "image", icon: "🖼", label: "Image" },
        { kind: "carousel", icon: "🎠", label: "Carousel" },
      ];
      const tileEls: HTMLElement[] = [];
      for (const def of tileDefs) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "atel-new-doc-dialog__tile";
        if (def.kind === selectedKind) tile.classList.add("atel-new-doc-dialog__tile--selected");
        tile.innerHTML = `<div class="atel-new-doc-dialog__tile-icon">${def.icon}</div>
          <div class="atel-new-doc-dialog__tile-label">${def.label}</div>`;
        tile.addEventListener("click", () => {
          selectedKind = def.kind;
          for (const el of tileEls) el.classList.remove("atel-new-doc-dialog__tile--selected");
          tile.classList.add("atel-new-doc-dialog__tile--selected");
        });
        tileEls.push(tile);
        tilesRow.appendChild(tile);
      }
      card.appendChild(tilesRow);

      // ── Name input + live slug preview ──
      const nameWrapper = document.createElement("div");
      nameWrapper.className = "atel-new-doc-dialog__field";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Name";
      nameLabel.className = "atel-confirm-dialog__type-label";
      nameWrapper.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "atel-confirm-dialog__type-input";
      nameInput.autocomplete = "off";
      nameInput.spellcheck = false;
      nameInput.placeholder = "e.g. Intro scene";
      nameWrapper.appendChild(nameInput);
      const slugPreview = document.createElement("div");
      slugPreview.className = "atel-new-doc-dialog__slug-preview";
      slugPreview.textContent = " ";
      nameWrapper.appendChild(slugPreview);
      card.appendChild(nameWrapper);

      // ── Error row (inline; populated by showError below) ──
      const errorRow = document.createElement("div");
      errorRow.className = "atel-new-doc-dialog__error";
      errorRow.style.display = "none";
      card.appendChild(errorRow);

      // ── Buttons ──
      const buttons = document.createElement("div");
      buttons.className = "atel-confirm-dialog__buttons";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "atel-confirm-dialog__btn atel-confirm-dialog__btn--cancel";
      cancelBtn.textContent = "Cancel";
      buttons.appendChild(cancelBtn);

      const createBtn = document.createElement("button");
      createBtn.className = "atel-confirm-dialog__btn atel-confirm-dialog__btn--primary";
      createBtn.textContent = "Create";
      createBtn.disabled = true;
      buttons.appendChild(createBtn);

      card.appendChild(buttons);
      overlay.appendChild(card);

      // Live slug preview + Create enable/disable.
      nameInput.addEventListener("input", () => {
        const raw = nameInput.value.trim();
        if (raw.length === 0) {
          slugPreview.textContent = " ";
          createBtn.disabled = true;
        } else {
          slugPreview.textContent = `slug: ${previewSlug(raw)}.atelier`;
          createBtn.disabled = false;
        }
        // Clear any prior inline error on edit.
        errorRow.style.display = "none";
      });
      nameInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !createBtn.disabled) {
          ev.preventDefault();
          createBtn.click();
        }
      });

      // Cleanup + resolution wiring (mirrors ConfirmDialog).
      const cleanup = (): void => {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
      };
      const onKey = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape") {
          cleanup();
          resolveDone(null);
        }
      };
      cancelBtn.addEventListener("click", () => {
        cleanup();
        resolveDone(null);
      });
      createBtn.addEventListener("click", () => {
        if (createBtn.disabled) return;
        const name = nameInput.value.trim();
        if (name.length === 0) return;
        cleanup();
        resolveDone({
          name,
          kind: selectedKind,
        });
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) {
          cleanup();
          resolveDone(null);
        }
      });
      document.addEventListener("keydown", onKey);

      document.body.appendChild(overlay);
      nameInput.focus();
    });
  }
}

/**
 * Lightweight slug preview — matches the spec's "lowercase + space→hyphen"
 * fallback. Exact slug is the server's job (slugifyBasename); this is purely
 * a visual hint.
 */
function previewSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "doc";
}

// ─── #context-menu (sidebar right-click affordance) ──────────────────
//
// Lightweight one-shot context menu. Matches the existing studio panel
// idiom (vanilla DOM, no new dep). Single "Delete..." item by design —
// when we need more verbs the API grows to accept an item list.

interface ContextMenuItem {
  label: string;
  /** When set, the item is rendered as destructive (warm accent). */
  destructive?: boolean;
  onClick: () => void;
}

/** Show a context menu at (x, y) with the given items. Dismiss on outside click / escape. */
function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  // Tear down any open menu first — only one at a time.
  document.querySelectorAll(".atel-context-menu").forEach((n) => n.remove());

  const menu = document.createElement("div");
  menu.className = "atel-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "atel-context-menu__item" +
      (item.destructive ? " atel-context-menu__item--danger" : "");
    row.textContent = item.label;
    row.addEventListener("click", () => {
      menu.remove();
      item.onClick();
    });
    menu.appendChild(row);
  }

  const cleanup = (): void => {
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onKey);
    menu.remove();
  };
  const onDocClick = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) cleanup();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") cleanup();
  };
  // Defer registration so the click that opened us doesn't immediately close
  // (the contextmenu event has already fired by this tick, but we register
  // on capture phase so a same-tick stray click still cleans up cleanly).
  setTimeout(() => {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
  }, 0);

  document.body.appendChild(menu);

  // Clamp inside viewport — a menu that opens near the bottom-right edge
  // gets nudged up/left.
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.right > vw) menu.style.left = `${vw - rect.width - 4}px`;
  if (rect.bottom > vh) menu.style.top = `${vh - rect.height - 4}px`;
}

// ─── #studio-markdown-view ───────────────────────────────────────────

class MarkdownView {
  readonly el: HTMLElement;
  private viewerEl: HTMLElement;
  private editorEl: HTMLTextAreaElement;
  private toggleBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private headerEl: HTMLElement;
  private currentPath: string | null = null;
  private currentContent: string = "";
  private editing = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "atel-markdown-view";

    this.headerEl = document.createElement("div");
    this.headerEl.className = "atel-markdown-view__header";
    const title = document.createElement("div");
    title.className = "atel-markdown-view__title";
    this.headerEl.appendChild(title);

    this.toggleBtn = document.createElement("button");
    this.toggleBtn.className = "atel-markdown-view__btn";
    this.toggleBtn.textContent = "Edit";
    this.toggleBtn.addEventListener("click", () => this.toggleEdit());
    this.headerEl.appendChild(this.toggleBtn);

    this.saveBtn = document.createElement("button");
    this.saveBtn.className = "atel-markdown-view__btn";
    this.saveBtn.textContent = "Save";
    this.saveBtn.style.display = "none";
    this.saveBtn.addEventListener("click", () => this.save());
    this.headerEl.appendChild(this.saveBtn);

    this.el.appendChild(this.headerEl);

    this.viewerEl = document.createElement("div");
    this.viewerEl.className = "atel-markdown-view__body";
    this.el.appendChild(this.viewerEl);

    this.editorEl = document.createElement("textarea");
    this.editorEl.className = "atel-markdown-view__editor";
    this.editorEl.style.display = "none";
    this.el.appendChild(this.editorEl);

    parent.appendChild(this.el);
  }

  async load(path: string): Promise<void> {
    this.currentPath = path;
    try {
      this.currentContent = await fetchText("/api/file?path=" + encodeURIComponent(path));
    } catch (e) {
      this.currentContent = "";
      this.viewerEl.innerHTML = `<div style="color:#E25C5C">Failed to load ${escapeHtml(path)}: ${escapeHtml(e instanceof Error ? e.message : String(e))}</div>`;
      return;
    }
    this.editing = false;
    this.saveBtn.style.display = "none";
    this.toggleBtn.textContent = "Edit";
    this.editorEl.style.display = "none";
    this.viewerEl.style.display = "";
    (this.headerEl.querySelector(".atel-markdown-view__title") as HTMLElement).textContent = path;
    this.renderViewer();
  }

  private renderViewer(): void {
    const { frontmatter, body } = splitFrontmatter(this.currentContent);
    let html = "";
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      html += `<table class="atel-markdown-view__frontmatter">`;
      for (const [k, v] of Object.entries(frontmatter)) {
        html += `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`;
      }
      html += `</table>`;
    }
    html += renderMarkdownBody(body);
    this.viewerEl.innerHTML = html;
  }

  private toggleEdit(): void {
    if (!this.currentPath) return;
    this.editing = !this.editing;
    if (this.editing) {
      this.editorEl.value = this.currentContent;
      this.editorEl.style.display = "";
      this.viewerEl.style.display = "none";
      this.saveBtn.style.display = "";
      this.toggleBtn.textContent = "Cancel";
    } else {
      this.editorEl.style.display = "none";
      this.viewerEl.style.display = "";
      this.saveBtn.style.display = "none";
      this.toggleBtn.textContent = "Edit";
    }
  }

  private async save(): Promise<void> {
    if (!this.currentPath) return;
    const next = this.editorEl.value;
    try {
      await saveText(this.currentPath, next);
      this.currentContent = next;
      this.toggleEdit(); // exit edit mode
      this.renderViewer();
    } catch (err) {
      alert("Save failed: " + (err instanceof Error ? err.message : String(err)));
    }
  }
}

/** Split frontmatter YAML (---...---) from body. Returns empty frontmatter when none. */
function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, body: raw };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { endIdx = i; break; }
  }
  if (endIdx === -1) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (let i = 1; i < endIdx; i++) {
    const m = lines[i].match(/^([^:]+):\s*(.*)$/);
    if (m) frontmatter[m[1].trim()] = m[2].trim();
  }
  return {
    frontmatter,
    body: lines.slice(endIdx + 1).join("\n").replace(/^\n+/, ""),
  };
}

/**
 * Hand-rolled minimal markdown → HTML converter. Supports the subset that
 * DESIGN/SCRIPT/STORYBOARD artifacts actually use:
 *   - # / ## / ### headings
 *   - blockquotes (> )
 *   - bulleted lists (- ) and numbered lists (1. )
 *   - inline `code`, **bold**, *italic*
 *   - fenced code blocks (```)
 *   - paragraphs (blank-line separated)
 *
 * No new dep per the spec. Falls back to escaped plaintext for unknown input.
 */
function renderMarkdownBody(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];

  const inlineFmt = (s: string): string => {
    let out = escapeHtml(s);
    // `code`
    out = out.replace(/`([^`]+)`/g, '<code class="atel-md-code">$1</code>');
    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // *italic*
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return out;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        out.push(`<pre class="atel-md-pre"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level} class="atel-md-h${level}">${inlineFmt(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote class="atel-md-quote">${inlineFmt(buf.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (line.match(/^\s*-\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*-\s+/)) {
        items.push(`<li>${inlineFmt(lines[i].replace(/^\s*-\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="atel-md-list">${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        items.push(`<li>${inlineFmt(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="atel-md-list">${items.join("")}</ol>`);
      continue;
    }

    // Blank line
    if (line.trim().length === 0) { i++; continue; }

    // Paragraph
    const paraBuf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim().length > 0 && !lines[i].match(/^(#{1,6}|>|-|\d+\.)\s/)) {
      paraBuf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inlineFmt(paraBuf.join(" "))}</p>`);
  }

  return out.join("\n");
}

// ─── #studio-media-preview ───────────────────────────────────────────

/**
 * Transcript word — narrowed shape used by the inline transcript pane. Fields
 * are a subset of `VideoTranscript`'s schema; we only consume what's needed
 * for rendering + click-to-seek.
 */
interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  words: TranscriptWord[];
}

interface TranscriptShape {
  language?: string;
  segments: TranscriptSegment[];
}

/**
 * MediaPreview — single-column for image/font/other, audio-with-transcript,
 * and any media entry without a transcript. For video/audio entries that
 * have a transcript, render a two-column split: player on the left,
 * formatted transcript on the right with click-to-seek + timeupdate-driven
 * current-word highlight.
 */
class MediaPreview {
  readonly el: HTMLElement;
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;
  private mediaEl: HTMLMediaElement | HTMLImageElement | null = null;
  private wordSpans: Array<{ start: number; end: number; el: HTMLElement }> = [];
  private currentWordEl: HTMLElement | null = null;
  private timeupdateHandler: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "atel-media-preview";

    this.headerEl = document.createElement("div");
    this.headerEl.className = "atel-media-preview__header";
    this.el.appendChild(this.headerEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "atel-media-preview__body";
    this.el.appendChild(this.bodyEl);

    parent.appendChild(this.el);
  }

  load(entry: ProjectMediaEntry): void {
    this.detachTimeupdate();
    this.wordSpans = [];
    this.currentWordEl = null;

    this.headerEl.innerHTML = `<div class="atel-media-preview__title">${escapeHtml(entry.name)}</div>
      <div class="atel-media-preview__meta">${entry.kind} · ${formatBytes(entry.sizeBytes)}${entry.hasTranscript ? ' · ✓ transcript' : ''}${entry.hasNotes ? ' · notes' : ''}</div>`;

    this.bodyEl.innerHTML = "";
    const src = `/api/file?path=${encodeURIComponent(entry.path)}`;

    // Transcript split applies only to time-based media (video / audio).
    // Images, fonts, and "other" stay single-column even if a transcript
    // were somehow associated.
    const isTimeBased = entry.kind === "video" || entry.kind === "audio";
    const splitLayout = isTimeBased && entry.hasTranscript && entry.transcriptPath !== null;

    if (splitLayout) {
      this.bodyEl.classList.add("atel-media-preview__body--split");
    } else {
      this.bodyEl.classList.remove("atel-media-preview__body--split");
    }

    // Build the player column (left when split, the sole column otherwise).
    const playerCol = document.createElement("div");
    playerCol.className = "atel-media-preview__player";

    if (entry.kind === "video") {
      const v = document.createElement("video");
      v.src = src;
      v.controls = true;
      v.className = "atel-media-preview__video";
      playerCol.appendChild(v);
      this.mediaEl = v;
    } else if (entry.kind === "image") {
      const img = document.createElement("img");
      img.src = src;
      img.className = "atel-media-preview__image";
      playerCol.appendChild(img);
      this.mediaEl = img;
    } else if (entry.kind === "audio") {
      const a = document.createElement("audio");
      a.src = src;
      a.controls = true;
      a.className = "atel-media-preview__audio";
      playerCol.appendChild(a);
      this.mediaEl = a;
    } else {
      playerCol.innerHTML = `<div class="atel-media-preview__noop">No preview available for ${escapeHtml(entry.kind)} files.</div>`;
      this.mediaEl = null;
    }

    this.bodyEl.appendChild(playerCol);

    if (splitLayout && entry.transcriptPath) {
      const transcriptCol = document.createElement("div");
      transcriptCol.className = "atel-media-preview__transcript";
      transcriptCol.innerHTML = `<div class="atel-media-preview__transcript-loading">Loading transcript…</div>`;
      this.bodyEl.appendChild(transcriptCol);
      void this.renderTranscript(transcriptCol, entry.transcriptPath);
    }
  }

  /**
   * Fetch + render the per-media transcript into the right column. Wires:
   *   - word-span click → seek the player to `word.start`
   *   - player `timeupdate` → highlight the currently-playing word
   */
  private async renderTranscript(host: HTMLElement, transcriptPath: string): Promise<void> {
    try {
      const text = await fetchText("/api/file?path=" + encodeURIComponent(transcriptPath));
      const transcript = JSON.parse(text) as TranscriptShape;

      host.innerHTML = "";
      this.wordSpans = [];

      for (const seg of transcript.segments) {
        const segEl = document.createElement("div");
        segEl.className = "atel-media-preview__transcript-segment";

        const timeEl = document.createElement("div");
        timeEl.className = "atel-media-preview__transcript-time";
        timeEl.textContent = `${formatTime(seg.start)} → ${formatTime(seg.end)}`;
        segEl.appendChild(timeEl);

        const textEl = document.createElement("div");
        textEl.className = "atel-media-preview__transcript-text";
        for (const w of seg.words) {
          const wSpan = document.createElement("span");
          wSpan.className = "atel-transcript-word";
          wSpan.textContent = w.text + " ";
          wSpan.title = formatTime(w.start);
          wSpan.addEventListener("click", () => this.seekTo(w.start));
          textEl.appendChild(wSpan);
          this.wordSpans.push({ start: w.start, end: w.end, el: wSpan });
        }
        segEl.appendChild(textEl);
        host.appendChild(segEl);
      }

      this.attachTimeupdate();
    } catch (err) {
      host.innerHTML = `<div style="color:#E25C5C;padding:12px">Failed to load transcript: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }

  /** Set the player's currentTime to `t` (no-op if media element is image/none). */
  private seekTo(t: number): void {
    const m = this.mediaEl;
    if (!m || !("currentTime" in m)) return;
    try {
      (m as HTMLMediaElement).currentTime = Math.max(0, t);
      // Try to start playback for an immediate response — fail silently if
      // the browser blocks (no user-gesture etc.).
      void (m as HTMLMediaElement).play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }

  /** Wire timeupdate → current-word highlight. Idempotent — detaches any prior listener. */
  private attachTimeupdate(): void {
    this.detachTimeupdate();
    const m = this.mediaEl;
    if (!m || !("currentTime" in m)) return;
    const media = m as HTMLMediaElement;
    const handler = (): void => {
      const t = media.currentTime;
      // Linear scan — word counts are small enough (transcript pages, not
      // novels) and most timeupdate events land near the previous match.
      let match: HTMLElement | null = null;
      for (const w of this.wordSpans) {
        if (t >= w.start && t < w.end) { match = w.el; break; }
      }
      if (match === this.currentWordEl) return;
      if (this.currentWordEl) this.currentWordEl.classList.remove("atel-transcript-word--current");
      if (match) match.classList.add("atel-transcript-word--current");
      this.currentWordEl = match;
    };
    media.addEventListener("timeupdate", handler);
    this.timeupdateHandler = handler;
  }

  private detachTimeupdate(): void {
    if (this.timeupdateHandler && this.mediaEl && "removeEventListener" in this.mediaEl) {
      (this.mediaEl as HTMLMediaElement).removeEventListener("timeupdate", this.timeupdateHandler);
    }
    this.timeupdateHandler = null;
  }

  destroy(): void {
    this.detachTimeupdate();
    if (this.mediaEl && "pause" in this.mediaEl) {
      try { (this.mediaEl as HTMLMediaElement).pause(); } catch { /* ignore */ }
    }
  }
}

// ─── #studio-transcript-viewer ───────────────────────────────────────

class TranscriptViewer {
  readonly el: HTMLElement;
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "atel-transcript-viewer";

    this.headerEl = document.createElement("div");
    this.headerEl.className = "atel-transcript-viewer__header";
    this.el.appendChild(this.headerEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "atel-transcript-viewer__body";
    this.el.appendChild(this.bodyEl);

    parent.appendChild(this.el);
  }

  async load(path: string, meta: ProjectTranscriptEntry): Promise<void> {
    try {
      const text = await fetchText("/api/file?path=" + encodeURIComponent(path));
      const transcript = JSON.parse(text) as {
        language?: string;
        segments: Array<{
          text: string;
          start: number;
          end: number;
          words: Array<{ text: string; start: number; end: number; confidence?: number }>;
        }>;
      };

      this.headerEl.innerHTML = `<div class="atel-transcript-viewer__title">${escapeHtml(meta.name)}</div>
        <div class="atel-transcript-viewer__meta">
          ${transcript.segments.length} segments · ${meta.language ?? "—"} · ${meta.totalDuration?.toFixed(1) ?? "?"}s
        </div>`;

      this.bodyEl.innerHTML = "";
      for (const seg of transcript.segments) {
        const segEl = document.createElement("div");
        segEl.className = "atel-transcript-viewer__segment";

        const timeEl = document.createElement("div");
        timeEl.className = "atel-transcript-viewer__time";
        timeEl.textContent = `${formatTime(seg.start)} → ${formatTime(seg.end)}`;
        segEl.appendChild(timeEl);

        const textEl = document.createElement("div");
        textEl.className = "atel-transcript-viewer__text";
        for (const w of seg.words) {
          const wSpan = document.createElement("span");
          wSpan.className = "atel-transcript-viewer__word atel-transcript-word";
          wSpan.textContent = w.text + " ";
          wSpan.title = `${formatTime(w.start)} → ${formatTime(w.end)}`;
          textEl.appendChild(wSpan);
        }
        segEl.appendChild(textEl);

        this.bodyEl.appendChild(segEl);
      }
    } catch (err) {
      this.bodyEl.innerHTML = `<div style="color:#E25C5C">Failed to load: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }
}

// ─── #studio-drop-zone ──────────────────────────────────────────────

interface DropZoneCallbacks {
  getActiveProject: () => string | null;
  /**
   * Project-relative path of the .atelier doc currently loaded in the canvas,
   * or `null` when nothing is loaded. The drop zone uses this to decide
   * whether a canvas-area drop attaches to the loaded doc (`?targetDocPath=`)
   * or falls back to the legacy "scaffold a new <slug>.atelier" path.
   */
  getCurrentDocPath: () => string | null;
  /**
   * Bounding-rect refs for the two visual drop targets. The DropZone reads
   * these once per drag-enter to position the canvas vs sidebar highlight
   * panes and to decide which target absorbed the drop. Returning the
   * elements (instead of cached rects) keeps the position fresh across
   * sidebar resize / scroll without re-binding callbacks.
   */
  getSidebarElement: () => HTMLElement | null;
  getCanvasElement: () => HTMLElement | null;
  onIngestStart: (filename: string) => void;
  onIngestProgress: (phase: string, info?: { received?: number; total?: number | null; error?: string }) => void;
  onIngestDone: (filename: string) => void;
}

/**
 * Full-window drag-and-drop overlay with TWO visual targets:
 *
 *   1. **Canvas pane** — when the user has a doc loaded, dropping here
 *      POSTs `?targetDocPath=<currentDocPath>` so the media is appended to
 *      the loaded doc (compose-video adds a clip; audio adds an AudioVisual
 *      layer). Image-into-loaded-doc is rejected by the server (v1).
 *   2. **Sidebar pane** — drops here ALWAYS scaffold a new <slug>.atelier
 *      (legacy / page-level behaviour). No `targetDocPath` is sent.
 *
 * When no doc is loaded, the canvas pane silently degrades to the
 * sidebar-style "new doc" behaviour so the page-level UX stays familiar.
 *
 * The split is driven by `e.clientX/clientY` against the sidebar's bounding
 * rect — cursor in the sidebar bounds at drop time → sidebar route, else
 * canvas route. We keep ONE global drag tracker so the overlay appears
 * reliably regardless of where the cursor lands first.
 */
class DropZone {
  readonly el: HTMLElement;
  private hoverDepth = 0;
  private sidebarPane: HTMLElement;
  private canvasPane: HTMLElement;

  constructor(private cb: DropZoneCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "atel-drop-zone";
    this.el.innerHTML = `
      <div class="atel-drop-zone__pane atel-drop-zone__pane--sidebar">
        <div class="atel-drop-zone__inner">
          <div class="atel-drop-zone__icon">＋</div>
          <div class="atel-drop-zone__title">New doc in <span class="atel-drop-zone__project">…</span></div>
          <div class="atel-drop-zone__hint">Drop here to create a new doc</div>
        </div>
      </div>
      <div class="atel-drop-zone__pane atel-drop-zone__pane--canvas">
        <div class="atel-drop-zone__inner">
          <div class="atel-drop-zone__icon">⤓</div>
          <div class="atel-drop-zone__title atel-drop-zone__title--canvas">…</div>
          <div class="atel-drop-zone__hint atel-drop-zone__hint--canvas">Drop video / audio to extend</div>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);
    this.sidebarPane = this.el.querySelector(".atel-drop-zone__pane--sidebar") as HTMLElement;
    this.canvasPane = this.el.querySelector(".atel-drop-zone__pane--canvas") as HTMLElement;

    window.addEventListener("dragenter", (e) => this.onDragEnter(e));
    window.addEventListener("dragover", (e) => this.onDragOver(e));
    window.addEventListener("dragleave", (e) => this.onDragLeave(e));
    window.addEventListener("drop", (e) => { void this.onDrop(e); });
  }

  /** Read the current sidebar / canvas rects and position the highlight panes. */
  private layoutPanes(): void {
    const sidebarEl = this.cb.getSidebarElement();
    const canvasEl = this.cb.getCanvasElement();
    if (sidebarEl) {
      const r = sidebarEl.getBoundingClientRect();
      Object.assign(this.sidebarPane.style, {
        left: `${r.left}px`, top: `${r.top}px`,
        width: `${r.width}px`, height: `${r.height}px`,
      });
      this.sidebarPane.style.display = "flex";
    } else {
      this.sidebarPane.style.display = "none";
    }
    if (canvasEl) {
      const r = canvasEl.getBoundingClientRect();
      Object.assign(this.canvasPane.style, {
        left: `${r.left}px`, top: `${r.top}px`,
        width: `${r.width}px`, height: `${r.height}px`,
      });
      this.canvasPane.style.display = "flex";
    } else {
      this.canvasPane.style.display = "none";
    }

    // Canvas pane label reflects the loaded-doc state — "Add to <doc>" when a
    // doc is loaded; "New doc here" otherwise (degraded mode).
    const docPath = this.cb.getCurrentDocPath();
    const titleEl = this.canvasPane.querySelector(".atel-drop-zone__title--canvas") as HTMLElement;
    const hintEl = this.canvasPane.querySelector(".atel-drop-zone__hint--canvas") as HTMLElement;
    if (docPath) {
      titleEl.textContent = `Add to ${docPath}`;
      hintEl.textContent = "Video clip → appended · audio → music layer";
    } else {
      titleEl.textContent = "New doc";
      hintEl.textContent = "No doc loaded — drop creates a new <slug>.atelier";
    }
  }

  private onDragEnter(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes("Files")) return;
    this.hoverDepth++;
    const project = this.cb.getActiveProject();
    if (!project) return;
    (this.el.querySelector(".atel-drop-zone__project") as HTMLElement).textContent = project;
    this.layoutPanes();
    this.el.classList.add("atel-drop-zone--visible");
  }

  private onDragOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    // Highlight whichever pane the cursor is over right now.
    this.updateHover(e.clientX, e.clientY);
  }

  private onDragLeave(_e: DragEvent): void {
    this.hoverDepth = Math.max(0, this.hoverDepth - 1);
    if (this.hoverDepth === 0) {
      this.el.classList.remove("atel-drop-zone--visible");
      this.clearHover();
    }
  }

  /** Add `--active` to the pane the cursor is over; remove from the other. */
  private updateHover(x: number, y: number): void {
    const inSidebar = this.pointInRect(x, y, this.cb.getSidebarElement());
    this.sidebarPane.classList.toggle("atel-drop-zone__pane--active", inSidebar);
    this.canvasPane.classList.toggle("atel-drop-zone__pane--active", !inSidebar);
  }

  private clearHover(): void {
    this.sidebarPane.classList.remove("atel-drop-zone__pane--active");
    this.canvasPane.classList.remove("atel-drop-zone__pane--active");
  }

  private pointInRect(x: number, y: number, el: HTMLElement | null): boolean {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }

  private async onDrop(e: DragEvent): Promise<void> {
    this.hoverDepth = 0;
    this.el.classList.remove("atel-drop-zone--visible");
    this.clearHover();
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();

    const project = this.cb.getActiveProject();
    if (!project) {
      alert("No active project — select one in the sidebar first.");
      return;
    }

    // Sidebar drop → new doc (no targetDocPath). Canvas drop with a loaded
    // doc → attach to that doc. Canvas drop with no loaded doc → fall through
    // to the new-doc path (preserve legacy "drop anywhere" behaviour).
    const droppedInSidebar = this.pointInRect(e.clientX, e.clientY, this.cb.getSidebarElement());
    const currentDocPath = this.cb.getCurrentDocPath();
    const useTarget = !droppedInSidebar && currentDocPath !== null;

    const file = e.dataTransfer.files[0];
    this.cb.onIngestStart(file.name);
    try {
      const url = useTarget
        ? `/api/media/ingest?targetDocPath=${encodeURIComponent(currentDocPath!)}`
        : "/api/media/ingest";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-atelier-project": project,
          "x-atelier-filename": file.name,
        },
        body: await file.arrayBuffer(),
      });
      if (!res.ok) {
        const msg = await res.text();
        this.cb.onIngestProgress("error", { error: msg });
        return;
      }
      this.cb.onIngestDone(file.name);
    } catch (err) {
      this.cb.onIngestProgress("error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ─── App shell ──────────────────────────────────────────────────────

export async function bootWorkspaceApp(): Promise<void> {
  injectStyles();

  const root = document.getElementById("studio")!;
  root.innerHTML = "";

  // Two-column shell: sidebar + main panel.
  const shell = document.createElement("div");
  shell.className = "atel-workspace-shell";
  root.appendChild(shell);

  const mainPanel = document.createElement("div");
  mainPanel.className = "atel-workspace-main";

  // Status bar (ingest progress + active project label)
  const statusBar = document.createElement("div");
  statusBar.className = "atel-workspace-status";
  statusBar.textContent = "Loading workspace…";

  const mainBody = document.createElement("div");
  mainBody.className = "atel-workspace-body";

  mainPanel.appendChild(statusBar);
  mainPanel.appendChild(mainBody);

  let activeProjectName: string | null = null;
  /**
   * Project-relative path of the .atelier doc currently rendered in the
   * canvas, or `null` when nothing is loaded (empty project, or active doc
   * was deleted with no fallback available). Post-pivot (Wave 1+) projects
   * can be doc-less — Kit-E removed the auto-`project.atelier` creation — so
   * the canvas must tolerate the empty state. See `showEmptyCanvas()`.
   */
  let currentDocPath: string | null = null;
  /**
   * Doc-kind metadata for the currently-loaded doc — sourced from the sidebar's
   * `DocListEntry.kind` (the AtelierDocument schema itself has no `kind` field;
   * it lives on the doc-list metadata). `null` whenever no doc is loaded.
   *
   * Drives Kit-K's "+ add slide" canvas affordance: the button is rendered
   * only when `currentDocKind === "carousel"`.
   */
  let currentDocKind: "video" | "image" | "carousel" | null = null;

  const sidebar = new WorkspaceSidebar(shell, {
    onSelectProject: async (name) => {
      try {
        await postJson("/api/workspace/active", { name });
        await sidebar.refresh();
        activeProjectName = name;
        await openProjectDoc(name);
      } catch (err) {
        statusBar.textContent = `Failed to activate ${name}: ${err instanceof Error ? err.message : err}`;
      }
    },
    onSelectDoc: (name, entry) => openProjectDoc(name, entry.path),
    onSelectArtifact: (projectName, kind) => {
      const file = kind === "design" ? "DESIGN.md" : kind === "script" ? "SCRIPT.md" : "STORYBOARD.md";
      openMarkdown(`${projectName}/${file}`);
    },
    onSelectMedia: (projectName, entry) => openMedia(entry),
    onSelectTranscript: (projectName, entry) => openTranscript(entry),
    onCreateProject: async () => {
      const raw = window.prompt("New project name");
      if (!raw) return;
      const name = raw.trim();
      if (!name) return;
      try {
        await postJson("/api/workspace/projects", { name, activate: true });
        await sidebar.refresh();
        activeProjectName = name;
        await openProjectDoc(name);
      } catch (err) {
        alert("Failed to create project: " + (err instanceof Error ? err.message : err));
      }
    },
    onCreateDoc: async (projectName) => {
      // Post-pivot: the dialog ONLY creates docs at project root. Slide
      // creation lives in the carousel-doc canvas toolbar (Kit-K) — not here.
      const selection = await NewDocDialog.prompt();
      if (!selection) return;
      const body = { name: selection.name, kind: selection.kind };
      try {
        const result = await postJson<{ docPath: string }>(
          `/api/project/${encodeURIComponent(projectName)}/docs`,
          body,
        );
        statusBar.textContent = `Created ${result.docPath}`;
        // Sidebar will refetch via `doc:list:changed` WS broadcast.
        // Belt-and-braces: also refresh inline in case the WS bridge is down.
        await sidebar.refreshProject(projectName);
      } catch (err) {
        alert("Failed to create doc: " + (err instanceof Error ? err.message : err));
      }
    },
    onDuplicateDoc: async (projectName, entry) => {
      try {
        // Post-pivot: docs are flat root-level files. Duplicate copies the
        // file only; no SlideRef plumbing (carousel slide management is
        // Kit-K's territory in the carousel-doc toolbar).
        await postJson(
          `/api/project/${encodeURIComponent(projectName)}/docs/duplicate?path=${encodeURIComponent(entry.path)}`,
          {},
        );
        await sidebar.refreshProject(projectName);
        statusBar.textContent = `Duplicated ${entry.path}`;
      } catch (err) {
        alert("Failed to duplicate doc: " + (err instanceof Error ? err.message : err));
      }
    },
    onDeleteDoc: async (projectName, entry) => {
      // Pre-confirm copy — generic. The actual cascade counts
      // (slideRefsRemoved, refLayersDangling) are only known AFTER the server
      // processes the DELETE; surface them in the status bar on success
      // rather than pretending to know them up-front.
      const bodyCopy = `Delete <code>${escapeHtml(entry.path)}</code>? ` +
        `Any SlideRef entries pointing at it will be auto-scrubbed; ` +
        `RefVisual layers pointing at it will be left dangling.`;
      const ok = await ConfirmDialog.prompt({
        title: `Delete "${entry.path}"?`,
        body: bodyCopy,
        confirmLabel: "Delete",
      });
      if (!ok) return;
      try {
        const report = await deleteJson<DocDeleteCascadeReport>(
          `/api/project/${encodeURIComponent(projectName)}/docs?path=${encodeURIComponent(entry.path)}`,
        );
        // Surface cascade counts in the status bar — both buckets are workspace-
        // wide effects a creator likely wants to know about after the fact:
        //   - slideRefsRemoved → SlideRefs auto-scrubbed from OTHER carousels
        //     (this matches the spec's "Plus N slide references in M other
        //     projects" copy);
        //   - refLayersDangling → RefVisual layers still pointing at the now-
        //     deleted doc (NOT auto-removed — surfaced as a soft warning).
        const otherSlideProjects = new Set(
          report.slideRefsRemoved
            .filter((r) => r.project !== projectName)
            .map((r) => r.project),
        );
        const parts: string[] = [];
        if (report.slideRefsRemoved.length > 0 && otherSlideProjects.size > 0) {
          parts.push(`${report.slideRefsRemoved.length} slide ref${report.slideRefsRemoved.length === 1 ? "" : "s"} in ${otherSlideProjects.size} other project${otherSlideProjects.size === 1 ? "" : "s"}`);
        }
        if (report.refLayersDangling.length > 0) {
          parts.push(`${report.refLayersDangling.length} dangling RefVisual layer${report.refLayersDangling.length === 1 ? "" : "s"}`);
        }
        const extra = parts.length > 0 ? ` (plus ${parts.join("; ")})` : "";
        statusBar.textContent = `Deleted ${entry.path}${extra}`;
        // The WS broadcast will refresh other clients; refresh inline too.
        await sidebar.refreshProject(projectName);
      } catch (err) {
        alert("Failed to delete doc: " + (err instanceof Error ? err.message : err));
      }
    },
    onDeleteMedia: async (projectName, entry) => {
      const ok = await ConfirmDialog.prompt({
        title: `Delete "${entry.name}"?`,
        body: `This will remove the media file, its transcript (if any), its sidecar notes, ` +
              `and any layers in project.atelier that reference it. This cannot be undone.`,
        confirmLabel: "Delete",
      });
      if (!ok) return;
      try {
        await fetch(`/api/project/${encodeURIComponent(projectName)}/media?file=${encodeURIComponent(entry.name)}`, { method: "DELETE" });
        await sidebar.refresh();
        clearMain();
        statusBar.textContent = `Deleted ${entry.name}`;
      } catch (err) {
        alert("Failed to delete: " + (err instanceof Error ? err.message : err));
      }
    },
    onDeleteTranscript: async (projectName, entry) => {
      const ok = await ConfirmDialog.prompt({
        title: `Delete "${entry.name}"?`,
        body: `The transcript file will be removed. The associated media file stays put — ` +
              `you can re-transcribe later. This cannot be undone.`,
        confirmLabel: "Delete",
      });
      if (!ok) return;
      try {
        await fetch(`/api/file?path=${encodeURIComponent(entry.path)}`, { method: "DELETE" });
        await sidebar.refresh();
        clearMain();
        statusBar.textContent = `Deleted ${entry.name}`;
      } catch (err) {
        alert("Failed to delete: " + (err instanceof Error ? err.message : err));
      }
    },
    onDeleteArtifact: async (projectName, kind, path) => {
      const label = kind === "design" ? "DESIGN.md" : kind === "script" ? "SCRIPT.md" : "STORYBOARD.md";
      const ok = await ConfirmDialog.prompt({
        title: `Delete ${label}?`,
        body: `The artifact file will be removed. This cannot be undone.`,
        confirmLabel: "Delete",
      });
      if (!ok) return;
      try {
        await fetch(`/api/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
        await sidebar.refresh();
        clearMain();
        statusBar.textContent = `Deleted ${label}`;
      } catch (err) {
        alert("Failed to delete: " + (err instanceof Error ? err.message : err));
      }
    },
    onDeleteProject: async (name) => {
      const ok = await ConfirmDialog.prompt({
        title: `Delete project "${name}"?`,
        body: `This will remove the entire project directory (artifacts, media, transcripts, ` +
              `document) IRREVERSIBLY. Type the project name to confirm.`,
        confirmLabel: "Delete project",
        requireTypeName: name,
      });
      if (!ok) return;
      try {
        await fetch(`/api/project/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (activeProjectName === name) activeProjectName = null;
        await sidebar.refresh();
        clearMain();
        statusBar.textContent = `Deleted project ${name}`;
      } catch (err) {
        alert("Failed to delete project: " + (err instanceof Error ? err.message : err));
      }
    },
  });

  shell.appendChild(mainPanel);

  // Current main-panel state
  let currentStudio: AtelierStudio | null = null;
  let currentMarkdown: MarkdownView | null = null;
  let currentMedia: MediaPreview | null = null;
  let currentTranscript: TranscriptViewer | null = null;

  const clearMain = (): void => {
    if (currentStudio) { currentStudio.destroy(); currentStudio = null; }
    if (currentMedia) { currentMedia.destroy(); currentMedia = null; }
    currentMarkdown = null;
    currentTranscript = null;
    mainBody.innerHTML = "";
    // Reset doc-kind metadata too — `openProjectDoc` resets it on the very
    // next line for the doc-load path, but non-doc panels (markdown / media /
    // transcript) leave the canvas without any doc loaded, so the stale kind
    // would otherwise leak across panel switches.
    currentDocKind = null;
    // Drop the "← loaded" marker — non-doc panels (media / transcript /
    // markdown) don't correspond to any sidebar doc row.
    sidebar.setCurrentDocPath(null);
  };

  /**
   * #canvas-empty-state — centered, muted placeholder shown in the main panel
   * when no doc is loaded. Post-pivot projects can be doc-less (Kit-E removes
   * the auto-`project.atelier` creation), and selecting such a project should
   * NOT crash the canvas. Also the fallback when an active doc is deleted and
   * no other doc exists to swap in.
   *
   * The Reset / Undo / Redo / YAML / Editor toolbar lives inside the
   * `AtelierStudio` component (instantiated in `openProjectDoc`). By not
   * mounting a Studio here, the toolbar is absent for free — no per-button
   * gating needed.
   */
  function showEmptyCanvas(): void {
    clearMain();
    currentDocPath = null;
    currentDocKind = null;
    // `clearMain()` already calls `sidebar.setCurrentDocPath(null)`; no-op
    // belt-and-braces — the marker stays clear.
    statusBar.textContent = "No document loaded.";

    const empty = document.createElement("div");
    empty.className = "atel-canvas-empty";
    empty.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "height:100%",
      "width:100%",
      "padding:48px 24px",
      "text-align:center",
      "color:var(--atel-text-muted, #A89F95)",
      `font-family:${theme.fontFamily}`,
      "font-size:15px",
      "line-height:1.6",
      "letter-spacing:0.01em",
    ].join(";");

    const heading = document.createElement("div");
    heading.style.cssText = "font-size:18px;margin-bottom:18px;color:var(--atel-text-muted, #A89F95)";
    heading.textContent = "No document loaded.";
    empty.appendChild(heading);

    const body = document.createElement("div");
    body.style.cssText = "max-width:380px;color:var(--atel-text-muted, #A89F95);opacity:0.85";
    // Two lines, mirroring the spec copy. The "+ new doc" string matches the
    // sidebar button label (atel-workspace-sidebar__new-btn--inline) verbatim
    // so the visual cue resolves.
    body.innerHTML =
      "Click a doc in the sidebar to start editing,<br>" +
      "or use <span style=\"font-family:" + theme.fontMono + ";color:var(--atel-text, #F5F0EB)\">+ new doc</span> to create one.";
    empty.appendChild(body);

    mainBody.appendChild(empty);
  }

  async function openProjectDoc(name: string, docPath?: string): Promise<void> {
    // Post-pivot: when no explicit doc is requested, pick the first doc the
    // sidebar knows about. Empty projects (Kit-E) and projects whose active
    // doc was just deleted (WS fallback below) end up here with no docs —
    // surface the empty-state visual instead of crashing on a missing file.
    let resolvedDocPath = docPath;
    if (resolvedDocPath === undefined) {
      const docs = sidebar.getDocs(name);
      if (docs.length === 0) {
        showEmptyCanvas();
        return;
      }
      resolvedDocPath = docs[0].path;
    }

    clearMain();
    const path = `${name}/${resolvedDocPath}`;
    statusBar.textContent = path;
    currentDocPath = resolvedDocPath;
    sidebar.setCurrentDocPath(resolvedDocPath);
    // Resolve the doc's kind from the sidebar's cached doc list (the schema
    // itself has no `kind` field — it's doc-list metadata, set at create-time
    // and surfaced by the server). Falls back to null when the doc isn't in
    // the cache yet (rare race; the button just won't render that frame).
    currentDocKind = sidebar.getDocs(name).find((d) => d.path === resolvedDocPath)?.kind ?? null;
    try {
      const content = await fetchText("/api/file?path=" + encodeURIComponent(path));
      const parsed = parseAtelier(content);
      if (!parsed.success) {
        mainBody.innerHTML = `<div style="padding:24px;color:#E25C5C">Parse error: ${escapeHtml(parsed.errors.map(e => e.path + ": " + e.message).join("; "))}</div>`;
        return;
      }
      // Save indicator + debounced save inline; matches inline-app.ts pattern.
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      currentStudio = new AtelierStudio(mainBody, {
        mode: "full",
        initialTab: "editor",
        allowSave: true,
        onDocumentChange: (doc) => {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            void saveText(path, serializeAtelier(doc as never)).catch((err) => {
              console.error("save failed:", err);
            });
          }, 800);
        },
      });
      currentStudio.setTheme(theme);
      currentStudio.loadDocument(parsed.data as Parameters<AtelierStudio["loadDocument"]>[0]);
      // Kit-K: carousel docs get a "+ add slide" overlay button anchored to
      // the canvas top-right. The button opens NewDocDialog (retitled "Add
      // slide") and POSTs with `asCarouselSlide: true` so the new doc is
      // anchored into this carousel's slides[] server-side. v1 scope: only
      // "create new doc as slide" — the "pick existing .atelier" tab is v1.1.
      if (currentDocKind === "carousel") {
        mountAddSlideButton(name, resolvedDocPath);
      }
    } catch (err) {
      mainBody.innerHTML = `<div style="padding:24px;color:#E25C5C">Failed to load: ${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }

  /**
   * Render the "+ add slide" button as an absolute-positioned overlay anchored
   * to the top-right of the canvas (`mainBody` is `position:relative`). The
   * button is a sibling of the AtelierStudio root, so it stays on screen as
   * the studio's own toolbar lives below it — and `clearMain()`'s
   * `innerHTML = ""` sweeps it up on the next doc load.
   *
   * On click: open NewDocDialog retitled "Add slide", then POST
   * `/api/project/:name/docs` with `asCarouselSlide: true` and the carousel
   * doc's path. The WS `doc:list:changed` broadcast triggers the sidebar
   * refresh + canvas reload; server-side cycle-detection (composeCarousel
   * Project) handles invalid pairings — surface its error inline.
   */
  function mountAddSlideButton(projectName: string, carouselDocPath: string): void {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "atel-add-slide-btn";
    btn.textContent = "+ add slide";
    // Positioned below the studio's own toolbar (which renders Export + YAML/
    // Editor tabs along the top); a top-right anchor here would collide with
    // those controls. ~56px clears the toolbar's height with a small margin.
    btn.style.cssText = [
      "position:absolute",
      "top:56px",
      "right:16px",
      "z-index:10",
      `font-family:${theme.fontMono}`,
      "font-size:12px",
      "letter-spacing:0.04em",
      `color:${theme.textAccent}`,
      `background:${theme.buttonBg}`,
      `border:1px solid ${theme.border}`,
      "border-radius:4px",
      "padding:6px 12px",
      "cursor:pointer",
    ].join(";");
    btn.addEventListener("mouseenter", () => {
      btn.style.background = theme.buttonHover;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = theme.buttonBg;
    });
    btn.addEventListener("click", async () => {
      const selection = await NewDocDialog.prompt({ title: "Add slide" });
      if (!selection) return;
      try {
        const result = await postJson<{ docPath: string }>(
          `/api/project/${encodeURIComponent(projectName)}/docs`,
          {
            name: selection.name,
            kind: selection.kind,
            asCarouselSlide: true,
            carouselDocPath,
          },
        );
        statusBar.textContent = `Added slide ${result.docPath}`;
        // Refresh sidebar (the WS `doc:list:changed` broadcast handles other
        // clients; inline refresh is belt-and-braces). The WS handler only
        // reloads the canvas when the active doc DISAPPEARS — the carousel
        // doc still exists with a new slides[] entry, so we re-open it
        // explicitly to surface the updated slide count in the canvas.
        await sidebar.refreshProject(projectName);
        await openProjectDoc(projectName, carouselDocPath);
      } catch (err) {
        alert("Failed to add slide: " + (err instanceof Error ? err.message : err));
      }
    });
    mainBody.appendChild(btn);
  }

  function openMarkdown(path: string): void {
    clearMain();
    statusBar.textContent = path;
    currentMarkdown = new MarkdownView(mainBody);
    void currentMarkdown.load(path);
  }

  function openMedia(entry: ProjectMediaEntry): void {
    clearMain();
    statusBar.textContent = entry.path;
    currentMedia = new MediaPreview(mainBody);
    currentMedia.load(entry);
    // Inline delete affordance on the preview header — discoverable without
    // needing the sidebar right-click.
    const headerEl = currentMedia.el.querySelector(".atel-media-preview__header");
    if (headerEl && activeProjectName) {
      const projName = activeProjectName;
      const btn = document.createElement("button");
      btn.className = "atel-btn atel-btn--destructive";
      btn.style.cssText = "margin-left:auto;padding:6px 12px;background:#7a3a3a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px";
      btn.textContent = "Delete";
      btn.addEventListener("click", async () => {
        const ok = await ConfirmDialog.prompt({
          title: `Delete "${entry.name}"?`,
          body: `This will remove the media file, its transcript (if any), its sidecar notes, ` +
                `and any layers in project.atelier that reference it. This cannot be undone.`,
          confirmLabel: "Delete",
        });
        if (!ok) return;
        try {
          await fetch(`/api/project/${encodeURIComponent(projName)}/media?file=${encodeURIComponent(entry.name)}`, { method: "DELETE" });
          await sidebar.refresh();
          clearMain();
          statusBar.textContent = `Deleted ${entry.name}`;
        } catch (err) {
          alert("Failed to delete: " + (err instanceof Error ? err.message : err));
        }
      });
      (headerEl as HTMLElement).style.display = "flex";
      (headerEl as HTMLElement).style.alignItems = "center";
      headerEl.appendChild(btn);
    }
  }

  function openTranscript(entry: ProjectTranscriptEntry): void {
    clearMain();
    statusBar.textContent = entry.path;
    currentTranscript = new TranscriptViewer(mainBody);
    void currentTranscript.load(entry.path, entry);
  }

  // ─── Drag-and-drop ingest ─────────────────────────────────
  //
  // Two visual targets:
  //   - **Sidebar** drop → always creates a new <slug>.atelier (legacy).
  //   - **Canvas** drop with a loaded doc → POSTs `?targetDocPath=` so the
  //     media attaches to the loaded doc. With no loaded doc, the canvas
  //     pane degrades to the sidebar behaviour (new doc) — preserving the
  //     "drop anywhere" UX from before the canvas split.
  const dropZone = new DropZone({
    getActiveProject: () => activeProjectName,
    getCurrentDocPath: () => currentDocPath,
    getSidebarElement: () => sidebar.el,
    getCanvasElement: () => mainBody,
    onIngestStart: (filename) => {
      statusBar.textContent = `Ingesting ${filename}…`;
    },
    onIngestProgress: (phase, info) => {
      if (phase === "error") {
        statusBar.textContent = `Ingest failed: ${info?.error ?? "(unknown)"}`;
      } else {
        statusBar.textContent = `Ingest: ${phase}`;
      }
    },
    onIngestDone: async (filename) => {
      statusBar.textContent = `Ingested ${filename}`;
      if (activeProjectName) {
        await sidebar.refreshProject(activeProjectName);
        await openProjectDoc(activeProjectName);
      }
    },
  });
  void dropZone;

  // ─── WS bridge for live updates ─────────────────────────
  connectBridge((env) => {
    if (env.type === "media:list:changed" || env.type === "transcript:added") {
      if (activeProjectName && (env as { projectName?: string }).projectName === activeProjectName) {
        void sidebar.refreshProject(activeProjectName);
      }
    } else if (env.type === "doc:list:changed") {
      // Doc surface changed (create / duplicate / delete from this or another
      // client). Refresh the sidebar, and — if the currently-loaded doc has
      // disappeared (deleted from disk, or unlinked as a slide) — fall back
      // to the first remaining doc, or show the empty-canvas state when no
      // docs remain (post-pivot, projects can legitimately be doc-less).
      const e = env as { projectName?: string };
      if (activeProjectName && e.projectName === activeProjectName) {
        const projectName = activeProjectName;
        void (async () => {
          await sidebar.refreshProject(projectName);
          const docs = sidebar.getDocs(projectName);
          const stillExists = currentDocPath !== null && docs.some((d) => d.path === currentDocPath);
          if (!stillExists) {
            if (docs.length === 0) {
              statusBar.textContent = `Loaded doc was removed — no docs remain`;
              showEmptyCanvas();
            } else if (currentDocPath !== null) {
              // Active doc vanished but other docs remain — load the first.
              statusBar.textContent = `Loaded doc was removed — falling back to ${docs[0].path}`;
              await openProjectDoc(projectName, docs[0].path);
            }
          }
        })();
      }
    } else if (env.type === "media:ingest:progress") {
      const e = env as { phase: string; file: string; error?: string; received?: number; total?: number | null };
      if (e.phase === "error") {
        statusBar.textContent = `Ingest failed (${e.file}): ${e.error ?? "(unknown)"}`;
      } else if (e.phase === "model:download" && e.received !== undefined && e.total) {
        const pct = ((e.received / e.total) * 100).toFixed(1);
        statusBar.textContent = `Downloading model: ${pct}%`;
      } else {
        statusBar.textContent = `Ingest ${e.file}: ${e.phase}`;
      }
    } else if (env.type === "llm:mutation" && currentStudio) {
      // Wire LLM mutation through to the active doc (workspace mode preserves
      // the live loop the legacy single-doc mode already had).
      const e = env as { documentId: string; doc: unknown; source?: string };
      if (activeProjectName && e.documentId === `${activeProjectName}/project.atelier`) {
        currentStudio.applyMutation({ type: "doc:replace", doc: e.doc as never, source: (e.source as never) ?? "llm" });
      }
    }
  });

  await sidebar.refresh();
  // Open the active project on first paint, if one is set.
  try {
    const active = await fetchJson<ActiveProjectFile | null>("/api/workspace/active");
    if (active && !active.stale) {
      activeProjectName = active.name;
      await openProjectDoc(active.name);
    } else {
      statusBar.textContent = "Pick a project in the sidebar to begin.";
    }
  } catch {
    statusBar.textContent = "Pick a project in the sidebar to begin.";
  }
}

// Augment AtelierStudio type to include applyMutation — present at runtime in
// workspace 0.27+. Matches the same shim in inline-app.ts.
declare module "@a-company/atelier-studio" {
  interface AtelierStudio {
    applyMutation(op: { type: "doc:replace"; doc: AtelierDoc; source: "human" | "llm" | "system" }): void;
  }
}

function connectBridge(onMessage: (env: { type: string }) => void): void {
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/bridge";
  let socket: WebSocket | null = null;
  const open = (): void => {
    try {
      socket = new WebSocket(url);
    } catch {
      setTimeout(open, 1500);
      return;
    }
    socket.addEventListener("message", (ev) => {
      try {
        const env = JSON.parse(ev.data);
        onMessage(env);
      } catch { /* ignore */ }
    });
    socket.addEventListener("close", () => {
      setTimeout(open, 1500);
    });
  };
  open();
}

// ─── Utilities ──────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(2);
  return `${m}:${s.padStart(5, "0")}`;
}

function kindIcon(kind: string): string {
  switch (kind) {
    case "video": return "🎬";
    case "image": return "🖼";
    case "audio": return "🎵";
    case "font": return "🔤";
    default: return "📄";
  }
}

/** Icon for a non-manifest .atelier doc row (slide / other). */
function docKindIcon(kind: string | undefined): string {
  switch (kind) {
    case "video": return "🎬";
    case "image": return "🖼";
    case "carousel": return "🎠";
    default: return "▤";
  }
}

// ─── Inline styles for the workspace UI ─────────────────────────────

function injectStyles(): void {
  if (document.getElementById("atel-workspace-styles")) return;
  const style = document.createElement("style");
  style.id = "atel-workspace-styles";
  style.textContent = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #2C2C2C; color: #F5F0EB; }
  body { font-family: 'Cormorant Garamond', Georgia, serif; }
  #studio { height: 100vh; width: 100vw; display: flex; }

  .atel-workspace-shell { display: flex; flex: 1; min-height: 0; }
  .atel-workspace-sidebar {
    width: 300px; min-width: 300px; background: #333; border-right: 1px solid #4A4A4A;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .atel-workspace-sidebar__header {
    padding: 14px 16px; border-bottom: 1px solid #4A4A4A;
  }
  .atel-workspace-sidebar__title {
    font-size: 11px; font-weight: 600; letter-spacing: 1.5px; color: #A89F95; text-transform: uppercase;
  }
  .atel-workspace-sidebar__section {
    margin-top: 12px; display: flex; align-items: center; justify-content: space-between;
    font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #A89F95;
  }
  .atel-workspace-sidebar__new-btn {
    background: #3D3D3D; color: #F5F0EB; border: 1px solid #4A4A4A; border-radius: 3px;
    padding: 2px 8px; font-size: 10px; cursor: pointer; font-family: inherit;
  }
  .atel-workspace-sidebar__list { flex: 1; overflow-y: auto; padding: 6px 0; }

  .atel-workspace-sidebar__project { padding: 4px 0; }
  .atel-workspace-sidebar__project-header {
    padding: 6px 14px; cursor: pointer; font-size: 13px; color: #A89F95;
    display: flex; align-items: center; gap: 6px;
  }
  .atel-workspace-sidebar__project-header:hover { color: #F5F0EB; background: #363636; }
  .atel-workspace-sidebar__project--active .atel-workspace-sidebar__project-header { color: #C75B39; }
  .atel-project-name { font-weight: 600; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
  .atel-active-marker { color: #C75B39; font-size: 11px; }

  .atel-workspace-sidebar__group {
    margin: 6px 0; padding: 0 14px;
  }
  .atel-workspace-sidebar__group-label {
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #6E6862; padding: 4px 8px 2px;
  }
  .atel-workspace-sidebar__item {
    padding: 4px 8px 4px 22px; font-size: 12px; cursor: pointer; color: #A89F95;
    font-family: 'SF Mono', 'Fira Code', monospace; border-radius: 3px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .atel-workspace-sidebar__item:hover { background: #363636; color: #F5F0EB; }
  /* Currently-loaded doc row — accent color + bold to mirror the active-project treatment. */
  .atel-workspace-sidebar__item--loaded { color: #C75B39; }
  .atel-workspace-sidebar__item--loaded:hover { color: #D4724E; background: #363636; }
  .atel-loaded-marker { color: #C75B39; font-size: 10px; letter-spacing: 0.5px; }
  .atel-workspace-sidebar__empty {
    padding: 6px 8px 4px 22px; font-size: 11px; color: #6E6862;
    font-family: 'SF Mono', 'Fira Code', monospace; font-style: italic;
  }
  .atel-item-icon { display: inline-block; width: 18px; }
  .atel-item-meta { color: #6E6862; font-size: 11px; }
  .atel-badge {
    display: inline-block; background: #3D3D3D; padding: 1px 5px; border-radius: 2px;
    font-size: 9px; letter-spacing: 0.5px; margin-left: 4px; color: #A89F95;
  }
  .atel-badge--ok { color: #6B8E6B; }

  .atel-workspace-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .atel-workspace-status {
    height: 32px; min-height: 32px; padding: 0 16px; display: flex; align-items: center;
    background: #333; border-bottom: 1px solid #4A4A4A;
    font-size: 11px; color: #A89F95; font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .atel-workspace-body { flex: 1; overflow: auto; position: relative; }

  /* Markdown view */
  .atel-markdown-view { padding: 20px 32px; max-width: 880px; margin: 0 auto; color: #F5F0EB; }
  .atel-markdown-view__header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid #4A4A4A; padding-bottom: 12px; margin-bottom: 20px;
  }
  .atel-markdown-view__title { font-size: 14px; color: #A89F95; font-family: monospace; }
  .atel-markdown-view__btn {
    background: #3D3D3D; color: #F5F0EB; border: 1px solid #4A4A4A; border-radius: 3px;
    padding: 4px 12px; font-family: inherit; cursor: pointer; font-size: 12px; margin-left: 6px;
  }
  .atel-markdown-view__body { font-size: 15px; line-height: 1.6; }
  .atel-markdown-view__editor {
    width: 100%; min-height: 70vh; background: #1f1f1f; color: #F5F0EB;
    border: 1px solid #4A4A4A; padding: 12px; font-family: 'SF Mono', monospace; font-size: 13px;
  }
  .atel-markdown-view__frontmatter {
    border-collapse: collapse; margin-bottom: 20px; font-family: 'SF Mono', monospace; font-size: 12px;
  }
  .atel-markdown-view__frontmatter th, .atel-markdown-view__frontmatter td {
    border: 1px solid #4A4A4A; padding: 4px 10px; text-align: left;
  }
  .atel-markdown-view__frontmatter th { background: #333; color: #A89F95; }
  .atel-md-h1, .atel-md-h2, .atel-md-h3 { color: #F5F0EB; margin-top: 18px; margin-bottom: 8px; }
  .atel-md-h1 { font-size: 26px; }
  .atel-md-h2 { font-size: 20px; }
  .atel-md-h3 { font-size: 16px; }
  .atel-md-list { padding-left: 24px; }
  .atel-md-code { background: #1f1f1f; padding: 1px 4px; border-radius: 2px; font-family: 'SF Mono', monospace; font-size: 13px; }
  .atel-md-pre { background: #1f1f1f; padding: 12px; border-radius: 4px; overflow-x: auto; }
  .atel-md-quote { border-left: 3px solid #4A4A4A; padding-left: 12px; color: #A89F95; margin: 8px 0; }

  /* Media preview */
  .atel-media-preview { padding: 20px 32px; }
  .atel-media-preview__header { margin-bottom: 16px; }
  .atel-media-preview__title { font-size: 16px; color: #F5F0EB; }
  .atel-media-preview__meta { font-size: 11px; color: #A89F95; font-family: monospace; margin-top: 2px; }
  .atel-media-preview__body { display: block; }
  .atel-media-preview__body--split {
    display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px;
    align-items: start;
  }
  .atel-media-preview__player { min-width: 0; }
  .atel-media-preview__transcript {
    min-width: 0; max-height: calc(100vh - 160px); overflow-y: auto;
    padding-right: 8px;
    border-left: 1px solid #4A4A4A;
    padding-left: 20px;
  }
  .atel-media-preview__transcript-loading { color: #A89F95; padding: 8px 0; font-size: 12px; }
  .atel-media-preview__transcript-segment {
    border-left: 2px solid #4A4A4A; padding: 6px 10px; margin: 5px 0;
  }
  .atel-media-preview__transcript-time {
    font-size: 10px; color: #6E6862; font-family: monospace; margin-bottom: 3px;
  }
  .atel-media-preview__transcript-text { font-size: 13px; line-height: 1.55; color: #F5F0EB; }
  .atel-media-preview__video, .atel-media-preview__image { max-width: 100%; max-height: 70vh; background: #000; }
  .atel-media-preview__audio { width: 100%; }
  .atel-media-preview__noop { color: #A89F95; padding: 24px; }
  /* Shared transcript-word styles — used by both MediaPreview's right pane
     and the standalone TranscriptViewer. */
  .atel-transcript-word { cursor: pointer; padding: 0 1px; border-radius: 2px; transition: background 80ms ease; }
  .atel-transcript-word:hover { background: rgba(199,91,57,0.18); }
  .atel-transcript-word--current {
    background: rgba(199,91,57,0.35); color: #FFF;
  }

  /* Transcript viewer */
  .atel-transcript-viewer { padding: 20px 32px; max-width: 880px; margin: 0 auto; }
  .atel-transcript-viewer__title { font-size: 16px; color: #F5F0EB; }
  .atel-transcript-viewer__meta { font-size: 11px; color: #A89F95; font-family: monospace; margin-top: 2px; margin-bottom: 16px; }
  .atel-transcript-viewer__segment {
    border-left: 2px solid #4A4A4A; padding: 8px 12px; margin: 6px 0;
  }
  .atel-transcript-viewer__time {
    font-size: 11px; color: #6E6862; font-family: monospace; margin-bottom: 4px;
  }
  .atel-transcript-viewer__text { font-size: 14px; line-height: 1.5; }
  .atel-transcript-viewer__word { cursor: default; }
  .atel-transcript-viewer__word:hover { background: rgba(199,91,57,0.15); }

  /* Confirm dialog — floating centered modal with backdrop */
  .atel-confirm-dialog {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    z-index: 9500;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(2px);
  }
  .atel-confirm-dialog__card {
    background: #1F1B17; color: #F5F0EB;
    border: 1px solid #3A3530; border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.55);
    padding: 24px 28px; max-width: 480px; min-width: 360px;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .atel-confirm-dialog__title {
    font-size: 18px; font-weight: 600; margin-bottom: 14px;
    color: #F5F0EB;
  }
  .atel-confirm-dialog__body {
    font-size: 13px; line-height: 1.55; color: #C5BEB7;
    margin-bottom: 18px;
  }
  .atel-confirm-dialog__type-to-confirm { margin: 0 0 16px 0; }
  .atel-confirm-dialog__type-label {
    display: block; font-size: 12px; color: #A89F95; margin-bottom: 6px;
  }
  .atel-confirm-dialog__type-input {
    width: 100%; box-sizing: border-box;
    background: #15120F; border: 1px solid #3A3530; border-radius: 4px;
    color: #F5F0EB; padding: 8px 10px; font-size: 13px;
    font-family: ui-monospace, monospace;
  }
  .atel-confirm-dialog__type-input:focus { outline: none; border-color: #C75B39; }
  .atel-confirm-dialog__buttons {
    display: flex; justify-content: flex-end; gap: 10px;
  }
  .atel-confirm-dialog__btn {
    padding: 8px 16px; font-size: 13px; border: none; border-radius: 4px;
    cursor: pointer; font-weight: 500; transition: background 120ms ease;
  }
  .atel-confirm-dialog__btn--cancel {
    background: #2A2520; color: #F5F0EB;
  }
  .atel-confirm-dialog__btn--cancel:hover { background: #34302C; }
  .atel-confirm-dialog__btn--danger {
    background: #A0432B; color: #FFFFFF;
  }
  .atel-confirm-dialog__btn--danger:hover:not(:disabled) { background: #C75B39; }
  .atel-confirm-dialog__btn--danger:disabled {
    background: #4A3530; color: #7E6E66; cursor: not-allowed;
  }

  /* Group label with inline action (e.g. "+ new doc" next to DOCUMENT). */
  .atel-workspace-sidebar__group-label--with-action {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
  }
  .atel-workspace-sidebar__new-btn--inline {
    padding: 1px 6px; font-size: 9px; letter-spacing: 0.5px;
  }

  /* NewDocDialog — three-tile picker, slug preview, optional slide toggle. */
  .atel-new-doc-dialog__card { min-width: 440px; max-width: 520px; }
  .atel-new-doc-dialog__tiles {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px;
  }
  .atel-new-doc-dialog__tile {
    background: #2A2520; color: #F5F0EB; border: 1px solid #3A3530; border-radius: 6px;
    padding: 14px 8px; cursor: pointer; text-align: center;
    font-family: inherit; transition: background 120ms ease, border-color 120ms ease;
  }
  .atel-new-doc-dialog__tile:hover { background: #34302C; }
  .atel-new-doc-dialog__tile--selected {
    background: #3A1F1A; border-color: #C75B39;
  }
  .atel-new-doc-dialog__tile-icon { font-size: 28px; line-height: 1; }
  .atel-new-doc-dialog__tile-label {
    margin-top: 6px; font-size: 12px; letter-spacing: 0.5px;
  }
  .atel-new-doc-dialog__field { margin-bottom: 14px; }
  .atel-new-doc-dialog__slug-preview {
    margin-top: 6px; font-size: 11px; color: #6E6862;
    font-family: ui-monospace, monospace; min-height: 14px;
  }
  .atel-new-doc-dialog__toggle {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: #C5BEB7; margin: 4px 0 14px 0;
    cursor: pointer;
  }
  .atel-new-doc-dialog__toggle input { cursor: pointer; }
  .atel-new-doc-dialog__error {
    background: #3A1F1A; border: 1px solid #6A2F22; color: #E07B5C;
    padding: 8px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 12px;
  }
  .atel-confirm-dialog__btn--primary {
    background: #C75B39; color: #FFFFFF;
  }
  .atel-confirm-dialog__btn--primary:hover:not(:disabled) { background: #D4724E; }
  .atel-confirm-dialog__btn--primary:disabled {
    background: #4A3530; color: #7E6E66; cursor: not-allowed;
  }

  /* Context menu (right-click in sidebar) */
  .atel-context-menu {
    position: fixed; z-index: 9300;
    background: #1F1B17; border: 1px solid #3A3530; border-radius: 6px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    padding: 4px 0; min-width: 180px;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 13px;
  }
  .atel-context-menu__item {
    padding: 8px 16px; cursor: pointer; color: #F5F0EB;
  }
  .atel-context-menu__item:hover { background: #2A2520; }
  .atel-context-menu__item--destructive { color: #E07B5C; }
  .atel-context-menu__item--destructive:hover { background: #3A1F1A; color: #F5F0EB; }

  /* Drop zone overlay — split into sidebar + canvas highlight panes.
     The outer .atel-drop-zone is a transparent click-through layer; the
     two .atel-drop-zone__pane children own the visual targets. Each pane is
     absolutely positioned over its underlying element (sidebar / mainBody)
     and toggled with --active as the cursor hovers it. */
  .atel-drop-zone {
    position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9000;
    pointer-events: none; opacity: 0; transition: opacity 150ms ease;
  }
  .atel-drop-zone--visible { opacity: 1; pointer-events: auto; }
  .atel-drop-zone__pane {
    position: fixed; display: flex; align-items: center; justify-content: center;
    background: rgba(20,20,20,0.55);
    border: 3px dashed rgba(199, 91, 57, 0.45);
    transition: background 120ms ease, border-color 120ms ease;
    box-sizing: border-box;
  }
  .atel-drop-zone__pane--active {
    background: rgba(199, 91, 57, 0.18);
    border-color: #C75B39;
  }
  .atel-drop-zone__inner {
    border-radius: 12px; padding: 32px 36px; text-align: center;
    background: #2C2C2C; max-width: 80%;
  }
  .atel-drop-zone__icon { font-size: 40px; color: #C75B39; }
  .atel-drop-zone__title { font-size: 16px; margin-top: 12px; color: #F5F0EB; }
  .atel-drop-zone__project { color: #C75B39; font-family: monospace; }
  .atel-drop-zone__hint { font-size: 11px; color: #A89F95; margin-top: 6px; }
  `;
  document.head.appendChild(style);
}
