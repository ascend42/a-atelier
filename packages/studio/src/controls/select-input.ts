export interface SelectInputOptions {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}

export class SelectInput {
  readonly el: HTMLElement;
  private select: HTMLSelectElement;

  constructor(parent: HTMLElement, private opts: SelectInputOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-select-input";

    const label = document.createElement("label");
    label.className = "atel-control-label";
    label.textContent = opts.label;

    this.select = document.createElement("select");
    this.select.className = "atel-input";

    for (const opt of opts.options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === opts.value) o.selected = true;
      this.select.appendChild(o);
    }

    this.el.appendChild(label);
    this.el.appendChild(this.select);
    parent.appendChild(this.el);

    this.select.addEventListener("change", () => {
      opts.onChange(this.select.value);
    });
  }

  setValue(v: string): void {
    this.select.value = v;
  }
}
