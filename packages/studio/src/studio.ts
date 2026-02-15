import type { AtelierDocument } from "@atelier/types";
import { CanvasPanel } from "./panels/canvas-panel.js";
import { LayerPanel } from "./panels/layer-panel.js";
import { PropertyPanel } from "./panels/property-panel.js";
import { YamlPanel } from "./panels/yaml-panel.js";
import { applyStudioTheme, defaultTheme, type StudioTheme } from "./theme.js";
import { History } from "./history.js";
import { ExportDialog } from "./export/export-dialog.js";

export type RightTab = "yaml" | "editor";

export interface StudioOptions {
  mode?: "full" | "compact";
  initialTab?: RightTab;
  allowSave?: boolean;
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
  private currentTab: RightTab;
  private stateName = "";
  private abortController = new AbortController();
  private history = new History();
  private lastSnapshot = "";

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
    });

    // Right panel → right side of body
    this.body.appendChild(this.rightPanel);

    // Layer panel → inside right panel (editor tab)
    this.layerPanel = new LayerPanel(this.rightPanel, {
      onSelectLayer: (id) => {
        this.propertyPanel.selectLayer(id);
      },
      onDocumentChange: () => this.onDocChange(),
    });

    // Property panel → inside right panel (editor tab)
    this.propertyPanel = new PropertyPanel(this.rightPanel, {
      onPropertyChange: () => this.onDocChange(),
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

  destroy(): void {
    this.abortController.abort();
    this.canvasPanel.destroy();
    this.container.removeChild(this.root);
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

  private onDocChange(): void {
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
    this.stateName = Object.keys(this.doc.states)[0] ?? "";
    this.canvasPanel.loadDocument(this.doc, this.stateName);
    this.layerPanel.loadDocument(this.doc);
    this.propertyPanel.loadDocument(this.doc, this.stateName);
    this.yamlPanel.loadDocument(this.doc);
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
    );
  }
}
