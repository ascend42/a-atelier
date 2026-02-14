import type { AtelierDocument, State, Delta, AnimatableProperty, Easing } from "@atelier/types";
import { NumberInput } from "../controls/number-input.js";
import { SliderInput } from "../controls/slider-input.js";
import { ColorPicker } from "../controls/color-picker.js";
import { SelectInput } from "../controls/select-input.js";
import { EasingPicker } from "../controls/easing-picker.js";
import { RangeSlider } from "../controls/range-slider.js";
import { enableDragReorder } from "../utils/drag-reorder.js";

const ANIMATABLE_PROPERTIES: { label: string; value: AnimatableProperty }[] = [
  { label: "frame.x", value: "frame.x" },
  { label: "frame.y", value: "frame.y" },
  { label: "bounds.width", value: "bounds.width" },
  { label: "bounds.height", value: "bounds.height" },
  { label: "opacity", value: "opacity" },
  { label: "rotation", value: "rotation" },
  { label: "scale.x", value: "scale.x" },
  { label: "scale.y", value: "scale.y" },
  { label: "anchorPoint.x", value: "anchorPoint.x" },
  { label: "anchorPoint.y", value: "anchorPoint.y" },
  { label: "visual.fill.color", value: "visual.fill.color" },
  { label: "visual.stroke.color", value: "visual.stroke.color" },
  { label: "visual.stroke.width", value: "visual.stroke.width" },
  { label: "visual.shape.cornerRadius", value: "visual.shape.cornerRadius" },
  { label: "visual.style.fontSize", value: "visual.style.fontSize" },
  { label: "visual.style.color", value: "visual.style.color" },
];

export interface DeltaPanelOptions {
  doc: AtelierDocument;
  state: State;
  stateName: string;
  layerId: string;
  onDeltaChange: () => void;
}

export class DeltaPanel {
  readonly el: HTMLElement;
  private deltas: Delta[];
  private list: HTMLElement;
  private title: HTMLElement;
  private expandedIndex: number | null = null;

  constructor(parent: HTMLElement, private opts: DeltaPanelOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-prop-section";

    this.deltas = opts.state.deltas.filter((d) => d.layer === opts.layerId);

    this.title = document.createElement("div");
    this.title.className = "atel-prop-section__title atel-prop-section__title--deltas";

    const titleText = document.createElement("span");
    titleText.textContent = `Deltas (${this.deltas.length})`;
    this.title.appendChild(titleText);

    const sortBtn = document.createElement("button");
    sortBtn.className = "atel-delta-sort-btn";
    sortBtn.textContent = "\u2195 Sort";
    sortBtn.title = "Sort by start frame";
    sortBtn.addEventListener("click", () => this.sortByStartFrame());
    this.title.appendChild(sortBtn);

    this.el.appendChild(this.title);

    this.list = document.createElement("div");
    this.list.className = "atel-delta-list";
    this.el.appendChild(this.list);

    enableDragReorder({
      list: this.list,
      itemClass: "atel-delta-item",
      onReorder: (from, to) => this.reorderDelta(from, to),
    });

    this.renderList();

    // Add delta button
    const actions = document.createElement("div");
    actions.className = "atel-delta-actions";
    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Delta";
    addBtn.addEventListener("click", () => this.addDelta());
    actions.appendChild(addBtn);
    this.el.appendChild(actions);

    parent.appendChild(this.el);
  }

  private updateTitleCount(): void {
    const span = this.title.firstElementChild;
    if (span) span.textContent = `Deltas (${this.deltas.length})`;
  }

  private renderList(): void {
    this.list.innerHTML = "";
    for (let i = 0; i < this.deltas.length; i++) {
      this.list.appendChild(this.renderDelta(this.deltas[i], i));
    }
  }

