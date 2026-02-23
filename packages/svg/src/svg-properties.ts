import type { EffectiveLayer } from "@atelier/canvas";

/** Build SVG transform attribute from effective layer values */
export function buildTransform(eff: EffectiveLayer): string {
  const parts: string[] = [];

  // Translate to position
  if (eff.x !== 0 || eff.y !== 0) {
    parts.push(`translate(${eff.x}, ${eff.y})`);
  }

  const totalRotation = eff.rotation + eff.motionPathAngle;
  if (totalRotation !== 0 || eff.scaleX !== 1 || eff.scaleY !== 1) {
    const ax = eff.anchorX * eff.width;
    const ay = eff.anchorY * eff.height;

    // Move to anchor, apply rotation/scale, move back
    if (ax !== 0 || ay !== 0) {
      parts.push(`translate(${ax}, ${ay})`);
    }
    if (totalRotation !== 0) {
      parts.push(`rotate(${totalRotation})`);
    }
    if (eff.scaleX !== 1 || eff.scaleY !== 1) {
      parts.push(`scale(${eff.scaleX}, ${eff.scaleY})`);
    }
    if (ax !== 0 || ay !== 0) {
      parts.push(`translate(${-ax}, ${-ay})`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : "";
}

/** Build common SVG style attributes */
export function buildStyleAttrs(eff: EffectiveLayer): string {
  const attrs: string[] = [];

  if (eff.opacity < 1) {
    attrs.push(`opacity="${eff.opacity}"`);
  }

  if (eff.blendMode !== "normal") {
    attrs.push(`style="mix-blend-mode: ${eff.blendMode}"`);
  }

  return attrs.join(" ");
}

/** Escape XML special characters */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
