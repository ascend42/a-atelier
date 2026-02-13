export type AssetType = "image" | "svg" | "font" | "animation";

/** A referenced external asset */
export interface Asset {
  type: AssetType;
  /** File path or URL */
  src: string;
  description?: string;
}
