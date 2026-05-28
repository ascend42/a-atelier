import type { AtelierDocument } from "@a-company/atelier-types";
import { CanvasPanel } from "./panels/canvas-panel.js";
import { LayerPanel } from "./panels/layer-panel.js";
import { PropertyPanel } from "./panels/property-panel.js";
import { YamlPanel } from "./panels/yaml-panel.js";
import { applyStudioTheme, defaultTheme, type StudioTheme } from "./theme.js";
import { History } from "./history.js";
import { ExportDialog } from "./export/export-dialog.js";

export type RightTab = "yaml" | "editor";

/**
 * Source of a Studio-side mutation. Mirrors the MCP-side
 * `DocumentStore.MutationSource` so the live WS bridge (task #10) can carry
 * the tag end-to-end without translation.
 */
export type MutationSource = "human" | "llm" | "system";

/**
 * A mutation op applied via `AtelierStudio.applyMutation()`. v1 supports the
 * simplest shape — full document replacement. Finer-grained ops (layer-level
 * patches, delta inserts) will land alongside the WS bridge in task #10.
 */
export type MutationOp = {
  type: "doc:replace";
  doc: AtelierDocument;
  source: MutationSource;
};

export interface StudioOptions {
  mode?: "full" | "compact";
  initialTab?: RightTab;
  allowSave?: boolean;
  /**
   * If true, the canvas panel begins playback immediately when a document is loaded.
   * Default: false — disables the "open file slams play" footgun in editor contexts.
   * Showcase opts in by passing true.
   */
  autoplay?: boolean;
  onDocumentChange?: (doc: AtelierDocument) => void;
  onSave?: (doc: AtelierDocument) => void;
}

export class AtelierStudio {
  private root: HTMLElement;
  private toolbar: HTMLElement;
  private body: HTMLElement;
  private rightPanel: HTMLElement;
  private stateSelect!: HTMLSelectElement;
  private tabBtns: Map<RightTab, HTMLButtonElement> = new Map();
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;

  private canvasPanel: CanvasPanel;
  private layerPanel: LayerPanel;
  private propertyPanel: PropertyPanel;
  private yamlPanel: YamlPanel;

  private doc: AtelierDocument | null = null;
  private originalDoc: AtelierDocument | null = null;
  private currentFilename: string | null = null;
  private currentTab: RightTab;
  private stateName = "";
  private abortController = new AbortController();
  private history = new History();
  private lastSnapshot = "";
  /**
   * One-tick suppression flag set by `applyMutation()` so the resulting
   * `onDocChange()` re-render does not echo the change back to
   * `opts.onDocumentChange` — which would otherwise round-trip the LLM op
   * through the file-save loop and back into the bridge as a "human" edit.
   * Cleared on the next microtask so subsequent real edits resume normally.
   */
  private suppressNotify = false;
  /**
   * Mirror of `LayerPanel`'s selection so `applyMutation()` can restore the
   * selected layer after replacing the doc, when that layer still exists.
   */
  private selectedLayerId: string | null = null;

  constructor(
    private container: HTMLElement,
    private opts: StudioOptions = {},
  ) {
    this.currentTab = opts.initialTab ?? "yaml";

    // Root
    this.root = document.createElement("div");
    this.root.className = "atel-studio";
    applyStudioTheme(this.root, defaultTheme);

    // Toolbar
    this.toolbar = document.createElement("div");
    this.toolbar.className = "atel-toolbar";
    this.buildToolbar();
    this.root.appendChild(this.toolbar);

    // Body — two-column grid: canvas (left) + right panel
    this.body = document.createElement("div");
    this.body.className = "atel-body";
    this.root.appendChild(this.body);

    // Right panel container
    this.rightPanel = document.createElement("div");
    this.rightPanel.className = "atel-right-panel";

    // Canvas panel → left side of body (always visible)
    this.canvasPanel = new CanvasPanel(this.body, {
      onFrameChange: () => {},
      autoplay: opts.autoplay ?? false,
      // Image-drop on the canvas mutates the doc directly — route the
      // change notification through onDocChange, which already triggers
      // canvas-refresh + layer/yaml panel refresh + the host-side
      // onDocumentChange consumer (which the CLI uses to autosave).
      onDocumentChange: () => this.onDocChange(),
    });

    // Right panel → right side of body
    this.body.appendChild(this.rightPanel);

    // Layer panel → inside right panel (editor tab)
    this.layerPanel = new LayerPanel(this.rightPanel, {
      onSelectLayer: (id) => {
        this.selectedLayerId = id;
        this.propertyPanel.selectLayer(id);
      },
      onDocumentChange: () => this.onDocChange(),
    });

    // Property panel → inside right panel (editor tab)
    this.propertyPanel = new PropertyPanel(this.rightPanel, {
      onPropertyChange: () => this.onDocChange(),
      onPropertyPreview: () => this.previewDocChange(),
    });

    // YAML panel → inside right panel (yaml tab)
    this.yamlPanel = new YamlPanel(this.rightPanel);

    container.appendChild(this.root);
    this.applyTab();

    // Keyboard shortcuts
    this.root.tabIndex = 0;
    this.root.addEventListener("keydown", (e) => this.handleKeydown(e), {
      signal: this.abortController.signal,
    });
  }

