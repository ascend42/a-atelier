import type { Shape, Fill, Stroke, TextStyle } from "./shape.js";
import type { Frame, Bounds, AnchorPoint } from "./coordinates.js";

/** Visual content of a layer — what it looks like */
export interface ShapeVisual {
  type: "shape";
  shape: Shape;
  fill?: Fill;
  stroke?: Stroke;
}

export interface TextVisual {
  type: "text";
  content: string;
  style: TextStyle;
}

export interface ImageVisual {
  type: "image";
  /** Asset ID reference */
  assetId: string;
}

export interface GroupVisual {
  type: "group";
}

/** A reference to another .atelier animation */
export interface RefVisual {
  type: "ref";
  /** Path to another .atelier file */
  src: string;
}

export type Visual = ShapeVisual | TextVisual | ImageVisual | GroupVisual | RefVisual;

/** A visual element in the animation */
export interface Layer {
  id: string;
  description?: string;
  tags?: string[];
  visual: Visual;
  frame: Frame;
  bounds: Bounds;
  anchorPoint?: AnchorPoint;
  /** Parent layer ID for transform inheritance */
  parentId?: string;
  /** Layer opacity 0-1 */
  opacity?: number;
  /** Rotation in degrees */
  rotation?: number;
  /** Scale factors */
  scale?: { x: number; y: number };
  /** Whether this layer is visible */
  visible?: boolean;
}
