import type { Easing } from "@a-company/atelier-types";
import { EasingCurveEditor } from "./easing-curve-editor.js";
import { NumberInput } from "./number-input.js";
import { SelectInput } from "./select-input.js";

export interface EasingPickerOptions {
  label: string;
  value: Easing | undefined;
  onChange: (value: Easing | undefined) => void;
}

const PRESET_OPTIONS = [
  { label: "Linear", value: "linear" },
  { label: "Ease In", value: "ease-in" },
  { label: "Ease Out", value: "ease-out" },
  { label: "Ease In-Out", value: "ease-in-out" },
  { label: "Spring", value: "spring" },
  { label: "Cubic Bezier", value: "cubic-bezier" },
  { label: "Step", value: "step" },
];

export class EasingPicker {
  readonly el: HTMLElement;
  private select: HTMLSelectElement;
  private configContainer: HTMLElement;
  private curveEditor: EasingCurveEditor | null = null;
  private currentEasing: Easing | undefined;

  constructor(parent: HTMLElement, private opts: EasingPickerOptions) {
    this.currentEasing = opts.value;
    this.el = document.createElement("div");
    this.el.className = "atel-easing-picker";

    const label = document.createElement("label");
    label.className = "atel-control-label";
    label.textContent = opts.label;

    this.select = document.createElement("select");
    this.select.className = "atel-input";

    for (const o of PRESET_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      this.select.appendChild(opt);
    }

    this.configContainer = document.createElement("div");
    this.configContainer.className = "atel-easing-picker__config";

    this.el.appendChild(label);
    this.el.appendChild(this.select);
    this.el.appendChild(this.configContainer);
    parent.appendChild(this.el);

    // Set initial selection
    this.syncFromValue(opts.value);

    this.select.addEventListener("change", () => {
      this.emitChange();
    });
  }

  private syncFromValue(v: Easing | undefined): void {
    this.currentEasing = v;
    if (!v) {
      this.select.value = "linear";
    } else if (typeof v === "string") {
      this.select.value = v;
    } else {
      this.select.value = v.type;
    }
    this.updateConfig();
  }

  private updateConfig(): void {
    this.configContainer.innerHTML = "";
    this.curveEditor?.destroy();
    this.curveEditor = null;

    const easing = this.currentEasing;

    // Curve preview for all types
    this.curveEditor = new EasingCurveEditor(this.configContainer, {
      value: easing,
      onChange: (v) => {
        this.currentEasing = v;
        this.opts.onChange(v);
      },
    });

    // Config inputs for parameterized types
    if (typeof easing !== "string" && easing) {
      if (easing.type === "cubic-bezier") {
        this.buildBezierConfig(easing);
      } else if (easing.type === "spring") {
        this.buildSpringConfig(easing);
      } else if (easing.type === "step") {
        this.buildStepConfig(easing);
      }
    }
  }

  private buildBezierConfig(easing: { type: "cubic-bezier"; x1: number; y1: number; x2: number; y2: number }): void {
    const row = document.createElement("div");
    row.className = "atel-easing-picker__params";

    new NumberInput(row, {
      label: "x1",
      value: easing.x1,
      step: 0.01,
      min: 0,
      max: 1,
      onChange: (v) => {
        easing.x1 = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });
    new NumberInput(row, {
      label: "y1",
      value: easing.y1,
      step: 0.01,
      onChange: (v) => {
        easing.y1 = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });
    new NumberInput(row, {
      label: "x2",
      value: easing.x2,
      step: 0.01,
      min: 0,
      max: 1,
      onChange: (v) => {
        easing.x2 = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });
    new NumberInput(row, {
      label: "y2",
      value: easing.y2,
      step: 0.01,
      onChange: (v) => {
        easing.y2 = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });

    this.configContainer.appendChild(row);
  }

  private buildSpringConfig(easing: { type: "spring"; mass?: number; stiffness?: number; damping?: number }): void {
    const row = document.createElement("div");
    row.className = "atel-easing-picker__params";

    new NumberInput(row, {
      label: "Mass",
      value: easing.mass ?? 1,
      step: 0.1,
      min: 0.1,
      onChange: (v) => {
        easing.mass = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });
    new NumberInput(row, {
      label: "Stiffness",
      value: easing.stiffness ?? 100,
      step: 10,
      min: 1,
      onChange: (v) => {
        easing.stiffness = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });
    new NumberInput(row, {
      label: "Damping",
      value: easing.damping ?? 10,
      step: 1,
      min: 0,
      onChange: (v) => {
        easing.damping = v;
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });

    this.configContainer.appendChild(row);
  }

  private buildStepConfig(easing: { type: "step"; steps: number; position?: "start" | "end" }): void {
    const row = document.createElement("div");
    row.className = "atel-easing-picker__params";

    new NumberInput(row, {
      label: "Steps",
      value: easing.steps,
      step: 1,
      min: 1,
      max: 20,
      onChange: (v) => {
        easing.steps = Math.round(v);
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });
    new SelectInput(row, {
      label: "Position",
      value: easing.position ?? "end",
      options: [
        { label: "End", value: "end" },
        { label: "Start", value: "start" },
      ],
      onChange: (v) => {
        easing.position = v as "start" | "end";
        this.curveEditor?.setValue(easing);
        this.opts.onChange(easing);
      },
    });

    this.configContainer.appendChild(row);
  }

  private emitChange(): void {
    const val = this.select.value;
    let easing: Easing | undefined;
    if (val === "linear") {
      easing = { type: "linear" };
    } else if (val === "ease-in" || val === "ease-out" || val === "ease-in-out") {
      easing = val;
    } else if (val === "spring") {
      easing = { type: "spring", mass: 1, stiffness: 100, damping: 10 };
    } else if (val === "cubic-bezier") {
      easing = { type: "cubic-bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    } else if (val === "step") {
      easing = { type: "step", steps: 5, position: "end" };
    }
    this.currentEasing = easing;
    this.updateConfig();
    this.opts.onChange(easing);
  }

  setValue(v: Easing | undefined): void {
    this.syncFromValue(v);
  }
}
