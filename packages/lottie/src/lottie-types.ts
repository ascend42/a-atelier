/** Subset of the Lottie JSON format needed for export */

export interface LottieAnimation {
  v: string; // version
  fr: number; // frame rate
  ip: number; // in point
  op: number; // out point
  w: number; // width
  h: number; // height
  nm: string; // name
  layers: LottieLayer[];
  assets?: LottieAsset[];
}

export interface LottieLayer {
  ty: number; // type: 0=precomp, 1=solid, 2=image, 3=null, 4=shape, 5=text
  nm: string; // name
  ind: number; // index
  ip: number; // in point
  op: number; // out point
  st: number; // start time
  ks: LottieTransform; // transform
  bm?: number; // blend mode
  parent?: number; // parent index
  shapes?: LottieShapeItem[]; // for shape layers
  t?: LottieTextData; // for text layers
  refId?: string; // for image/precomp layers
  w?: number; // for image layers
  h?: number; // for image layers
}

export interface LottieTransform {
  o: LottieAnimatedValue; // opacity
  r: LottieAnimatedValue; // rotation
  p: LottieAnimatedMultiValue; // position
  a: LottieAnimatedMultiValue; // anchor point
  s: LottieAnimatedMultiValue; // scale
}

export interface LottieAnimatedValue {
  a: 0 | 1; // animated flag
  k: number | LottieKeyframe[]; // static value or keyframes
}

export interface LottieAnimatedMultiValue {
  a: 0 | 1;
  k: number[] | LottieMultiKeyframe[];
}

export interface LottieKeyframe {
  t: number; // time (frame)
  s: [number]; // start value
  e?: [number]; // end value
  i?: { x: number[]; y: number[] }; // in tangent
  o?: { x: number[]; y: number[] }; // out tangent
  h?: 0 | 1; // hold
}

export interface LottieMultiKeyframe {
  t: number;
  s: number[];
  e?: number[];
  i?: { x: number[]; y: number[] };
  o?: { x: number[]; y: number[] };
  h?: 0 | 1;
}

export interface LottieShapeItem {
  ty: string; // type
  nm?: string;
  d?: number; // direction
  // Shape-specific properties below
  [key: string]: unknown;
}

export interface LottieTextData {
  d: {
    k: [{
      s: {
        s: number; // font size
        f: string; // font family
        t: string; // text
        fc: number[]; // fill color
        j?: number; // justify
      };
      t: number; // time
    }];
  };
}

export interface LottieAsset {
  id: string;
  w?: number;
  h?: number;
  u?: string; // path
  p?: string; // filename
  e?: 0 | 1; // embedded
}
