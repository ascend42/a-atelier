import type { EffectiveLayer } from "@atelier/canvas";

let filterIdCounter = 0;

export function resetFilterCounter(): void {
  filterIdCounter = 0;
}

/** Build SVG filter definition for shadow effects */
export function buildShadowFilter(eff: EffectiveLayer): { defs: string; filterRef: string } | null {
  if (!eff.shadow) return null;

  const id = `filter-${++filterIdCounter}`;
  const { color, blur, offsetX, offsetY } = eff.shadow;

  const def = [
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">`,
    `<feDropShadow dx="${offsetX}" dy="${offsetY}" stdDeviation="${blur / 2}" flood-color="${color}" />`,
    `</filter>`,
  ].join("");

  return { defs: def, filterRef: `url(#${id})` };
}
