/** A raw pixel value */
export type Pixel = number;

/** A percentage string like "50%" */
export type Percentage = `${number}%`;

/** Either a pixel value or percentage string */
export type UnitValue = Pixel | Percentage;
