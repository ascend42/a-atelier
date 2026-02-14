import type { AtelierDocument, Layer, AnimatableProperty } from "@atelier/types";
import { NumberInput } from "../controls/number-input.js";
import { ColorPicker } from "../controls/color-picker.js";
import { SelectInput } from "../controls/select-input.js";
import { SliderInput } from "../controls/slider-input.js";
import { FillEditor } from "../controls/fill-editor.js";
import { DeltaPanel } from "./delta-panel.js";

export interface PropertyPanelOptions {
  onPropertyChange: () => void;
}

export class PropertyPanel {
  readonly el: HTMLElement;
  private scroll: HTMLElement;
  private deltaPanel: DeltaPanel | null = null;
  private doc: AtelierDocument | null = null;
  private stateName = "";
  private layerId: string | null = null;

  constructor(parent: HTMLElement, private opts: PropertyPanelOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-property-panel";

    const header = document.createElement("div");
    header.className = "atel-panel-header";
    header.textContent = "Properties";
    this.el.appendChild(header);

    this.scroll = document.createElement("div");
    this.scroll.className = "atel-property-scroll";
    this.el.appendChild(this.scroll);

    parent.appendChild(this.el);
  }

  loadDocument(doc: AtelierDocument, stateName: string): void {
    this.doc = doc;
    this.stateName = stateName;
  }

  setStateName(name: string): void {
    this.stateName = name;
    if (this.layerId) this.selectLayer(this.layerId);
  }

  selectLayer(layerId: string | null): void {
    this.layerId = layerId;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.scroll.innerHTML = "";
    this.deltaPanel = null;

    if (!this.doc || !this.layerId) {
      const empty = document.createElement("div");
      empty.className = "atel-empty";
      empty.textContent = "Select a layer";
      this.scroll.appendChild(empty);
      return;
    }

    const layer = this.doc.layers.find((l) => l.id === this.layerId);
    if (!layer) return;

    // Layer ID
    this.addSection("Layer", () => {
      const row = this.makeRow(true);
      this.addTextInput(row, "ID", layer.id, (v) => {
        // Update all delta references
        for (const state of Object.values(this.doc!.states)) {
          for (const d of state.deltas) {
            if (d.layer === layer.id) d.layer = v;
          }
        }
        layer.id = v;
        this.layerId = v;
        this.opts.onPropertyChange();
      });
    });

    // Position
    this.addSection("Position", () => {
      const row = this.makeRow();
      new NumberInput(row, {
        label: "X", value: layer.frame.x as number, step: 1,
        onChange: (v) => { layer.frame.x = v; this.opts.onPropertyChange(); },
      });
      new NumberInput(row, {
        label: "Y", value: layer.frame.y as number, step: 1,
        onChange: (v) => { layer.frame.y = v; this.opts.onPropertyChange(); },
      });
    });

    // Size
    this.addSection("Size", () => {
      const row = this.makeRow();
      new NumberInput(row, {
        label: "W", value: layer.bounds.width as number, step: 1, min: 1,
        onChange: (v) => { layer.bounds.width = v; this.opts.onPropertyChange(); },
      });
      new NumberInput(row, {
        label: "H", value: layer.bounds.height as number, step: 1, min: 1,
        onChange: (v) => { layer.bounds.height = v; this.opts.onPropertyChange(); },
      });
    });

    // Transform
    this.addSection("Transform", () => {
      const row1 = this.makeRow(true);
      new SliderInput(row1, {
        label: "Opacity", value: layer.opacity ?? 1, min: 0, max: 1, step: 0.01,
        onChange: (v) => { layer.opacity = v; this.opts.onPropertyChange(); },
      });

      const row2 = this.makeRow();
      new NumberInput(row2, {
        label: "Rotation", value: layer.rotation ?? 0, step: 1, suffix: "\u00B0",
        onChange: (v) => { layer.rotation = v; this.opts.onPropertyChange(); },
      });

      const row3 = this.makeRow();
      new NumberInput(row3, {
        label: "Scale X", value: layer.scale?.x ?? 1, step: 0.1,
        onChange: (v) => {
          if (!layer.scale) layer.scale = { x: 1, y: 1 };
          layer.scale.x = v;
          this.opts.onPropertyChange();
        },
      });
      new NumberInput(row3, {
        label: "Scale Y", value: layer.scale?.y ?? 1, step: 0.1,
        onChange: (v) => {
          if (!layer.scale) layer.scale = { x: 1, y: 1 };
          layer.scale.y = v;
          this.opts.onPropertyChange();
        },
      });
    });

    // Visual-specific properties
    this.addVisualSection(layer);

    // Deltas
    const state = this.doc.states[this.stateName];
    if (state) {
      this.deltaPanel = new DeltaPanel(this.scroll, {
        doc: this.doc,
        state,
        stateName: this.stateName,
        layerId: this.layerId,
        onDeltaChange: () => this.opts.onPropertyChange(),
      });
    }
  }

