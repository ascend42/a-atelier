import type { AtelierDocument, State, Delta, AnimatableProperty, Easing } from "@atelier/types";

const ANIMATABLE_PROPERTIES: { label: string; value: AnimatableProperty }[] = [
  { label: "frame.x", value: "frame.x" },
  { label: "frame.y", value: "frame.y" },
  { label: "bounds.width", value: "bounds.width" },
  { label: "bounds.height", value: "bounds.height" },
  { label: "opacity", value: "opacity" },
  { label: "rotation", value: "rotation" },
  { label: "scale.x", value: "scale.x" },
  { label: "scale.y", value: "scale.y" },
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

  constructor(parent: HTMLElement, private opts: DeltaPanelOptions) {
    this.el = document.createElement("div");
    this.el.className = "atel-prop-section";

    const deltas = opts.state.deltas.filter((d) => d.layer === opts.layerId);

    const title = document.createElement("div");
    title.className = "atel-prop-section__title";
    title.textContent = `Deltas (${deltas.length})`;
    this.el.appendChild(title);

    const list = document.createElement("div");
    list.className = "atel-delta-list";

    for (const delta of deltas) {
      list.appendChild(this.renderDelta(delta));
    }
    this.el.appendChild(list);

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

  private renderDelta(delta: Delta): HTMLElement {
    const item = document.createElement("div");
    item.className = "atel-delta-item";

    // Header row
    const header = document.createElement("div");
    header.className = "atel-delta-item__header";

    const prop = document.createElement("span");
    prop.className = "atel-delta-item__prop";
    prop.textContent = delta.property;

    const range = document.createElement("span");
    range.className = "atel-delta-item__range";
    range.textContent = `[${delta.range[0]}\u2013${delta.range[1]}]`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "atel-delta-item__remove";
    removeBtn.textContent = "\u2715";
    removeBtn.addEventListener("click", () => this.removeDelta(delta));

    header.appendChild(prop);
    header.appendChild(range);
    header.appendChild(removeBtn);
    item.appendChild(header);

    // Detail row
    const detail = document.createElement("div");
    detail.className = "atel-delta-item__detail";
    const easingLabel = formatEasing(delta.easing);
    detail.textContent = `${formatValue(delta.from)} \u2192 ${formatValue(delta.to)}  ${easingLabel}`;
    item.appendChild(detail);

    return item;
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
    this.opts.onDeltaChange();
  }

  private removeDelta(delta: Delta): void {
    const idx = this.opts.state.deltas.indexOf(delta);
    if (idx !== -1) {
      this.opts.state.deltas.splice(idx, 1);
      this.opts.onDeltaChange();
    }
  }
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
