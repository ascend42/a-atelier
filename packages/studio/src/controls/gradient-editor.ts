import type { GradientStop } from "@atelier/types";
import { ColorPicker } from "./color-picker.js";
import { SliderInput } from "./slider-input.js";

export interface GradientEditorOptions {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}

export class GradientEditor {
  readonly el: HTMLElement;
  private stopsContainer: HTMLElement;
  private preview: HTMLElement;

  constructor(parent: HTMLElement, private opts: GradientEditorOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-gradient-editor";

    // Preview bar
    this.preview = document.createElement("div");
    this.preview.className = "atel-gradient-editor__preview";
    this.el.appendChild(this.preview);

    // Stops container
    this.stopsContainer = document.createElement("div");
    this.stopsContainer.className = "atel-gradient-editor__stops";
    this.el.appendChild(this.stopsContainer);

    // Add stop button
    const addBtn = document.createElement("button");
    addBtn.className = "atel-gradient-editor__add";
    addBtn.textContent = "+ Add Stop";
    addBtn.addEventListener("click", () => this.addStop());
    this.el.appendChild(addBtn);

    parent.appendChild(this.el);

    this.buildStops();
    this.updatePreview();
  }

  private buildStops(): void {
    this.stopsContainer.innerHTML = "";
    const sorted = this.sortedStops();

    for (let i = 0; i < sorted.length; i++) {
      const stop = sorted[i];
      const row = document.createElement("div");
      row.className = "atel-gradient-editor__stop";

      const color = typeof stop.color === "string" ? stop.color : "#888888";
      new ColorPicker(row, {
        label: "",
        value: color,
        onChange: (v) => {
          stop.color = v;
          this.updatePreview();
          this.opts.onChange(this.opts.stops);
        },
      });

      new SliderInput(row, {
        label: "",
        value: stop.offset,
        min: 0,
        max: 1,
        step: 0.01,
        onChange: (v) => {
          stop.offset = v;
          this.updatePreview();
          this.opts.onChange(this.opts.stops);
        },
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "atel-gradient-editor__remove";
      removeBtn.textContent = "\u00D7";
      removeBtn.disabled = this.opts.stops.length <= 2;
      removeBtn.addEventListener("click", () => {
        const idx = this.opts.stops.indexOf(stop);
        if (idx !== -1 && this.opts.stops.length > 2) {
          this.opts.stops.splice(idx, 1);
          this.buildStops();
          this.updatePreview();
          this.opts.onChange(this.opts.stops);
        }
      });
      row.appendChild(removeBtn);

      this.stopsContainer.appendChild(row);
    }
  }

  private addStop(): void {
    const sorted = this.sortedStops();
    const a = sorted[sorted.length - 2];
    const b = sorted[sorted.length - 1];
    const offset = (a.offset + b.offset) / 2;
    const color = typeof b.color === "string" ? b.color : "#888888";
    this.opts.stops.push({ offset, color });
    this.buildStops();
    this.updatePreview();
    this.opts.onChange(this.opts.stops);
  }

  private sortedStops(): GradientStop[] {
    return [...this.opts.stops].sort((a, b) => a.offset - b.offset);
  }

  private updatePreview(): void {
    const sorted = this.sortedStops();
    const parts = sorted.map((s) => {
      const c = typeof s.color === "string" ? s.color : "#888888";
      return `${c} ${(s.offset * 100).toFixed(0)}%`;
    });
    this.preview.style.background =
      `linear-gradient(90deg, ${parts.join(", ")})`;
  }
}
