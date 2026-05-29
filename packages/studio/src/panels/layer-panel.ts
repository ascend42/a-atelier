import type { AtelierDocument, Layer } from "@a-company/atelier-types";
import { enableDragReorder } from "../utils/drag-reorder.js";
import { createImageLayerFromFile } from "../utils/image-drop.js";

const TYPE_ICONS: Record<string, string> = {
  shape: "\u25A0",
  text: "T",
  image: "\u25A3",
  video: "\u25B6", // \u25B6
  audio: "\u266A", // \u266A
  group: "\u25A8",
  ref: "\u2192",
};

/**
 * Variants offered by the + Add menu. Each variant is responsible for
 * producing a fully-formed Layer; the panel then appends it, selects it,
 * and fires onDocumentChange.
 *
 * "Handle" and "Page Number" carry tags:["overlay"] so the layer-tag
 * isolation invariant applies \u2014 re-running an overlay pipeline (caption
 * regen, silence-trim, etc.) will not touch user-edited overlays.
 */
type AddVariant = "text" | "shape" | "image" | "handle" | "page-number";

interface AddMenuOption {
  variant: AddVariant;
  icon: string;
  label: string;
}

const ADD_MENU: AddMenuOption[] = [
  { variant: "text",        icon: "T", label: "Text" },
  { variant: "shape",       icon: "\u25A0", label: "Shape" },
  { variant: "image",       icon: "\u25A3", label: "Image" },
  { variant: "handle",      icon: "@", label: "Handle" },
  { variant: "page-number", icon: "#", label: "Page Number" },
];

export interface LayerPanelOptions {
  onSelectLayer: (layerId: string | null) => void;
  onDocumentChange: () => void;
}

