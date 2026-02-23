export type AssetType = "image" | "svg" | "font" | "animation" | "audio";

/** A referenced external asset */
export interface Asset {
  type: AssetType;
  /** File path or URL */
  src: string;
  description?: string;
  /** Spritesheet metadata for image assets */
  spritesheet?: { columns: number; rows: number; frameCount?: number; frameWidth: number; frameHeight: number };
}
