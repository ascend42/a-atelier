import type { Color } from "./color.js";
import type { UnitValue } from "./units.js";

/** A point on a path with optional bezier handles */
export interface PathPoint {
  x: number;
  y: number;
  /** Incoming control point (relative to point) */
  in?: { x: number; y: number };
  /** Outgoing control point (relative to point) */
  out?: { x: number; y: number };
}

export interface RectShape {
  type: "rect";
  /** Corner radius */
  cornerRadius?: number | [number, number, number, number];
}

export interface EllipseShape {
  type: "ellipse";
}

export interface PathShape {
  type: "path";
  points: PathPoint[];
  closed?: boolean;
}

export type Shape = RectShape | EllipseShape | PathShape;

/** Gradient stop */
export interface GradientStop {
  offset: number; // 0-1
  color: Color;
}

export interface SolidFill {
  type: "solid";
  color: Color;
}

export interface LinearGradientFill {
  type: "linear-gradient";
  angle: number; // degrees
  stops: GradientStop[];
}

export interface RadialGradientFill {
  type: "radial-gradient";
  center: { x: UnitValue; y: UnitValue };
  radius: UnitValue;
  stops: GradientStop[];
}

export type Fill = SolidFill | LinearGradientFill | RadialGradientFill;

export interface Stroke {
  color: Color;
  width: number;
  dash?: number[];
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  strokeStart?: number; // 0-1, default 0
  strokeEnd?: number;   // 0-1, default 1
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  color: Color;
}
