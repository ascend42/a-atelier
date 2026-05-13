export interface ColorPickerOptions {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export class ColorPicker {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private hex: HTMLSpanElement;

  constructor(parent: HTMLElement, opts: ColorPickerOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-color-picker";

    const label = document.createElement("label");
    label.className = "atel-control-label";
    label.textContent = opts.label;

    const wrap = document.createElement("div");
    wrap.className = "atel-color-picker__wrap";

    this.input = document.createElement("input");
    this.input.type = "color";
    this.input.className = "atel-color-picker__input";
    this.input.value = normalizeHex(opts.value);

    this.hex = document.createElement("span");
    this.hex.className = "atel-color-picker__hex";
    this.hex.textContent = this.input.value;

    wrap.appendChild(this.input);
    wrap.appendChild(this.hex);
    this.el.appendChild(label);
    this.el.appendChild(wrap);
    parent.appendChild(this.el);

    this.input.addEventListener("input", () => {
      this.hex.textContent = this.input.value;
      opts.onChange(this.input.value);
    });
  }

  setValue(v: string): void {
    this.input.value = normalizeHex(v);
    this.hex.textContent = this.input.value;
  }
}

function normalizeHex(c: string): string {
  if (c.startsWith("#") && c.length >= 7) return c.slice(0, 7);
  if (c.startsWith("#") && c.length === 4) {
    return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  }
  return c;
}