export class LayerPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private doc: AtelierDocument | null = null;
  private selectedId: string | null = null;
  private addMenu: HTMLElement | null = null;
  private addBtn: HTMLButtonElement | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

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

    enableDragReorder({
      list: this.list,
      itemClass: "atel-layer-item",
      onReorder: (from, to) => this.reorderLayer(from, to),
    });

    // Actions
    const actions = document.createElement("div");
    actions.className = "atel-layer-actions";
    // Anchor for absolute-positioned popover menu.
    actions.style.position = "relative";

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleAddMenu();
    });
    this.addBtn = addBtn;

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

  removeSelectedLayer(): void {
    this.removeLayer();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const scrollTop = this.list.scrollTop;
    this.list.innerHTML = "";
    if (!this.doc) return;

    for (const layer of this.doc.layers) {
      const item = document.createElement("div");
      item.className = `atel-layer-item${layer.id === this.selectedId ? " atel-layer-item--selected" : ""}`;

      const handle = document.createElement("span");
      handle.className = "atel-drag-handle";
      handle.textContent = "\u2630";

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

      item.appendChild(handle);
      item.appendChild(icon);
      item.appendChild(idSpan);
      item.appendChild(visBtn);

      item.addEventListener("click", () => {
        this.selectLayer(layer.id);
      });

      this.list.appendChild(item);
    }
    this.list.scrollTop = scrollTop;
  }

  private reorderLayer(from: number, to: number): void {
    if (!this.doc) return;
    const [moved] = this.doc.layers.splice(from, 1);
    this.doc.layers.splice(to, 0, moved);
    this.render();
    this.opts.onDocumentChange();
  }

  /**
   * Toggle the popover menu attached to the + Add button. The menu has one
   * option per AddVariant. Clicking outside the menu closes it.
   */
  private toggleAddMenu(): void {
    if (this.addMenu) {
      this.closeAddMenu();
      return;
    }
    if (!this.addBtn) return;

    const menu = document.createElement("div");
    menu.className = "atel-layer-add-menu";
    // Inline styling keeps the menu self-contained — matches the
    // existing atel-layer-actions visual language without requiring new
    // CSS classes (the embedding app may have its own theme overrides).
    menu.style.cssText = [
      "position:absolute",
      "bottom:calc(100% + 4px)",
      "left:8px",
      "z-index:50",
      "min-width:160px",
      "background:var(--atel-bg-tertiary, #3D3D3D)",
      "border:1px solid var(--atel-border, #4A4A4A)",
      "border-radius:4px",
      "padding:4px",
      "display:flex",
      "flex-direction:column",
      "gap:2px",
      "box-shadow:0 6px 24px rgba(0,0,0,0.4)",
    ].join(";");

    for (const opt of ADD_MENU) {
      const item = document.createElement("button");
      item.type = "button";
      item.dataset.variant = opt.variant;
      item.className = "atel-layer-add-menu__item";
      item.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:10px",
        "padding:6px 10px",
        "background:transparent",
        "border:none",
        "border-radius:3px",
        "color:var(--atel-text, #F5F0EB)",
        "font-family:var(--atel-font-family, inherit)",
        "font-size:12px",
        "cursor:pointer",
        "text-align:left",
        "flex:initial",
      ].join(";");
      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--atel-button-hover, #4A4A4A)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

      const icon = document.createElement("span");
      icon.style.cssText = "display:inline-block;width:14px;text-align:center;color:var(--atel-text-muted, #A89F95)";
      icon.textContent = opt.icon;
      const label = document.createElement("span");
      label.textContent = opt.label;
      item.appendChild(icon);
      item.appendChild(label);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeAddMenu();
        this.addLayerOfVariant(opt.variant);
      });
      menu.appendChild(item);
    }

    // Attach to the actions row (relative-positioned anchor).
    this.addBtn.parentElement?.appendChild(menu);
    this.addMenu = menu;

    // Close on outside click. defer attaching so the click that opened
    // the menu doesn't immediately close it.
    this.outsideClickHandler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && (menu.contains(target) || this.addBtn?.contains(target))) return;
      this.closeAddMenu();
    };
    setTimeout(() => {
      if (this.outsideClickHandler) {
        document.addEventListener("click", this.outsideClickHandler);
      }
    }, 0);
  }

  private closeAddMenu(): void {
    if (this.addMenu) {
      this.addMenu.remove();
      this.addMenu = null;
    }
    if (this.outsideClickHandler) {
      document.removeEventListener("click", this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  /**
   * Generate a layer ID that does not collide with anything already in the
   * document. Uses the conventional `layer-N` scheme but increments past
   * existing IDs so re-adding never produces duplicates.
   */
  private nextLayerId(prefix: string = "layer"): string {
    if (!this.doc) return `${prefix}-1`;
    const existing = new Set(this.doc.layers.map((l) => l.id));
    let n = this.doc.layers.length + 1;
    while (existing.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }

  /** Construct a layer for the given variant and append it to the document. */
  private addLayerOfVariant(variant: AddVariant): void {
    if (!this.doc) return;
    const canvasW = this.doc.canvas.width;
    const canvasH = this.doc.canvas.height;
    let newLayer: Layer;

    switch (variant) {
      case "text": {
        const w = 240;
        const h = 40;
        newLayer = {
          id: this.nextLayerId("text"),
          visual: {
            type: "text",
            content: "Text",
            style: {
              fontFamily: "Inter",
              fontSize: 32,
              color: "#F5F5F7",
              textAlign: "center",
            },
          },
          frame: { x: (canvasW - w) / 2, y: (canvasH - h) / 2 },
          bounds: { width: w, height: h },
          anchorPoint: { x: 0.5, y: 0.5 },
          opacity: 1,
        };
        break;
      }
      case "image": {
        // Image creation is async (file picker → FileReader → Image
        // decode) and produces a layer via the shared image-drop
        // helper so this path converges with canvas drag-drop. Bail
        // out of the sync switch — the file-picker flow appends and
        // selects on its own.
        this.openImageFilePicker();
        return;
      }
      case "handle": {
        const w = 400;
        const h = 32;
        const margin = 32;
        newLayer = {
          id: this.nextLayerId("handle"),
          tags: ["overlay"],
          visual: {
            type: "text",
            content: "@username",
            style: {
              fontFamily: "Inter",
              fontSize: 24,
              fontWeight: 600,
              color: "#F5F5F7",
              textAlign: "left",
            },
          },
          frame: { x: margin, y: canvasH - margin - h },
          bounds: { width: w, height: h },
          opacity: 1,
        };
        break;
      }
      case "page-number": {
        const w = 120;
        const h = 24;
        const margin = 32;
        newLayer = {
          id: this.nextLayerId("page"),
          tags: ["overlay"],
          visual: {
            type: "text",
            content: "01/05",
            style: {
              fontFamily: "Inter",
              fontSize: 18,
              fontWeight: 500,
              color: "#9CA3AF",
              textAlign: "right",
            },
          },
          frame: { x: canvasW - margin - w, y: canvasH - margin - h },
          bounds: { width: w, height: h },
          opacity: 1,
        };
        break;
      }
      case "shape":
      default: {
        // Default behaviour preserved from the original implementation.
        newLayer = {
          id: this.nextLayerId("layer"),
          visual: {
            type: "shape",
            shape: { type: "rect" },
            fill: { type: "solid", color: "#888888" },
          },
          frame: { x: 50, y: 50 },
          bounds: { width: 100, height: 100 },
          opacity: 1,
        };
        break;
      }
    }

    this.doc.layers.push(newLayer);
    this.selectLayer(newLayer.id);
    this.opts.onDocumentChange();
  }

  /**
   * Open a hidden <input type="file"> programmatically so the user can
   * pick an image from disk. On selection, route through the same
   * createImageLayerFromFile helper that the canvas drag-drop uses —
   * both entry points converge on a single image-creation path.
   *
   * If the user cancels the file picker (no file chosen), do nothing —
   * we don't want to leave an empty Image layer in the document.
   */
  private openImageFilePicker(): void {
    if (!this.doc) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      const doc = this.doc;
      if (!file || !doc) return;
      void (async () => {
        try {
          // Match canvas-drop semantics: if the user is filling in the
          // welcome scaffold's placeholder, replace it; otherwise stack
          // a new layer at the bottom of the z-stack.
          const replaceBackground = doc.layers[0]?.id === "background";
          const layer = await createImageLayerFromFile(doc, file, { replaceBackground });
          this.selectLayer(layer.id);
          this.opts.onDocumentChange();
        } catch {
          // Silently ignore decode failures — the user just sees no
          // layer appear, and can try a different file.
        }
      })();
    });
    // The picker must be in the DOM in some browsers for click() to work.
    document.body.appendChild(input);
    input.click();
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