  private addVisualSection(layer: Layer): void {
    const visual = layer.visual;

    if (visual.type === "shape") {
      this.addSection("Visual", () => {
        // Fill
        if (visual.fill) {
          const row = this.makeRow(true);
          new FillEditor(row, {
            fill: visual.fill,
            onChange: (newFill) => {
              visual.fill = newFill;
              this.opts.onPropertyChange();
            },
          });
        }

        // Stroke
        if (visual.stroke) {
          const row = this.makeRow(true);
          const strokeColor = typeof visual.stroke.color === "string"
            ? visual.stroke.color : "#000000";
          new ColorPicker(row, {
            label: "Stroke",
            value: strokeColor,
            onChange: (v) => {
              if (visual.stroke) {
                visual.stroke.color = v;
                this.opts.onPropertyChange();
              }
            },
          });

          const row2 = this.makeRow(true);
          new NumberInput(row2, {
            label: "Stroke Width",
            value: visual.stroke.width,
            step: 1,
            min: 0,
            onChange: (v) => {
              if (visual.stroke) {
                visual.stroke.width = v;
                this.opts.onPropertyChange();
              }
            },
          });

          const row2b = this.makeRow();
          new SliderInput(row2b, {
            label: "Start",
            value: visual.stroke.strokeStart ?? 0,
            min: 0, max: 1, step: 0.01,
            onChange: (v) => {
              if (visual.stroke) {
                visual.stroke.strokeStart = v;
                this.opts.onPropertyChange();
              }
            },
          });
          new SliderInput(row2b, {
            label: "End",
            value: visual.stroke.strokeEnd ?? 1,
            min: 0, max: 1, step: 0.01,
            onChange: (v) => {
              if (visual.stroke) {
                visual.stroke.strokeEnd = v;
                this.opts.onPropertyChange();
              }
            },
          });
        }

        // Corner radius (rect only)
        if (visual.shape.type === "rect") {
          const cr = typeof visual.shape.cornerRadius === "number"
            ? visual.shape.cornerRadius : 0;
          const row = this.makeRow(true);
          new NumberInput(row, {
            label: "Corner Radius",
            value: cr,
            step: 1,
            min: 0,
            onChange: (v) => {
              if (visual.shape.type === "rect") {
                visual.shape.cornerRadius = v;
                this.opts.onPropertyChange();
              }
            },
          });
        }
      });
    }

    if (visual.type === "text") {
      this.addSection("Text", () => {
        const row1 = this.makeRow(true);
        this.addTextInput(row1, "Content", visual.content, (v) => {
          visual.content = v;
          this.opts.onPropertyChange();
        });

        const row2 = this.makeRow();
        new NumberInput(row2, {
          label: "Font Size",
          value: visual.style.fontSize,
          step: 1,
          min: 1,
          onChange: (v) => {
            visual.style.fontSize = v;
            this.opts.onPropertyChange();
          },
        });

        const textColor = typeof visual.style.color === "string"
          ? visual.style.color : "#FFFFFF";
        new ColorPicker(row2, {
          label: "Color",
          value: textColor,
          onChange: (v) => {
            visual.style.color = v;
            this.opts.onPropertyChange();
          },
        });

        const row3 = this.makeRow();
        new SelectInput(row3, {
          label: "Align",
          value: visual.style.textAlign ?? "left",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
          onChange: (v) => {
            visual.style.textAlign = v as "left" | "center" | "right";
            this.opts.onPropertyChange();
          },
        });
      });
    }
  }

  private addSection(title: string, buildContent: () => void): void {
    const section = document.createElement("div");
    section.className = "atel-prop-section";

    const titleEl = document.createElement("div");
    titleEl.className = "atel-prop-section__title";
    titleEl.textContent = title;
    section.appendChild(titleEl);

    this.scroll.appendChild(section);
    buildContent();
  }

  private makeRow(full = false): HTMLElement {
    const row = document.createElement("div");
    row.className = full ? "atel-prop-row atel-prop-row--full" : "atel-prop-row";
    // Find last section in scroll and append
    const sections = this.scroll.querySelectorAll(".atel-prop-section");
    const lastSection = sections[sections.length - 1];
    if (lastSection) lastSection.appendChild(row);
    return row;
  }

  private addTextInput(parent: HTMLElement, label: string, value: string, onChange: (v: string) => void): void {
    const wrap = document.createElement("div");
    const lbl = document.createElement("label");
    lbl.className = "atel-control-label";
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "atel-input";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    wrap.appendChild(lbl);
    wrap.appendChild(input);
    parent.appendChild(wrap);
  }
}
