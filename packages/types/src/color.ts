/** RGBA color: each channel 0-255 except alpha 0-1 */
export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** HSLA color */
export interface HSLAColor {
  h: number;
  s: number;
  l: number;
  a: number;
}

/** Hex string color like "#FF0000" or "#FF000080" */
export type HexColor = string;

/** Any supported color format */
export type Color = RGBAColor | HSLAColor | HexColor;
