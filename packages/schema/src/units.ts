import { z } from "zod";

/** Pixel value — any number */
export const PixelSchema = z.number();

/** Percentage string like "50%" */
export const PercentageSchema = z.string().regex(/^-?\d+(\.\d+)?%$/, {
  message: "Percentage must be a number followed by %, e.g. \"50%\"",
});

/** Either pixel or percentage */
export const UnitValueSchema = z.union([PixelSchema, PercentageSchema]);