  private renderDelta(delta: Delta, index: number): HTMLElement {
    const expanded = this.expandedIndex === index;
    const item = document.createElement("div");
    item.className = "atel-delta-item" + (expanded ? " atel-delta-item--expanded" : "");

    // Header row
    const header = document.createElement("div");
    header.className = "atel-delta-item__header";

    const handle = document.createElement("span");
    handle.className = "atel-drag-handle";
    handle.textContent = "\u2630";

    const prop = document.createElement("span");
    prop.className = "atel-delta-item__prop";
    prop.textContent = delta.property;

    const range = document.createElement("span");
    range.className = "atel-delta-item__range";
    range.textContent = `[${delta.range[0]}\u2013${delta.range[1]}]`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "atel-delta-item__remove";
    removeBtn.textContent = "\u2715";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.removeDelta(delta);
    });

    header.addEventListener("click", () => {
      this.expandedIndex = this.expandedIndex === index ? null : index;
      this.renderList();
    });

    header.appendChild(handle);
    if (delta.name) {
      const nameSpan = document.createElement("span");
      nameSpan.className = "atel-delta-item__name";
      nameSpan.textContent = delta.name;
      header.appendChild(nameSpan);
    }
    header.appendChild(prop);
    header.appendChild(range);
    header.appendChild(removeBtn);
    item.appendChild(header);

    if (expanded) {
      item.appendChild(this.buildEditor(delta));
    } else {
      // Detail row (collapsed summary)
      const detail = document.createElement("div");
      detail.className = "atel-delta-item__detail";
      const easingLabel = formatEasing(delta.easing);
      detail.textContent = `${formatValue(delta.from)} \u2192 ${formatValue(delta.to)}  ${easingLabel}`;
      item.appendChild(detail);

      // Mini timeline bar
      const duration = this.opts.state.duration || 1;
      const bar = document.createElement("div");
      bar.className = "atel-delta-item__minibar";
      const fill = document.createElement("div");
      fill.className = "atel-delta-item__minibar-fill";
      const left = (delta.range[0] / duration) * 100;
      const right = ((duration - delta.range[1]) / duration) * 100;
      fill.style.left = `${left}%`;
      fill.style.right = `${right}%`;
      bar.appendChild(fill);
      item.appendChild(bar);
    }

    return item;
  }

  private buildEditor(delta: Delta): HTMLElement {
    const editor = document.createElement("div");
    editor.className = "atel-delta-item__editor";

    const notify = () => this.opts.onDeltaChange();

    // Name input
    const nameRow = document.createElement("div");
    nameRow.className = "atel-delta-item__editor-row";
    const nameLabel = document.createElement("label");
    nameLabel.className = "atel-control-label";
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "atel-input";
    nameInput.placeholder = "unnamed";
    nameInput.value = delta.name ?? "";
    nameInput.addEventListener("input", () => {
      const v = nameInput.value.trim();
      delta.name = v || undefined;
      this.renderList();
      notify();
    });
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);
    editor.appendChild(nameRow);

    // Property selector
    const propRow = document.createElement("div");
    propRow.className = "atel-delta-item__editor-row";
    new SelectInput(propRow, {
      label: "Property",
      value: delta.property,
      options: ANIMATABLE_PROPERTIES,
      onChange: (v) => {
        const prev = delta.property;
        delta.property = v as AnimatableProperty;
        if (prev !== delta.property) {
          const defaults = getDefaultValues(delta.property);
          delta.from = defaults.from;
          delta.to = defaults.to;
          this.renderList();
        }
        notify();
      },
    });
    editor.appendChild(propRow);

    // From control
    const fromRow = document.createElement("div");
    fromRow.className = "atel-delta-item__editor-row";
    this.buildControlForProperty(fromRow, delta.property, "From", delta.from, (v) => {
      delta.from = v;
      notify();
    });
    editor.appendChild(fromRow);

    // To control
    const toRow = document.createElement("div");
    toRow.className = "atel-delta-item__editor-row";
    this.buildControlForProperty(toRow, delta.property, "To", delta.to, (v) => {
      delta.to = v;
      notify();
    });
    editor.appendChild(toRow);

    // Easing picker
    const easingRow = document.createElement("div");
    easingRow.className = "atel-delta-item__editor-row";
    new EasingPicker(easingRow, {
      label: "Easing",
      value: delta.easing,
      onChange: (v) => {
        delta.easing = v;
        notify();
      },
    });
    editor.appendChild(easingRow);

    // Range slider
    const sliderRow = document.createElement("div");
    sliderRow.className = "atel-delta-item__editor-row";
    const rangeSlider = new RangeSlider(sliderRow, {
      label: "Frame Range",
      min: 0,
      max: Math.max(1, this.opts.state.duration),
      step: 1,
      valueLow: delta.range[0],
      valueHigh: delta.range[1],
      onChangeLow: (v) => {
        delta.range[0] = v;
        startInput.setValue(v);
        notify();
      },
      onChangeHigh: (v) => {
        delta.range[1] = v;
        endInput.setValue(v);
        notify();
      },
    });
    editor.appendChild(sliderRow);

    // Range inputs
    const rangeRow = document.createElement("div");
    rangeRow.className = "atel-delta-item__editor-row atel-delta-item__editor-row--range";
    const startInput = new NumberInput(rangeRow, {
      label: "Start Frame",
      value: delta.range[0],
      step: 1,
      min: 0,
      onChange: (v) => {
        delta.range[0] = Math.round(v);
        rangeSlider.setValue(delta.range[0], delta.range[1]);
        notify();
      },
    });
    const endInput = new NumberInput(rangeRow, {
      label: "End Frame",
      value: delta.range[1],
      step: 1,
      min: 0,
      onChange: (v) => {
        delta.range[1] = Math.round(v);
        rangeSlider.setValue(delta.range[0], delta.range[1]);
        notify();
      },
    });
    editor.appendChild(rangeRow);

    return editor;
  }

  private buildControlForProperty(
    parent: HTMLElement,
    property: AnimatableProperty,
    label: string,
    value: unknown,
    onChange: (v: unknown) => void,
  ): void {
    if (isColorProperty(property)) {
      new ColorPicker(parent, {
        label,
        value: typeof value === "string" ? value : "#000000",
        onChange,
      });
    } else if (property === "opacity") {
      new SliderInput(parent, {
        label,
        value: typeof value === "number" ? value : 0,
        min: 0,
        max: 1,
        step: 0.01,
        onChange,
      });
    } else {
      const config = getNumberConfig(property);
      new NumberInput(parent, {
        label,
        value: typeof value === "number" ? value : 0,
        ...config,
        onChange: (v) => onChange(v),
      });
    }
  }

  private reorderDelta(from: number, to: number): void {
    const allDeltas = this.opts.state.deltas;
    const layerId = this.opts.layerId;

    // Find absolute indices of this layer's deltas in the flat array
    const absIndices: number[] = [];
    for (let i = 0; i < allDeltas.length; i++) {
      if (allDeltas[i].layer === layerId) absIndices.push(i);
    }

    const absFrom = absIndices[from];
    const [moved] = allDeltas.splice(absFrom, 1);

    // Re-scan after removal to find where to insert
    const newAbsIndices: number[] = [];
    for (let i = 0; i < allDeltas.length; i++) {
      if (allDeltas[i].layer === layerId) newAbsIndices.push(i);
    }

    let insertAt: number;
    if (to >= newAbsIndices.length) {
      // Insert after the last delta of this layer
      insertAt = (newAbsIndices.length > 0 ? newAbsIndices[newAbsIndices.length - 1] : absFrom) + 1;
    } else {
      insertAt = newAbsIndices[to];
    }

    allDeltas.splice(insertAt, 0, moved);
    this.deltas = allDeltas.filter((d) => d.layer === layerId);
    this.expandedIndex = null;
    this.renderList();
    this.opts.onDeltaChange();
  }

  private sortByStartFrame(): void {
    this.deltas.sort((a, b) => a.range[0] - b.range[0]);

    // Apply sorted order back to the flat state.deltas array
    const allDeltas = this.opts.state.deltas;
    const layerId = this.opts.layerId;

    // Remove this layer's deltas from the flat array
    const otherDeltas = allDeltas.filter((d) => d.layer !== layerId);

    // Find where the first delta of this layer was (insertion point)
    let insertAt = allDeltas.findIndex((d) => d.layer === layerId);
    if (insertAt === -1) insertAt = allDeltas.length;

    // Rebuild: other deltas before + sorted layer deltas + other deltas after
    allDeltas.length = 0;
    for (let i = 0; i < otherDeltas.length; i++) {
      allDeltas.push(otherDeltas[i]);
    }
    // Re-insert sorted deltas at original position
    for (let i = this.deltas.length - 1; i >= 0; i--) {
      allDeltas.splice(Math.min(insertAt, allDeltas.length), 0, this.deltas[i]);
    }

    this.expandedIndex = null;
    this.renderList();
    this.opts.onDeltaChange();
  }

  private addDelta(): void {
    const delta: Delta = {
      layer: this.opts.layerId,
      property: "opacity",
      range: [0, Math.max(1, this.opts.state.duration - 1)],
      from: 0,
      to: 1,
      easing: "ease-out",
    };
    this.opts.state.deltas.push(delta);
    this.deltas = this.opts.state.deltas.filter((d) => d.layer === this.opts.layerId);
    this.expandedIndex = this.deltas.length - 1;
    this.updateTitleCount();
    this.renderList();
    this.opts.onDeltaChange();
  }

  private removeDelta(delta: Delta): void {
    const idx = this.opts.state.deltas.indexOf(delta);
    if (idx !== -1) {
      this.opts.state.deltas.splice(idx, 1);
      this.deltas = this.opts.state.deltas.filter((d) => d.layer === this.opts.layerId);
      this.expandedIndex = null;
      this.updateTitleCount();
      this.renderList();
      this.opts.onDeltaChange();
    }
  }
}

