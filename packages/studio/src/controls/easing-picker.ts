import type { Easing } from "@atelier/types";

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

  constructor(parent: HTMLElement, private opts: EasingPickerOptions) {
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
    // Config fields for complex easing types could go here in a future iteration
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
    this.updateConfig();
    this.opts.onChange(easing);
  }

  setValue(v: Easing | undefined): void {
    this.syncFromValue(v);
  }
}
