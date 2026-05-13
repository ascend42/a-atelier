export interface SliderInputOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export class SliderInput {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private display: HTMLSpanElement;

  constructor(parent: HTMLElement, opts: SliderInputOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-slider-input";

    const label = document.createElement("label");
    label.className = "atel-control-label";
    label.textContent = opts.label;

    const wrap = document.createElement("div");
    wrap.className = "atel-slider-input__wrap";

    this.input = document.createElement("input");
    this.input.type = "range";
    this.input.className = "atel-slider-input__range";
    this.input.min = String(opts.min);
    this.input.max = String(opts.max);
    this.input.step = String(opts.step ?? 0.01);
    this.input.value = String(opts.value);

    this.display = document.createElement("span");
    this.display.className = "atel-slider-input__value";
    this.display.textContent = formatValue(opts.value);

    wrap.appendChild(this.input);
    wrap.appendChild(this.display);
    this.el.appendChild(label);
    this.el.appendChild(wrap);
    parent.appendChild(this.el);

    this.input.addEventListener("input", () => {
      const v = parseFloat(this.input.value);
      this.display.textContent = formatValue(v);
      opts.onChange(v);
    });
  }

  setValue(v: number): void {
    this.input.value = String(v);
    this.display.textContent = formatValue(v);
  }
}

function formatValue(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}
