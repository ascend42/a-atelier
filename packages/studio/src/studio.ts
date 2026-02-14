import type { AtelierDocument } from "@atelier/types";
import { CanvasPanel } from "./panels/canvas-panel.js";
import { LayerPanel } from "./panels/layer-panel.js";
import { PropertyPanel } from "./panels/property-panel.js";
import { YamlPanel } from "./panels/yaml-panel.js";
import { applyStudioTheme, defaultTheme, type StudioTheme } from "./theme.js";

export type StudioView = "preview" | "yaml" | "editor";

export interface StudioOptions {
  mode?: "full" | "compact";
  initialView?: StudioView;
  allowSave?: boolean;
  onDocumentChange?: (doc: AtelierDocument) => void;
  onSave?: (doc: AtelierDocument) => void;
}

export class AtelierStudio {
  private root: HTMLElement;
  private toolbar: HTMLElement;
  private body: HTMLElement;
  private stateSelect!: HTMLSelectElement;
  private viewBtns: Map<StudioView, HTMLButtonElement> = new Map();

  private canvasPanel: CanvasPanel;
  private layerPanel: LayerPanel;
  private propertyPanel: PropertyPanel;
  private yamlPanel: YamlPanel;

  private doc: AtelierDocument | null = null;
  private originalDoc: AtelierDocument | null = null;
  private currentView: StudioView;
  private stateName = "";

  constructor(
    private container: HTMLElement,
    private opts: StudioOptions = {},
  ) {
    this.currentView = opts.initialView ?? "preview";

    // Root
    this.root = document.createElement("div");
    this.root.className = "atel-studio";
    applyStudioTheme(this.root, defaultTheme);

    // Toolbar
    this.toolbar = document.createElement("div");
    this.toolbar.className = "atel-toolbar";
    this.buildToolbar();
    this.root.appendChild(this.toolbar);

    // Body
    this.body = document.createElement("div");
    this.body.className = "atel-body";
    this.root.appendChild(this.body);

    // Panels (created once, shown/hidden by view)
    this.canvasPanel = new CanvasPanel(this.body, {
      onFrameChange: () => {},
    });

    this.layerPanel = new LayerPanel(this.body, {
      onSelectLayer: (id) => {
        this.propertyPanel.selectLayer(id);
      },
      onDocumentChange: () => this.onDocChange(),
    });

    this.propertyPanel = new PropertyPanel(this.body, {
      onPropertyChange: () => this.onDocChange(),
    });

    this.yamlPanel = new YamlPanel(this.body);

    container.appendChild(this.root);
    this.applyView();
  }

  loadDocument(doc: AtelierDocument): void {
    // Deep clone for reset support
    this.originalDoc = structuredClone(doc);
    this.doc = structuredClone(doc);
    this.stateName = Object.keys(this.doc.states)[0] ?? "";

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

  setView(view: StudioView): void {
    this.currentView = view;
    this.applyView();
  }

  destroy(): void {
    this.canvasPanel.destroy();
    this.container.removeChild(this.root);
  }

  private buildToolbar(): void {
    // View toggle group
    const group = document.createElement("div");
    group.className = "atel-toolbar__group";

    const views: { id: StudioView; label: string }[] = [
      { id: "preview", label: "\u25B6 Preview" },
      { id: "yaml", label: "{ } YAML" },
      { id: "editor", label: "\u270E Editor" },
    ];

    for (const v of views) {
      const btn = document.createElement("button");
      btn.className = "atel-toolbar__btn";
      btn.textContent = v.label;
      btn.addEventListener("click", () => this.setView(v.id));
      this.viewBtns.set(v.id, btn);
      group.appendChild(btn);
    }

    this.toolbar.appendChild(group);

    // Spacer
    const spacer = document.createElement("div");
    spacer.className = "atel-toolbar__spacer";
    this.toolbar.appendChild(spacer);

    // State selector
    this.stateSelect = document.createElement("select");
    this.stateSelect.className = "atel-toolbar__select";
    this.stateSelect.style.display = "none";
    this.stateSelect.addEventListener("change", () => {
      this.stateName = this.stateSelect.value;
      this.canvasPanel.setStateName(this.stateName);
      this.propertyPanel.setStateName(this.stateName);
    });
    this.toolbar.appendChild(this.stateSelect);

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.className = "atel-toolbar__btn";
    resetBtn.textContent = "Reset";
    resetBtn.dataset.action = "reset";
    resetBtn.addEventListener("click", () => this.resetDocument());
    this.toolbar.appendChild(resetBtn);
  }

  private applyView(): void {
    // Update button states
    for (const [id, btn] of this.viewBtns) {
      btn.classList.toggle("atel-toolbar__btn--active", id === this.currentView);
    }

    // Show/hide panels
    this.canvasPanel.el.style.display = "none";
    this.layerPanel.el.style.display = "none";
    this.propertyPanel.el.style.display = "none";
    this.yamlPanel.el.style.display = "none";

    this.body.className = "atel-body";

    switch (this.currentView) {
      case "preview":
        this.body.classList.add("atel-body--preview");
        this.canvasPanel.el.style.display = "";
        break;
      case "yaml":
        this.body.classList.add("atel-body--yaml");
        this.yamlPanel.el.style.display = "";
        this.yamlPanel.refresh();
        break;
      case "editor":
        this.body.classList.add("atel-body--editor");
        this.layerPanel.el.style.display = "";
        this.canvasPanel.el.style.display = "";
        this.propertyPanel.el.style.display = "";
        break;
    }
  }

  private onDocChange(): void {
    // Re-render canvas
    this.canvasPanel.refresh();

    // Update YAML if visible
    if (this.currentView === "yaml") {
      this.yamlPanel.refresh();
    }

    // Refresh layer panel (visibility toggles, etc.)
    this.layerPanel.refresh();

    // Notify consumer
    if (this.doc) {
      this.opts.onDocumentChange?.(this.doc);
    }
  }

  private resetDocument(): void {
    if (this.originalDoc) {
      this.loadDocument(this.originalDoc);
    }
  }
}
