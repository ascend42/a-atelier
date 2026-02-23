import type { Fill, GradientStop } from "@a-company/atelier-types";
import { ColorPicker } from "./color-picker.js";
import { NumberInput } from "./number-input.js";
import { SelectInput } from "./select-input.js";
import { GradientEditor } from "./gradient-editor.js";

export interface FillEditorOptions {
  fill: Fill;
  onChange: (fill: Fill) => void;
}

const FILL_TYPE_OPTIONS = [
  { label: "Solid", value: "solid" },
  { label: "Linear Gradient", value: "linear-gradient" },
  { label: "Radial Gradient", value: "radial-gradient" },
];

export class FillEditor {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement, private opts: FillEditorOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-fill-editor";

    new SelectInput(this.el, {
      label: "Fill Type",
      value: opts.fill.type,
      options: FILL_TYPE_OPTIONS,
      onChange: (v) => this.switchType(v as Fill["type"]),
    });

    this.body = document.createElement("div");
    this.body.className = "atel-fill-editor__body";
    this.el.appendChild(this.body);

    parent.appendChild(this.el);

    this.buildBody();
  }

  private buildBody(): void {
    this.body.innerHTML = "";
    const fill = this.opts.fill;

    if (fill.type === "solid") {
      const color = typeof fill.color === "string" ? fill.color : "#888888";
      new ColorPicker(this.body, {
        label: "Color",
        value: color,
        onChange: (v) => {
          if (this.opts.fill.type === "solid") {
            this.opts.fill.color = v;
            this.opts.onChange(this.opts.fill);
          }
        },
      });
    } else if (fill.type === "linear-gradient") {
      new NumberInput(this.body, {
        label: "Angle",
        value: fill.angle,
        step: 1,
        suffix: "\u00B0",
        onChange: (v) => {
          if (this.opts.fill.type === "linear-gradient") {
            this.opts.fill.angle = v;
            this.opts.onChange(this.opts.fill);
          }
        },
      });

      new GradientEditor(this.body, {
        stops: fill.stops,
        onChange: (stops) => {
          if (this.opts.fill.type === "linear-gradient") {
            this.opts.fill.stops = stops;
            this.opts.onChange(this.opts.fill);
          }
        },
      });
    } else if (fill.type === "radial-gradient") {
      const row = document.createElement("div");
      row.className = "atel-prop-row";
      this.body.appendChild(row);

      new NumberInput(row, {
        label: "Center X",
        value: parseUnit(fill.center.x),
        step: 1,
        suffix: "%",
        onChange: (v) => {
          if (this.opts.fill.type === "radial-gradient") {
            this.opts.fill.center.x = `${v}%`;
            this.opts.onChange(this.opts.fill);
          }
        },
      });

      new NumberInput(row, {
        label: "Center Y",
        value: parseUnit(fill.center.y),
        step: 1,
        suffix: "%",
        onChange: (v) => {
          if (this.opts.fill.type === "radial-gradient") {
            this.opts.fill.center.y = `${v}%`;
            this.opts.onChange(this.opts.fill);
          }
        },
      });

      new NumberInput(this.body, {
        label: "Radius",
        value: parseUnit(fill.radius),
        step: 1,
        suffix: "%",
        onChange: (v) => {
          if (this.opts.fill.type === "radial-gradient") {
            this.opts.fill.radius = `${v}%`;
            this.opts.onChange(this.opts.fill);
          }
        },
      });

      new GradientEditor(this.body, {
        stops: fill.stops,
        onChange: (stops) => {
          if (this.opts.fill.type === "radial-gradient") {
            this.opts.fill.stops = stops;
            this.opts.onChange(this.opts.fill);
          }
        },
      });
    }
  }

  private switchType(newType: Fill["type"]): void {
    const current = this.opts.fill;
    let newFill: Fill;

    if (newType === "solid") {
      // Gradient → solid: use first stop's color
      const color = extractFirstColor(current);
      newFill = { type: "solid", color };
    } else if (newType === "linear-gradient") {
      const stops = extractStops(current);
      const angle = current.type === "linear-gradient" ? current.angle : 0;
      newFill = { type: "linear-gradient", angle, stops };
    } else {
      const stops = extractStops(current);
      const center = current.type === "radial-gradient"
        ? current.center
        : { x: "50%" as const, y: "50%" as const };
      const radius = current.type === "radial-gradient"
        ? current.radius
        : ("50%" as const);
      newFill = { type: "radial-gradient", center, radius, stops };
    }

    this.opts.fill = newFill;
    this.opts.onChange(newFill);
    this.buildBody();
  }
}

function extractFirstColor(fill: Fill): string {
  if (fill.type === "solid") {
    return typeof fill.color === "string" ? fill.color : "#888888";
  }
  const first = fill.stops[0];
  return first && typeof first.color === "string" ? first.color : "#888888";
}

function extractStops(fill: Fill): GradientStop[] {
  if (fill.type === "solid") {
    const color = typeof fill.color === "string" ? fill.color : "#888888";
    return [
      { offset: 0, color },
      { offset: 1, color: "#ffffff" },
    ];
  }
  return fill.stops;
}

function parseUnit(v: number | string): number {
  if (typeof v === "number") return v;
  return parseFloat(v) || 0;
}