function isColorProperty(p: AnimatableProperty): boolean {
  return p === "visual.fill.color" || p === "visual.stroke.color" || p === "visual.style.color";
}

function getNumberConfig(p: AnimatableProperty): { step?: number; min?: number; max?: number; suffix?: string } {
  switch (p) {
    case "frame.x":
    case "frame.y":
    case "anchorPoint.x":
    case "anchorPoint.y":
      return { step: 1 };
    case "bounds.width":
    case "bounds.height":
      return { step: 1, min: 1 };
    case "rotation":
      return { step: 1, suffix: "\u00B0" };
    case "scale.x":
    case "scale.y":
      return { step: 0.1 };
    case "visual.stroke.width":
    case "visual.shape.cornerRadius":
      return { step: 1, min: 0 };
    case "visual.style.fontSize":
      return { step: 1, min: 1 };
    default:
      return { step: 1 };
  }
}

function getDefaultValues(p: AnimatableProperty): { from: unknown; to: unknown } {
  if (isColorProperty(p)) return { from: "#000000", to: "#ffffff" };
  if (p === "opacity") return { from: 0, to: 1 };
  if (p === "scale.x" || p === "scale.y") return { from: 1, to: 2 };
  if (p === "bounds.width" || p === "bounds.height") return { from: 100, to: 200 };
  return { from: 0, to: 100 };
}

function formatValue(v: unknown): string {
  if (typeof v === "number") return v % 1 === 0 ? String(v) : (v as number).toFixed(2);
  if (typeof v === "string") return v;
  return String(v);
}

function formatEasing(e: Easing | undefined): string {
  if (!e) return "linear";
  if (typeof e === "string") return e;
  return e.type;
}
