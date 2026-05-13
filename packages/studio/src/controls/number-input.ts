export interface NumberInputOptions {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

export class NumberInput {
  readonly el: HTMLElement;
  private input: HTMLInputElement;

  constructor(parent: HTMLElement, opts: NumberInputOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-number-input";

    const label = document.createElement("label");
    label.className = "atel-control-label";
    label.textContent = opts.label;

    const wrap = document.createElement("div");
    wrap.className = "atel-number-input__wrap";

    this.input = document.createElement("input");
    this.input.type = "number";
    this.input.className = "atel-input";
    this.input.value = String(opts.value);
    if (opts.step !== undefined) this.input.step = String(opts.step);
    if (opts.min !== undefined) this.input.min = String(opts.min);
    if (opts.max !== undefined) this.input.max = String(opts.max);

    wrap.appendChild(this.input);

    if (opts.suffix) {
      const suf = document.createElement("span");
      suf.className = "atel-number-input__suffix";
      suf.textContent = opts.suffix;
      wrap.appendChild(suf);
    }

    this.el.appendChild(label);
    this.el.appendChild(wrap);
    parent.appendChild(this.el);

    this.input.addEventListener("input", () => {
      const v = parseFloat(this.input.value);
      if (!isNaN(v)) opts.onChange(v);
    });
  }

  setValue(v: number): void {
    this.input.value = String(v);
  }
}
