export interface RangeSliderOptions {
  label: string;
  min: number;
  max: number;
  step?: number;
  valueLow: number;
  valueHigh: number;
  onChangeLow: (v: number) => void;
  onChangeHigh: (v: number) => void;
}

export class RangeSlider {
  readonly el: HTMLElement;
  private inputLow: HTMLInputElement;
  private inputHigh: HTMLInputElement;
  private fill: HTMLElement;

  constructor(parent: HTMLElement, private opts: RangeSliderOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-range-slider-control";

    const label = document.createElement("label");
    label.className = "atel-control-label";
    label.textContent = opts.label;
    this.el.appendChild(label);

    const slider = document.createElement("div");
    slider.className = "atel-range-slider";

    const track = document.createElement("div");
    track.className = "atel-range-slider__track";
    slider.appendChild(track);

    this.fill = document.createElement("div");
    this.fill.className = "atel-range-slider__fill";
    slider.appendChild(this.fill);

    const step = opts.step ?? 1;

    this.inputLow = document.createElement("input");
    this.inputLow.type = "range";
    this.inputLow.min = String(opts.min);
    this.inputLow.max = String(opts.max);
    this.inputLow.step = String(step);
    this.inputLow.value = String(opts.valueLow);

    this.inputHigh = document.createElement("input");
    this.inputHigh.type = "range";
    this.inputHigh.min = String(opts.min);
    this.inputHigh.max = String(opts.max);
    this.inputHigh.step = String(step);
    this.inputHigh.value = String(opts.valueHigh);

    slider.appendChild(this.inputLow);
    slider.appendChild(this.inputHigh);

    this.el.appendChild(slider);
    parent.appendChild(this.el);

    this.updateFill();

    this.inputLow.addEventListener("input", () => {
      let low = parseInt(this.inputLow.value, 10);
      const high = parseInt(this.inputHigh.value, 10);
      if (low > high) {
        low = high;
        this.inputLow.value = String(low);
      }
      this.updateFill();
      opts.onChangeLow(low);
    });

    this.inputHigh.addEventListener("input", () => {
      const low = parseInt(this.inputLow.value, 10);
      let high = parseInt(this.inputHigh.value, 10);
      if (high < low) {
        high = low;
        this.inputHigh.value = String(high);
      }
      this.updateFill();
      opts.onChangeHigh(high);
    });
  }

  setValue(low: number, high: number): void {
    this.inputLow.value = String(low);
    this.inputHigh.value = String(high);
    this.updateFill();
  }

  private updateFill(): void {
    const min = this.opts.min;
    const max = this.opts.max;
    const range = max - min || 1;
    const low = parseInt(this.inputLow.value, 10);
    const high = parseInt(this.inputHigh.value, 10);
    const left = ((low - min) / range) * 100;
    const right = ((max - high) / range) * 100;
    this.fill.style.left = `${left}%`;
    this.fill.style.right = `${right}%`;
  }
}