  private handleKeydown(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;

    // Undo/redo always works, even in inputs
    if (mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      this.undoAction();
      return;
    }
    if (mod && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      this.redoAction();
      return;
    }

    // Don't intercept other keys when typing in inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        this.canvasPanel.togglePlay();
        break;
      case "ArrowRight":
        e.preventDefault();
        this.canvasPanel.stepForward();
        break;
      case "ArrowLeft":
        e.preventDefault();
        this.canvasPanel.stepBack();
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        this.layerPanel.removeSelectedLayer();
        this.onDocChange();
        break;
    }
  }

  loadDocument(doc: AtelierDocument): void {
    // Deep clone for reset support
    this.originalDoc = structuredClone(doc);
    this.doc = structuredClone(doc);
    this.stateName = Object.keys(this.doc.states)[0] ?? "";
    this.lastSnapshot = JSON.stringify(this.doc);
    this.history.clear();

    // Populate state selector
    this.stateSelect.innerHTML = "";
    const stateNames = Object.keys(this.doc.states);
    for (const name of stateNames) {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      this.stateSelect.appendChild(o);
    }
    this.stateSelect.value = this.stateName;
    this.stateSelect.style.display = stateNames.length > 1 ? "" : "none";

    // Load into panels
    this.canvasPanel.loadDocument(this.doc, this.stateName);
    this.layerPanel.loadDocument(this.doc);
    this.propertyPanel.loadDocument(this.doc, this.stateName);
    this.yamlPanel.loadDocument(this.doc);
  }

  /**
   * Apply an in-memory mutation without firing `onDocumentChange`. Used by
   * the live LLM↔human bridge so an external MCP client can drive the
   * Studio's rendered doc in real time without round-tripping through the
   * file-save loop.
   *
   * Mechanics:
   *   - Replaces `this.doc` and re-renders all panels.
   *   - Preserves `this.history` and `this.originalDoc` (unlike `loadDocument`).
   *   - Records a history snapshot so a human can Cmd-Z to revert the op —
   *     LLM mutations should be undoable from the user's seat.
   *   - Preserves `stateName` and the selected layer id when they still exist
   *     in the new doc; falls back to the first state / no selection otherwise.
   *   - Sets a one-tick `suppressNotify` flag (cleared on the next microtask)
   *     so the resulting re-render does not echo back to `opts.onDocumentChange`.
   *
   * TODO(#10): the WS bridge will call this when it receives ops from the
   * MCP-side `DocumentStore.onChange` subscription.
   */
  applyMutation(op: MutationOp): void {
    if (op.type !== "doc:replace") return;

    // Snapshot the current state so the user can undo the LLM op.
    if (this.doc) {
      this.history.snapshot(this.lastSnapshot);
    }

    this.suppressNotify = true;
    try {
      this.doc = structuredClone(op.doc);
      this.lastSnapshot = JSON.stringify(this.doc);

      // Preserve current state when it still exists (same pattern as
      // reloadPanels — avoids teleporting the editor on every LLM op).
      if (!this.stateName || !this.doc.states[this.stateName]) {
        this.stateName = Object.keys(this.doc.states)[0] ?? "";
      }

      // Refresh state selector options to reflect the new doc.
      this.stateSelect.innerHTML = "";
      const stateNames = Object.keys(this.doc.states);
      for (const name of stateNames) {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        this.stateSelect.appendChild(o);
      }
      this.stateSelect.value = this.stateName;
      this.stateSelect.style.display = stateNames.length > 1 ? "" : "none";

      // Re-render panels via the same path undo/redo uses.
      this.canvasPanel.loadDocument(this.doc, this.stateName);
      this.layerPanel.loadDocument(this.doc);
      this.propertyPanel.loadDocument(this.doc, this.stateName);
      this.yamlPanel.loadDocument(this.doc);

      // Preserve the selected layer id when it still exists in the new doc.
      const preservedId = this.selectedLayerId;
      if (preservedId && this.doc.layers.some((l) => l.id === preservedId)) {
        this.layerPanel.selectLayer(preservedId);
        this.propertyPanel.selectLayer(preservedId);
        this.selectedLayerId = preservedId;
      } else {
        this.selectedLayerId = null;
      }

      this.updateUndoRedoButtons();
    } finally {
      // Release the suppression after the current task drains so subsequent
      // human edits resume normal notification.
      queueMicrotask(() => {
        this.suppressNotify = false;
      });
    }
  }

  getDocument(): AtelierDocument | null {
    return this.doc ? structuredClone(this.doc) : null;
  }

  setTheme(theme: StudioTheme): void {
    applyStudioTheme(this.root, theme);
  }

  setTab(tab: RightTab): void {
    this.currentTab = tab;
    this.applyTab();
  }

  setFilename(name: string | null): void {
    this.currentFilename = name;
  }

  destroy(): void {
    this.abortController.abort();
    this.canvasPanel.destroy();
    // Defensive: a consumer may have wiped the container (e.g. innerHTML="" on
    // a parse-error path) which removes our root indirectly. Don't throw on
    // double-detach — just check parentage before removeChild.
    if (this.root.parentNode === this.container) {
      this.container.removeChild(this.root);
    }
  }

  private buildToolbar(): void {
    // Left group: state selector + reset
    const leftGroup = document.createElement("div");
    leftGroup.className = "atel-toolbar__group atel-toolbar__group--controls";

    this.stateSelect = document.createElement("select");
    this.stateSelect.className = "atel-toolbar__select";
    this.stateSelect.style.display = "none";
    this.stateSelect.addEventListener("change", () => {
      this.stateName = this.stateSelect.value;
      this.canvasPanel.setStateName(this.stateName);
      this.propertyPanel.setStateName(this.stateName);
    });
    leftGroup.appendChild(this.stateSelect);

    const resetBtn = document.createElement("button");
    resetBtn.className = "atel-toolbar__btn";
    resetBtn.textContent = "Reset";
    resetBtn.dataset.action = "reset";
    resetBtn.addEventListener("click", () => this.resetDocument());
    leftGroup.appendChild(resetBtn);

    this.undoBtn = document.createElement("button");
    this.undoBtn.className = "atel-toolbar__btn";
    this.undoBtn.textContent = "\u21A9 Undo";
    this.undoBtn.dataset.action = "undo";
    this.undoBtn.disabled = true;
    this.undoBtn.addEventListener("click", () => this.undoAction());
    leftGroup.appendChild(this.undoBtn);

    this.redoBtn = document.createElement("button");
    this.redoBtn.className = "atel-toolbar__btn";
    this.redoBtn.textContent = "Redo \u21AA";
    this.redoBtn.dataset.action = "redo";
    this.redoBtn.disabled = true;
    this.redoBtn.addEventListener("click", () => this.redoAction());
    leftGroup.appendChild(this.redoBtn);

    this.toolbar.appendChild(leftGroup);

    // Spacer
    const spacer = document.createElement("div");
    spacer.className = "atel-toolbar__spacer";
    this.toolbar.appendChild(spacer);

    // Export button
    const exportGroup = document.createElement("div");
    exportGroup.className = "atel-toolbar__group--controls";
    const exportBtn = document.createElement("button");
    exportBtn.className = "atel-toolbar__btn";
    exportBtn.textContent = "Export";
    exportBtn.dataset.action = "export";
    exportBtn.addEventListener("click", () => this.showExportDialog());
    exportGroup.appendChild(exportBtn);
    this.toolbar.appendChild(exportGroup);

    // Right group: tab toggle
    const tabGroup = document.createElement("div");
    tabGroup.className = "atel-toolbar__group";

    const tabs: { id: RightTab; label: string }[] = [
      { id: "yaml", label: "{ } YAML" },
      { id: "editor", label: "\u270E Editor" },
    ];

    for (const t of tabs) {
      const btn = document.createElement("button");
      btn.className = "atel-toolbar__btn";
      btn.textContent = t.label;
      btn.addEventListener("click", () => this.setTab(t.id));
      this.tabBtns.set(t.id, btn);
      tabGroup.appendChild(btn);
    }

    this.toolbar.appendChild(tabGroup);
  }

  private applyTab(): void {
    // Update button states
    for (const [id, btn] of this.tabBtns) {
      btn.classList.toggle("atel-toolbar__btn--active", id === this.currentTab);
    }

    // Toggle right panel content
    this.layerPanel.el.style.display = "none";
    this.propertyPanel.el.style.display = "none";
    this.yamlPanel.el.style.display = "none";

    this.rightPanel.className = "atel-right-panel";

    switch (this.currentTab) {
      case "yaml":
        this.rightPanel.classList.add("atel-right-panel--yaml");
        this.yamlPanel.el.style.display = "";
        this.yamlPanel.refresh();
        break;
      case "editor":
        this.rightPanel.classList.add("atel-right-panel--editor");
        this.layerPanel.el.style.display = "";
        this.propertyPanel.el.style.display = "";
        break;
    }
  }

  /**
   * Live preview during a continuous interaction (e.g. slider drag). Re-renders
   * the canvas ONLY — deliberately skips:
   *   - `history.snapshot` / `lastSnapshot` update, so one drag collapses into
   *     a single undo entry pushed on the eventual commit (`onDocChange`)
   *   - the layer/yaml panel refresh (visual thrash + cost during a 60Hz drag)
   *   - the host `onDocumentChange` notification (which would autosave + flood
   *     the WS bridge on every tick)
   * The committing `change` event later routes through `onDocChange`, which is
   * what records history and notifies the host exactly once.
   */
  private previewDocChange(): void {
    if (this.suppressNotify) return;
    this.canvasPanel.refresh();
  }

  private onDocChange(): void {
    // Suppress consumer notification when this re-render was triggered by
    // `applyMutation()` — otherwise the change would echo back through the
    // file-save loop and bounce into the WS bridge as a human-originated
    // edit, creating a feedback loop with the LLM.
    if (this.suppressNotify) return;

    // Push previous state to undo stack before accepting mutation
    if (this.doc) {
      this.history.snapshot(this.lastSnapshot);
      this.lastSnapshot = JSON.stringify(this.doc);
    }

    // Re-render canvas (always visible)
    this.canvasPanel.refresh();

    // Update YAML if visible
    if (this.currentTab === "yaml") {
      this.yamlPanel.refresh();
    }

    // Refresh layer panel (visibility toggles, etc.)
    this.layerPanel.refresh();

    this.updateUndoRedoButtons();

    // Notify consumer
    if (this.doc) {
      this.opts.onDocumentChange?.(this.doc);
    }
  }

  private undoAction(): void {
    if (!this.doc) return;
    const json = this.history.undo(this.lastSnapshot);
    if (json === null) return;
    this.lastSnapshot = json;
    this.doc = JSON.parse(json);
    this.reloadPanels();
    this.updateUndoRedoButtons();
  }

  private redoAction(): void {
    if (!this.doc) return;
    const json = this.history.redo(this.lastSnapshot);
    if (json === null) return;
    this.lastSnapshot = json;
    this.doc = JSON.parse(json);
    this.reloadPanels();
    this.updateUndoRedoButtons();
  }

  private updateUndoRedoButtons(): void {
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
  }

  private reloadPanels(): void {
    if (!this.doc) return;
    // Preserve the currently-selected state across undo/redo when it still exists.
    // Only fall back to the first state if the previous state was deleted by the
    // undone/redone action — otherwise editing "hover" and hitting Cmd-Z would
    // teleport the editor back to "default".
    if (!this.stateName || !this.doc.states[this.stateName]) {
      this.stateName = Object.keys(this.doc.states)[0] ?? "";
    }
    this.canvasPanel.loadDocument(this.doc, this.stateName);
    this.layerPanel.loadDocument(this.doc);
    this.propertyPanel.loadDocument(this.doc, this.stateName);
    this.yamlPanel.loadDocument(this.doc);
    // Keep the toolbar state selector consistent with the preserved selection.
    if (this.stateSelect && this.stateSelect.value !== this.stateName) {
      this.stateSelect.value = this.stateName;
    }
    if (this.currentTab === "yaml") this.yamlPanel.refresh();
    this.opts.onDocumentChange?.(this.doc);
  }

  private resetDocument(): void {
    if (this.originalDoc) {
      this.loadDocument(this.originalDoc);
    }
  }

  private showExportDialog(): void {
    if (!this.doc) return;
    this.canvasPanel.pause();
    const dialog = new ExportDialog();
    dialog.show(
      this.doc,
      this.canvasPanel.getCanvas(),
      this.canvasPanel.getImageCache(),
      this.root,
      this.currentFilename ?? undefined,
    );
  }
}
