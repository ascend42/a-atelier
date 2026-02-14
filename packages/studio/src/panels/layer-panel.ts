import type { AtelierDocument, Layer } from "@atelier/types";

const TYPE_ICONS: Record<string, string> = {
  shape: "\u25A0",
  text: "T",
  image: "\u25A3",
  group: "\u25A8",
  ref: "\u2192",
};

export interface LayerPanelOptions {
  onSelectLayer: (layerId: string | null) => void;
  onDocumentChange: () => void;
}

export class LayerPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private doc: AtelierDocument | null = null;
  private selectedId: string | null = null;

  constructor(parent: HTMLElement, private opts: LayerPanelOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-layer-panel";

    // Header
    const header = document.createElement("div");
    header.className = "atel-panel-header";
    header.textContent = "Layers";
    this.el.appendChild(header);

    // List
    this.list = document.createElement("div");
    this.list.className = "atel-layer-list";
    this.el.appendChild(this.list);

    // Actions
    const actions = document.createElement("div");
    actions.className = "atel-layer-actions";

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", () => this.addLayer());

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "- Remove";
    removeBtn.addEventListener("click", () => this.removeLayer());

    actions.appendChild(addBtn);
    actions.appendChild(removeBtn);
    this.el.appendChild(actions);

    parent.appendChild(this.el);
  }

  loadDocument(doc: AtelierDocument): void {
    this.doc = doc;
    this.selectedId = null;
    this.render();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  selectLayer(id: string | null): void {
    this.selectedId = id;
    this.render();
    this.opts.onSelectLayer(id);
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.list.innerHTML = "";
    if (!this.doc) return;

    for (const layer of this.doc.layers) {
      const item = document.createElement("div");
      item.className = `atel-layer-item${layer.id === this.selectedId ? " atel-layer-item--selected" : ""}`;

      const icon = document.createElement("span");
      icon.className = "atel-layer-item__icon";
      icon.textContent = TYPE_ICONS[layer.visual.type] ?? "?";

      const idSpan = document.createElement("span");
      idSpan.className = "atel-layer-item__id";
      idSpan.textContent = layer.id;

      const visBtn = document.createElement("button");
      visBtn.className = "atel-layer-item__vis";
      visBtn.textContent = layer.visible === false ? "\u25CB" : "\u25C9";
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.visible = layer.visible === false ? true : false;
        this.render();
        this.opts.onDocumentChange();
      });

      item.appendChild(icon);
      item.appendChild(idSpan);
      item.appendChild(visBtn);

      item.addEventListener("click", () => {
        this.selectLayer(layer.id);
      });

      this.list.appendChild(item);
    }
  }

  private addLayer(): void {
    if (!this.doc) return;
    const id = `layer-${this.doc.layers.length + 1}`;
    const newLayer: Layer = {
      id,
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: "#888888" },
      },
      frame: { x: 50, y: 50 },
      bounds: { width: 100, height: 100 },
      opacity: 1,
    };
    this.doc.layers.push(newLayer);
    this.selectLayer(id);
    this.opts.onDocumentChange();
  }

  private removeLayer(): void {
    if (!this.doc || !this.selectedId) return;
    const idx = this.doc.layers.findIndex((l) => l.id === this.selectedId);
    if (idx === -1) return;
    this.doc.layers.splice(idx, 1);

    // Remove associated deltas from all states
    for (const state of Object.values(this.doc.states)) {
      state.deltas = state.deltas.filter((d) => d.layer !== this.selectedId);
    }

    this.selectedId = null;
    this.render();
    this.opts.onSelectLayer(null);
    this.opts.onDocumentChange();
  }
}
