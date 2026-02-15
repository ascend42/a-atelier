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

    // Shadow
    this.addShadowSection(layer);

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

      // Path point editing
      if (visual.shape.type === "path") {
        this.addSection("Path Points", () => {
          const points = visual.shape.points;
          for (let i = 0; i < points.length; i++) {
            const row = this.makeRow();
            const label = document.createElement("span");
            label.className = "atel-control-label";
            label.textContent = `P${i}`;
            label.style.minWidth = "24px";
            row.appendChild(label);

            const idx = i; // capture for closures
            new NumberInput(row, {
              label: "X", value: points[idx].x, step: 1,
              onChange: (v) => { points[idx].x = v; this.opts.onPropertyChange(); },
            });
            new NumberInput(row, {
              label: "Y", value: points[idx].y, step: 1,
              onChange: (v) => { points[idx].y = v; this.opts.onPropertyChange(); },
            });

            const rmBtn = document.createElement("button");
            rmBtn.className = "atel-toolbar__btn";
            rmBtn.textContent = "\u2715";
            rmBtn.style.padding = "2px 6px";
            rmBtn.addEventListener("click", () => {
              points.splice(idx, 1);
              this.render();
              this.opts.onPropertyChange();
            });
            row.appendChild(rmBtn);
          }

          // Closed toggle
          const closedRow = this.makeRow(true);
          const closedLabel = document.createElement("label");
          closedLabel.className = "atel-control-label";
          closedLabel.textContent = "Closed";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = visual.shape.closed ?? false;
          checkbox.addEventListener("change", () => {
            if (visual.shape.type === "path") {
              visual.shape.closed = checkbox.checked;
              this.opts.onPropertyChange();
            }
          });
          closedRow.appendChild(closedLabel);
          closedRow.appendChild(checkbox);

          // Add point button
          const addRow = this.makeRow(true);
          const addBtn = document.createElement("button");
          addBtn.className = "atel-toolbar__btn";
          addBtn.textContent = "+ Add Point";
          addBtn.addEventListener("click", () => {
            if (visual.shape.type === "path") {
              const last = visual.shape.points[visual.shape.points.length - 1] ?? { x: 0, y: 0 };
              visual.shape.points.push({ x: last.x + 20, y: last.y });
              this.render();
              this.opts.onPropertyChange();
            }
          });
          addRow.appendChild(addBtn);
        });
      }
    }

    if (visual.type === "image") {
      this.addSection("Image", () => {
        const iv = visual;

        // Asset ID (read-only display)
        const row1 = this.makeRow(true);
        this.addTextInput(row1, "Asset ID", iv.assetId ?? "", (v) => {
          iv.assetId = v;
          this.opts.onPropertyChange();
        });

        // src (direct URL / data-URL)
        const row2 = this.makeRow(true);
        this.addTextInput(row2, "Src", iv.src ?? "", (v) => {
          iv.src = v;
          this.opts.onPropertyChange();
        });

        // If doc.assets has a matching asset, show "Use Asset" button
        if (this.doc && iv.assetId && this.doc.assets?.[iv.assetId]) {
          const row3 = this.makeRow(true);
          const useBtn = document.createElement("button");
          useBtn.className = "atel-toolbar__btn";
          useBtn.textContent = "Use Asset";
          useBtn.addEventListener("click", () => {
            if (this.doc?.assets?.[iv.assetId]) {
              iv.src = this.doc.assets[iv.assetId].src;
              this.render();
              this.opts.onPropertyChange();
            }
          });
          row3.appendChild(useBtn);
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

  private addShadowSection(layer: Layer): void {
    if (!layer.shadow) {
      // Show "Add Shadow" button
      this.addSection("Shadow", () => {
        const row = this.makeRow(true);
        const addBtn = document.createElement("button");
        addBtn.className = "atel-toolbar__btn";
        addBtn.textContent = "+ Add Shadow";
        addBtn.addEventListener("click", () => {
          layer.shadow = { color: "#00000080", blur: 10 };
          this.render();
          this.opts.onPropertyChange();
        });
        row.appendChild(addBtn);
      });
      return;
    }

    this.addSection("Shadow", () => {
      const shadow = layer.shadow!;

      const row1 = this.makeRow(true);
      const shadowColor = typeof shadow.color === "string" ? shadow.color : "#00000080";
      new ColorPicker(row1, {
        label: "Color",
        value: shadowColor,
        onChange: (v) => {
          shadow.color = v;
          this.opts.onPropertyChange();
        },
      });

      const row2 = this.makeRow(true);
      new SliderInput(row2, {
        label: "Blur",
        value: shadow.blur,
        min: 0, max: 50, step: 1,
        onChange: (v) => {
          shadow.blur = v;
          this.opts.onPropertyChange();
        },
      });

      const row3 = this.makeRow();
      new NumberInput(row3, {
        label: "Offset X", value: shadow.offsetX ?? 0, step: 1,
        onChange: (v) => { shadow.offsetX = v; this.opts.onPropertyChange(); },
      });
      new NumberInput(row3, {
        label: "Offset Y", value: shadow.offsetY ?? 0, step: 1,
        onChange: (v) => { shadow.offsetY = v; this.opts.onPropertyChange(); },
      });

      // Remove shadow button
      const row4 = this.makeRow(true);
      const rmBtn = document.createElement("button");
      rmBtn.className = "atel-toolbar__btn";
      rmBtn.textContent = "Remove Shadow";
      rmBtn.addEventListener("click", () => {
        delete layer.shadow;
        this.render();
        this.opts.onPropertyChange();
      });
      row4.appendChild(rmBtn);
    });
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
