import type { Shape, Fill, Stroke, TextStyle } from "./shape.js";
import type { Frame, Bounds, AnchorPoint } from "./coordinates.js";
import type { Shadow } from "./shadow.js";
import type { Interaction } from "./interaction.js";

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

/** Spritesheet grid definition */
export interface SpritesheetConfig {
  columns: number;
  rows: number;
  frameCount?: number;
  frameWidth: number;
  frameHeight: number;
}

export interface ImageVisual {
  type: "image";
  /** Asset ID reference */
  assetId: string;
  /** Direct URL or data-URL for rendering */
  src?: string;
  /** Source rectangle for cropping (9-arg drawImage) */
  sourceRect?: { x: number; y: number; width: number; height: number };
  /** Spritesheet grid overlay definition */
  spritesheet?: SpritesheetConfig;
  /** Current spritesheet frame index (animatable) */
  frameIndex?: number;
}

export interface GroupVisual {
  type: "group";
}

/** A reference to another .atelier animation */
export interface RefVisual {
  type: "ref";
  /** Path to another .atelier file */
  src: string;
  /** Which state to render from sub-document (defaults to first state) */
  state?: string;
  /** Which frame to render (defaults to parent frame, clamped to sub-doc duration) */
  frame?: number;
}

export type Visual = ShapeVisual | TextVisual | ImageVisual | GroupVisual | RefVisual;

/** Canvas 2D composite operations */
export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

/** Motion path definition for path-based animation */
export interface MotionPath {
  /** Path points defining the motion trajectory */
  points: import("./shape.js").PathPoint[];
  /** Whether the path is closed */
  closed?: boolean;
  /** Auto-rotate layer to follow path tangent */
  autoRotate?: boolean;
  /** Rotation offset in degrees when autoRotate is enabled */
  autoRotateOffset?: number;
}

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
  /** Drop shadow / glow */
  shadow?: Shadow;
  /** Blend mode for compositing */
  blendMode?: BlendMode;
  /** Motion path for path-based position animation */
  motionPath?: MotionPath;
  /** Clip path — restricts rendering to within a shape */
  clipPath?: import("./shape.js").Shape;
  /** Color tint overlay */
  tint?: { color: string; amount: number };
  /** Interactive trigger-action bindings */
  interactions?: Interaction[];
}
